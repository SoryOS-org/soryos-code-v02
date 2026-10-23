import { $ } from "bun"
import { describe, expect } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { Effect } from "effect"
import { Agent } from "@opencode/core/agent"
import { Bus } from "@opencode/core/bus"
import { Database } from "@opencode/core/database/database"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { LocationServiceMap } from "@opencode/core/location-service-map"
import { Model } from "@opencode/core/model"
import { Plugin } from "@opencode/core/plugin"
import { Provider } from "@opencode/core/provider"
import { AbsolutePath } from "@opencode/core/schema"
import { Session } from "@opencode/core/session"
import { SessionEvent } from "@opencode/core/session/event"
import { SessionExecution } from "@opencode/core/session/execution"
import { SessionInbox } from "@opencode/core/session/inbox"
import { SessionMessage } from "@opencode/core/session/message"
import { SessionProjector } from "@opencode/core/session/projector"
import { SessionStats } from "@opencode/core/session/stats"
import { SessionMessageTable, SessionRevertUsageTable, SessionTable } from "@opencode/core/session/sql"
import { and, asc, eq } from "drizzle-orm"
import { Snapshot } from "@opencode/core/snapshot"
import { Money } from "@opencode/schema/money"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { Global } from "@opencode/util/global"
import { tempGlobalLayer } from "./fixture/global"
import { offlineModels } from "./fixture/models"
import { tmpdirScoped } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([Database.node, Bus.node, SessionProjector.node, Session.node, LocationServiceMap.node]),
    [
      Bus.node.replace(Bus.configured({ persist: true })),
      Global.node.replace(tempGlobalLayer),
      SessionExecution.node.replace(SessionExecution.noopLayer),
      offlineModels,
    ],
  ),
)

describe("Session.revert files", () => {
  it.live(
    "undoes and restores a file rename without losing either path",
    () =>
      Effect.gen(function* () {
        const tmp = yield* tmpdirScoped()
        const directory = path.join(tmp.path, "project")
        const original = path.join(directory, "old name.txt")
        const renamed = path.join(directory, "new name.txt")
        yield* Effect.promise(async () => {
          await fs.mkdir(directory)
          await Bun.write(original, "Preserve this content.\n")
          await Bun.write(path.join(directory, "unrelated.txt"), "Unrelated content.\n")
          await $`git init -q`.cwd(directory).quiet()
          await $`git -c core.fsmonitor=false add .`.cwd(directory).quiet()
        })

        const session = yield* Session.Service
        const database = yield* Database.Service
        const bus = yield* Bus.Service
        const created = yield* session.create({ location: { directory: AbsolutePath.make(directory) } })
        const prompt = yield* session.prompt({ sessionID: created.id, text: "Rename the file", resume: false })
        yield* SessionInbox.promote(database.db, bus, created.id, "steer")

        yield* Effect.gen(function* () {
          const plugins = yield* Plugin.Service
          yield* plugins.awaitActivation
          const snapshot = yield* Snapshot.Service
          const before = yield* snapshot.capture()
          if (!before) throw new Error("Initial snapshot missing")
          const assistantMessageID = SessionMessage.ID.create()
          yield* bus.publish(SessionEvent.Step.Started, {
            sessionID: created.id,
            assistantMessageID,
            agent: Agent.defaultID,
            model: { id: Model.ID.make("test-model"), providerID: Provider.ID.make("test-provider") },
            snapshot: before,
            started: 0,
          })
          yield* Effect.promise(() => fs.rename(original, renamed))
          const after = yield* snapshot.capture()
          if (!after) throw new Error("Renamed snapshot missing")
          yield* bus.publish(SessionEvent.Step.Ended, {
            sessionID: created.id,
            assistantMessageID,
            finish: "stop",
            cost: Money.USD.zero,
            tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
            snapshot: after,
            files: yield* snapshot.files({ from: before, to: after }),
          })

          yield* Effect.promise(() => Bun.write(path.join(directory, "unrelated.txt"), "Keep this later edit.\n"))
          const reverted = yield* session.revert.stage({ sessionID: created.id, messageID: prompt.id })
          expect({
            original: yield* Effect.promise(() => Bun.file(original).exists()),
            renamed: yield* Effect.promise(() => Bun.file(renamed).exists()),
          }).toEqual({ original: true, renamed: false })
          expect(yield* Effect.promise(() => Bun.file(original).text())).toBe("Preserve this content.\n")
          expect(reverted.files?.map((file) => [file.file, file.status])).toEqual([
            ["new name.txt", "deleted"],
            ["old name.txt", "added"],
          ])
          expect(yield* Effect.promise(() => Bun.file(path.join(directory, "unrelated.txt")).text())).toBe(
            "Keep this later edit.\n",
          )

          yield* session.revert.clear(created.id)
          expect(yield* Effect.promise(() => Bun.file(original).exists())).toBe(false)
          expect(yield* Effect.promise(() => Bun.file(renamed).text())).toBe("Preserve this content.\n")
          expect(yield* Effect.promise(() => Bun.file(path.join(directory, "unrelated.txt")).text())).toBe(
            "Keep this later edit.\n",
          )
          expect((yield* session.get(created.id)).revert).toBeUndefined()
        }).pipe(Effect.provide(LocationServiceMap.Service.get(created.location)))
      }),
    // Real Location/plugin startup and Git snapshots can exceed five seconds under CI load.
    { timeout: 15_000 },
  )
})

