import { $ } from "bun"
import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { Effect } from "effect"
import { Agent } from "@opencode/core/agent"
import { Bus } from "@opencode/core/bus"
import { Database } from "@opencode/core/database/database"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { LocationServiceMap } from "@opencode/core/location-service-map"
import { Model } from "@opencode/core/model"
import { Provider } from "@opencode/core/provider"
import { AbsolutePath } from "@opencode/core/schema"
import { Session } from "@opencode/core/session"
import { SessionEvent } from "@opencode/core/session/event"
import { SessionExecution } from "@opencode/core/session/execution"
import { SessionMessage } from "@opencode/core/session/message"
import { SessionProjector } from "@opencode/core/session/projector"
import { SessionReview } from "@opencode/core/session/review"
import { fileDiff } from "@opencode/core/tool/plugin/file-diff"
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

describe("SessionReview.hunks", () => {
  test("reconstructs hunk regions byte-exact across CRLF and no-newline ends", () => {
    const patch = [
      "Index: f",
      "===================================================================",
      "--- f",
      "+++ f",
      "@@ -1,4 +1,4 @@",
      " a\r",
      "-b\r",
      "-x\r",
      " c\r",
      "+y\r",
      "+c\r",
    ].join("\n")
    const [hunk] = SessionReview.parseHunks(patch)
    expect(hunk?.before).toBe("a\r\nb\r\nx\r\nc\r\n")
    expect(hunk?.after).toBe("a\r\nc\r\ny\r\nc\r\n")
    expect(hunk?.newStart).toBe(1)

    const deletion = SessionReview.parseHunks("@@ -1,3 +0,0 @@\n-a\n-b\n-c\n")[0]
    expect(deletion?.before).toBe("a\nb\nc\n")
    expect(deletion?.after).toBe("")

    const [first, second] = SessionReview.parseHunks("@@ -1,2 +1,2 @@\n a\n-b\n+B\n@@ -10,2 +10,2 @@\n j\n-k\n+K\n")
    expect(first?.before).toBe("a\nb\n")
    expect(first?.after).toBe("a\nB\n")
    expect(second?.newStart).toBe(10)
    expect(second?.after).toBe("j\nK\n")
  })

  test("indexes changes in metadata.files then hunk order", () => {
    const files = [
      fileDiff(
        "one.txt",
        "a\nb\nc\nd\ne\nf\ng\nh\ni\nj\nk\nl\nm\nn\no\n",
        "a\nB\nc\nd\ne\nf\ng\nh\ni\nj\nk\nl\nm\nn\nO\n",
      ),
      fileDiff("two.txt", "", "created\n"),
    ]
    const changes = SessionReview.fileChanges(files)
    expect(changes.map((change) => [change.index, change.file.file])).toEqual([
      [0, "one.txt"],
      [1, "one.txt"],
      [2, "two.txt"],
    ])
    expect(changes[0]?.hunk?.after).toContain("B")
    expect(changes[1]?.hunk?.after).toContain("O")
    expect(changes[2]?.hunk).toEqual({ before: "", after: "created\n", newStart: 1 })
  })
})

