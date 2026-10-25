import { describe, expect } from "bun:test"
import { Effect, Schema, SchemaTransformation } from "effect"
import { asc, eq } from "drizzle-orm"
import { Agent } from "@opencode/core/agent"
import { Bus } from "@opencode/core/bus"
import { Database } from "@opencode/core/database/database"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { EventTable } from "@opencode/core/event/sql"
import { Model } from "@opencode/core/model"
import { Project } from "@opencode/core/project"
import { ProjectTable } from "@opencode/core/project/sql"
import { Provider } from "@opencode/core/provider"
import { AbsolutePath } from "@opencode/core/schema"
import { Session } from "@opencode/core/session"
import { SessionEvent } from "@opencode/core/session/event"
import { SessionInbox } from "@opencode/core/session/inbox"
import { SessionProjector } from "@opencode/core/session/projector"
import { SessionMessageTable, SessionTable } from "@opencode/core/session/sql"
import { SessionStore } from "@opencode/core/session/store"
import { Event } from "@opencode/schema/event"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { testEffect } from "./lib/effect"

// Default Bus configuration: durable payloads are not persisted.
const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([Database.node, Bus.node, SessionProjector.node, SessionInbox.node, SessionStore.node]),
  ),
)
const sessionID = Session.ID.make("ses_unpersisted_test")
const model = { id: Model.ID.make("model"), providerID: Provider.ID.make("provider") }

let encodes = 0
const Counted = Bus.durable({
  type: "test.counted",
  durable: { version: 1, aggregate: "id" },
  schema: {
    id: Schema.String,
    text: Schema.String.pipe(
      Schema.decodeTo(
        Schema.String,
        SchemaTransformation.transform({
          decode: (value: string) => value,
          encode: (value: string) => {
            encodes++
            return value
          },
        }),
      ),
    ),
  },
})

const seedSession = Effect.gen(function* () {
  const db = (yield* Database.Service).db
  yield* db
    .insert(ProjectTable)
    .values({ id: Project.ID.global, worktree: AbsolutePath.make("/project"), sandboxes: [] })
    .run()
  yield* db
    .insert(SessionTable)
    .values({
      id: sessionID,
      project_id: Project.ID.global,
      slug: "test",
      directory: "/project",
      title: "test",
      version: "test",
      agent: Agent.ID.make("plan"),
    })
    .run()
  return db
})

describe("Bus without persistence", () => {
  it.effect("projects increasing message sequences and advances the latest sequence", () =>
    Effect.gen(function* () {
      const db = yield* seedSession
      const bus = yield* Bus.Service

      yield* bus.publish(SessionEvent.AgentSelected, { sessionID, agent: Agent.defaultID })
      yield* bus.publish(SessionEvent.ModelSelected, { sessionID, model })
      yield* bus.publish(SessionEvent.Synthetic, { sessionID, text: "context" })

      const rows = yield* db
        .select({ seq: SessionMessageTable.seq })
        .from(SessionMessageTable)
        .where(eq(SessionMessageTable.session_id, sessionID))
        .orderBy(asc(SessionMessageTable.seq))
        .all()
        .pipe(Effect.orDie)
      expect(rows.map((row) => row.seq)).toEqual([0, 1, 2])
      expect(yield* Bus.latestSequence(db, sessionID)).toBe(2)
      expect(yield* db.select().from(EventTable).where(eq(EventTable.aggregate_id, sessionID)).all()).toEqual([])
    }),
  )

  it.effect("supports the title path's optimistic sequence check", () =>
    Effect.gen(function* () {
      const db = yield* seedSession
      const bus = yield* Bus.Service
      const rename = (title: string, expected: number) =>
        bus.publish(
          SessionEvent.Renamed,
          { sessionID, title },
          { commit: (seq) => (seq === expected ? Effect.void : Effect.die("stale")) },
        )

      yield* bus.publish(SessionEvent.Synthetic, { sessionID, text: "context" })
      const expected = (yield* Bus.latestSequence(db, sessionID)) + 1
      const event = yield* rename("fresh", expected)
      expect(event.durable?.seq).toBe(Event.Seq.make(expected))

      const stale = expected
      yield* bus.publish(SessionEvent.Synthetic, { sessionID, text: "more" })
      const exit = yield* rename("stale", stale).pipe(Effect.exit)
      expect(String(exit)).toContain("stale")
      expect(yield* Bus.latestSequence(db, sessionID)).toBe(expected + 1)
    }),
  )

  it.effect("does not encode payloads it does not store", () =>
    Effect.gen(function* () {
      const bus = yield* Bus.Service
      encodes = 0

      const first = yield* bus.publish(Counted, { id: "counted", text: "one" })
      yield* bus.publishAll([
        [Counted, { id: "counted", text: "two" }],
        [Counted, { id: "counted", text: "three" }],
      ])

      expect(first.durable?.seq).toBe(Event.Seq.make(0))
      expect(encodes).toBe(0)
    }),
  )
})