// The production bus only persists events on workerd; local CLI and server runs deliver
// events in memory with an empty event table. These tests use the default (non-persisting)
// bus to prove stats keep reverted usage where the CLI and server actually run.
const itEphemeral = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([Database.node, Bus.node, SessionProjector.node, Session.node, LocationServiceMap.node]),
    [
      Global.node.replace(tempGlobalLayer),
      SessionExecution.node.replace(SessionExecution.noopLayer),
      offlineModels,
    ],
  ),
)

describe("Session.revert stats", () => {
  const initProject = (directory: string) =>
    Effect.promise(async () => {
      await fs.mkdir(directory, { recursive: true })
      await $`git init -q`.cwd(directory).quiet()
    })

  const prompt = Effect.fnUntraced(function* (sessionID: Session.ID, text: string) {
    const session = yield* Session.Service
    const database = yield* Database.Service
    const bus = yield* Bus.Service
    const admitted = yield* session.prompt({ sessionID, text, resume: false })
    yield* SessionInbox.promote(database.db, bus, sessionID, "steer")
    return admitted
  })

  // One assistant step with fixed usage; returns the assistant message id.
  const step = Effect.fnUntraced(function* (sessionID: Session.ID) {
    const bus = yield* Bus.Service
    const snapshot = yield* Snapshot.Service
    const before = yield* snapshot.capture()
    if (!before) throw new Error("Initial snapshot missing")
    const assistantMessageID = SessionMessage.ID.create()
    yield* bus.publish(SessionEvent.Step.Started, {
      sessionID,
      assistantMessageID,
      agent: Agent.defaultID,
      model: { id: Model.ID.make("test-model"), providerID: Provider.ID.make("test-provider") },
      snapshot: before,
      started: 0,
    })
    const after = yield* snapshot.capture()
    if (!after) throw new Error("Snapshot missing")
    yield* bus.publish(SessionEvent.Step.Ended, {
      sessionID,
      assistantMessageID,
      finish: "stop",
      cost: Money.USD.make(0.5),
      tokens: { input: 1000, output: 100, reasoning: 10, cache: { read: 5, write: 3 } },
      snapshot: after,
      files: yield* snapshot.files({ from: before, to: after }),
    })
    return assistantMessageID
  })

  itEphemeral.live(
    "keeps reverted step usage in stats without double counting session totals",
    () =>
      Effect.gen(function* () {
        const tmp = yield* tmpdirScoped()
        const directory = path.join(tmp.path, "project")
        yield* initProject(directory)

        const session = yield* Session.Service
        const database = yield* Database.Service
        const created = yield* session.create({ location: { directory: AbsolutePath.make(directory) } })

        yield* Effect.gen(function* () {
          const plugins = yield* Plugin.Service
          yield* plugins.awaitActivation

          yield* prompt(created.id, "First")
          yield* step(created.id)
          const second = yield* prompt(created.id, "Second")
          yield* step(created.id)

          const before = yield* SessionStats.get({ timezone: "UTC", tools: "none" })
          expect(before.tokens).toEqual({
            input: 2000,
            output: 200,
            reasoning: 20,
            cache: { read: 10, write: 6 },
          })

          // Prompting with a staged revert commits it, deleting the second exchange's message rows.
          yield* session.revert.stage({ sessionID: created.id, messageID: second.id })
          yield* prompt(created.id, "Third")

          const stats = yield* SessionStats.get({ timezone: "UTC", tools: "none" })
          expect(stats.tokens).toEqual({
            input: 2000,
            output: 200,
            reasoning: 20,
            cache: { read: 10, write: 6 },
          })
          expect(stats.cost).toBe(Money.USD.make(1))

          const row = yield* database.db
            .select()
            .from(SessionTable)
            .where(eq(SessionTable.id, created.id))
            .get()
            .pipe(Effect.orDie)
          expect(row?.tokens_input).toBe(2000)
          expect(row?.tokens_output).toBe(200)
          expect(row?.tokens_reasoning).toBe(20)
          expect(row?.tokens_cache_read).toBe(10)
          expect(row?.tokens_cache_write).toBe(6)
          expect(row?.cost).toBe(1)
        }).pipe(Effect.provide(LocationServiceMap.Service.get(created.location)))
      }),
    { timeout: 15_000 },
  )

  itEphemeral.live(
    "does not recount parent rows a fork copied when the fork reverts them",
    () =>
      Effect.gen(function* () {
        const tmp = yield* tmpdirScoped()
        const directory = path.join(tmp.path, "project")
        yield* initProject(directory)

        const session = yield* Session.Service
        const database = yield* Database.Service
        const bus = yield* Bus.Service
        const created = yield* session.create({ location: { directory: AbsolutePath.make(directory) } })

        yield* Effect.gen(function* () {
          const plugins = yield* Plugin.Service
          yield* plugins.awaitActivation

          yield* prompt(created.id, "First")
          yield* step(created.id)
          yield* prompt(created.id, "Second")
          const secondStep = yield* step(created.id)

          const forkID = Session.ID.make("ses_revert_stats_fork")
          yield* bus.publish(SessionEvent.Forked, {
            sessionID: forkID,
            parentID: created.id,
            boundary: { type: "through", messageID: secondStep },
          })

          // The revert boundary is the fork's copy of the second prompt, not the original.
          const copied = yield* database.db
            .select({ id: SessionMessageTable.id })
            .from(SessionMessageTable)
            .where(and(eq(SessionMessageTable.session_id, forkID), eq(SessionMessageTable.type, "user")))
            .orderBy(asc(SessionMessageTable.seq))
            .all()
            .pipe(Effect.orDie)
          expect(copied.length).toBe(2)

          yield* session.revert.stage({ sessionID: forkID, messageID: copied[1].id })
          yield* prompt(forkID, "Third")

          // The fork's copied second exchange must not be counted again (the filter matches
          // SessionStats: copied rows belong to the parent's stats). No new usage was produced,
          // so totals stay exactly where they were.
          const stats = yield* SessionStats.get({ timezone: "UTC", tools: "none" })
          expect(stats.tokens).toEqual({
            input: 2000,
            output: 200,
            reasoning: 20,
            cache: { read: 10, write: 6 },
          })
          expect(stats.cost).toBe(Money.USD.make(1))

          const preserved = yield* database.db
            .select({ id: SessionRevertUsageTable.id })
            .from(SessionRevertUsageTable)
            .all()
            .pipe(Effect.orDie)
          expect(preserved.length).toBe(0)
        }).pipe(Effect.provide(LocationServiceMap.Service.get(created.location)))
      }),
    { timeout: 15_000 },
  )
})