describe("Session.review", () => {
  it.live(
    "discards one change and keeps the rest of the call applied",
    () =>
      Effect.gen(function* () {
        const tmp = yield* tmpdirScoped()
        const directory = path.join(tmp.path, "project")
        const file = path.join(directory, "code.txt")
        const before = "a\nb\nc\nd\ne\nf\ng\nh\ni\nj\nk\nl\nm\nn\no\n"
        const after = "a\nB\nc\nd\ne\nf\ng\nh\ni\nj\nk\nl\nm\nn\nO\n"
        yield* Effect.promise(async () => {
          await fs.mkdir(directory)
          await Bun.write(file, before)
          await $`git init -q`.cwd(directory).quiet()
          await $`git -c core.fsmonitor=false add .`.cwd(directory).quiet()
        })

        const session = yield* Session.Service
        const created = yield* session.create({ location: { directory: AbsolutePath.make(directory) } })
        yield* Effect.gen(function* () {
          const bus = yield* Bus.Service
          const messageID = SessionMessage.ID.create()
          yield* bus.publish(SessionEvent.Step.Started, {
            sessionID: created.id,
            assistantMessageID: messageID,
            agent: Agent.defaultID,
            model: { id: Model.ID.make("test-model"), providerID: Provider.ID.make("test-provider") },
            started: 0,
          })
          yield* bus.publish(SessionEvent.Tool.Input.Started, {
            sessionID: created.id,
            assistantMessageID: messageID,
            id: "call_1",
            name: "edit",
          })
          yield* bus.publish(SessionEvent.Tool.Called, {
            sessionID: created.id,
            assistantMessageID: messageID,
            id: "call_1",
            input: {},
            executed: true,
          })
          yield* bus.publish(SessionEvent.Tool.Success, {
            sessionID: created.id,
            assistantMessageID: messageID,
            id: "call_1",
            content: [{ type: "text", text: "Edited code.txt" }],
            metadata: { files: [fileDiff("code.txt", before, after)] },
            executed: true,
          })
          yield* Effect.promise(() => Bun.write(file, after))

          yield* session.review.discard({ sessionID: created.id, messageID, partID: "call_1", changes: [0] })
          expect(yield* Effect.promise(() => Bun.file(file).text())).toBe(
            "a\nb\nc\nd\ne\nf\ng\nh\ni\nj\nk\nl\nm\nn\nO\n",
          )

          yield* session.review.keep({ sessionID: created.id, messageID, partID: "call_1", changes: [1] })
          const message = yield* session.message({ sessionID: created.id, messageID })
          const part = message?.type === "assistant" ? message.content.find((item) => item.type === "tool") : undefined
          expect(part?.type === "tool" ? part.review?.changes : undefined).toEqual(["discarded", "kept"])
          expect(yield* Effect.promise(() => Bun.file(file).text())).toBe(
            "a\nb\nc\nd\ne\nf\ng\nh\ni\nj\nk\nl\nm\nn\nO\n",
          )
        }).pipe(Effect.provide(LocationServiceMap.Service.get(created.location)))
      }),
    // Real Location/plugin startup can exceed five seconds under CI load.
    { timeout: 15_000 },
  )

  it.live(
    "discarding a creation removes the file and a drifted region refuses",
    () =>
      Effect.gen(function* () {
        const tmp = yield* tmpdirScoped()
        const directory = path.join(tmp.path, "project")
        const created = path.join(directory, "new.txt")
        const edited = path.join(directory, "edited.txt")
        yield* Effect.promise(async () => {
          await fs.mkdir(directory)
          await Bun.write(edited, "keep\nchange me\nkeep\n")
          await $`git init -q`.cwd(directory).quiet()
          await $`git -c core.fsmonitor=false add .`.cwd(directory).quiet()
        })

        const session = yield* Session.Service
        const info = yield* session.create({ location: { directory: AbsolutePath.make(directory) } })
        yield* Effect.gen(function* () {
          const bus = yield* Bus.Service
          const messageID = SessionMessage.ID.create()
          yield* bus.publish(SessionEvent.Step.Started, {
            sessionID: info.id,
            assistantMessageID: messageID,
            agent: Agent.defaultID,
            model: { id: Model.ID.make("test-model"), providerID: Provider.ID.make("test-provider") },
            started: 0,
          })
          const call = (id: string, name: string, files: ReturnType<typeof fileDiff>[]) =>
            Effect.gen(function* () {
              yield* bus.publish(SessionEvent.Tool.Input.Started, {
                sessionID: info.id,
                assistantMessageID: messageID,
                id,
                name,
              })
              yield* bus.publish(SessionEvent.Tool.Called, {
                sessionID: info.id,
                assistantMessageID: messageID,
                id,
                input: {},
                executed: true,
              })
              yield* bus.publish(SessionEvent.Tool.Success, {
                sessionID: info.id,
                assistantMessageID: messageID,
                id,
                content: [{ type: "text", text: "ok" }],
                metadata: { files },
                executed: true,
              })
            })
          yield* call("call_write", "write", [fileDiff("new.txt", "", "hello\n", "added")])
          yield* call("call_edit", "edit", [fileDiff("edited.txt", "keep\nchange me\nkeep\n", "keep\nchanged\nkeep\n")])
          yield* Effect.promise(async () => {
            await Bun.write(created, "hello\n")
            await Bun.write(edited, "keep\nchanged\nkeep\n")
          })

          yield* session.review.discard({ sessionID: info.id, messageID, partID: "call_write" })
          expect(yield* Effect.promise(() => Bun.file(created).exists())).toBe(false)

          yield* Effect.promise(() => Bun.write(edited, "keep\ndrifted\nkeep\n"))
          const error = yield* session.review
            .discard({ sessionID: info.id, messageID, partID: "call_edit" })
            .pipe(Effect.flip)
          expect(error._tag).toBe("Session.ReviewConflictError")
          expect(yield* Effect.promise(() => Bun.file(edited).text())).toBe("keep\ndrifted\nkeep\n")
        }).pipe(Effect.provide(LocationServiceMap.Service.get(info.location)))
      }),
    // Real Location/plugin startup can exceed five seconds under CI load.
    { timeout: 15_000 },
  )
})
