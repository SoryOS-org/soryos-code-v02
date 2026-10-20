import { expect } from "bun:test"
import { OpenAICompatible } from "@opencode/ai/providers"
import { Agent } from "@opencode/core/agent"
import { Bus } from "@opencode/core/bus"
import { Database } from "@opencode/core/database/database"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { llmClient } from "@opencode/core/effect/app-node-platform"
import { PluginHooks } from "@opencode/core/plugin/hooks"
import { Location } from "@opencode/core/location"
import { Project } from "@opencode/core/project"
import { ProjectTable } from "@opencode/core/project/sql"
import { AbsolutePath } from "@opencode/core/schema"
import { SessionCompaction } from "@opencode/core/session/compaction"
import { SessionEvent } from "@opencode/core/session/event"
import { SessionInbox } from "@opencode/core/session/inbox"
import { SessionMessage } from "@opencode/core/session/message"
import { SessionModelRequest } from "@opencode/core/session/model-request"
import { SessionProjector } from "@opencode/core/session/projector"
import { SessionRunnerModel } from "@opencode/core/session/runner/model"
import { SessionSchema } from "@opencode/core/session/schema"
import { SessionStore } from "@opencode/core/session/store"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { Deferred, Effect, Fiber, Schema } from "effect"
import { testEffect } from "./lib/effect"

const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([
      Database.node,
      Bus.node,
      SessionProjector.node,
      SessionStore.node,
      SessionInbox.node,
      SessionCompaction.node,
      SessionModelRequest.node,
      PluginHooks.node,
      llmClient,
    ]),
    [
      Bus.node.replace(Bus.configured({ persist: true })),
      Location.node.replace(Location.boundNode({ directory: AbsolutePath.make("/project") })),
    ],
  ),
)

const setup = Effect.fnUntraced(function* (
  finish: "stop" | "length" | "content_filter",
  options: {
    single?: boolean
    hang?: boolean
    sequence?: readonly ("overflow" | "length" | "stop")[]
    messages?: readonly string[]
  } = {},
) {
  const db = (yield* Database.Service).db
  const bus = yield* Bus.Service
  const store = yield* SessionStore.Service
  const inbox = yield* SessionInbox.Service
  const compaction = yield* SessionCompaction.Service
  const bodies: Record<string, unknown>[] = []
  const blocked = Deferred.makeUnsafe<void>()
  const hanging = Promise.withResolvers<Response>()
  const server = yield* Effect.acquireRelease(
    Effect.sync(() =>
      Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        async fetch(request) {
          bodies.push(
            Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)))(
              await request.text(),
            ),
          )
          if (options.hang && bodies.length === 2) {
            Deferred.doneUnsafe(blocked, Effect.void)
            return hanging.promise
          }
          const reason =
            options.sequence?.[bodies.length - 1] ??
            (finish === "content_filter" || bodies.length > 1 ? finish : "length")
          if (reason === "overflow") {
            return Response.json(
              {
                error: {
                  message: "Your input exceeds the context window",
                  type: "invalid_request_error",
                  code: "context_length_exceeded",
                },
              },
              { status: 400 },
            )
          }
          const chunks = [
            {
              delta: { content: reason === "stop" ? "## Objective\n- Complete summary" : "TRUNCATED" },
              finish_reason: null,
            },
            { delta: {}, finish_reason: reason },
          ]
          return new Response(
            chunks
              .map((choice) => `data: ${JSON.stringify({ id: "summary", choices: [{ index: 0, ...choice }] })}\n\n`)
              .join("") + "data: [DONE]\n\n",
            { headers: { "content-type": "text/event-stream" } },
          )
        },
      }),
    ),
    (server) =>
      Effect.sync(() => {
        hanging.resolve(new Response("cancelled"))
        void server.stop(true)
      }),
  )
  const model = SessionRunnerModel.resolved(
    OpenAICompatible.configure({ apiKey: "fixture", baseURL: server.url.toString() }).model("summary"),
    {
      capabilities: { tools: true, input: ["text"], output: ["text"] },
      cost: [],
      limit: { context: 200_000, output: 32_000 },
    },
  )
  const sessionID = SessionSchema.ID.create()
  yield* db
    .insert(ProjectTable)
    .values({ id: Project.ID.global, worktree: AbsolutePath.make("/project"), sandboxes: [] })
    .run()
  yield* bus.publish(SessionEvent.Created, {
    sessionID,
    projectID: Project.ID.global,
    location: { directory: AbsolutePath.make("/project") },
    slug: "summary-length",
    version: "test",
  })
  // Real admitted messages let failure assertions inspect the unchanged durable history.
  for (const text of options.messages ??
    (options.single ? ["latest"] : ["oldest", "middle", "latest"]).map((label) => `${label} ${"x".repeat(120_000)}`)) {
    const id = SessionMessage.ID.create()
    yield* inbox.admit({
      id,
      sessionID,
      item: { type: "user", payload: { text }, delivery: "steer" },
    })
    yield* bus.publish(SessionEvent.InboxDelivered, { sessionID, inboxID: id })
  }
  const session = yield* store.get(sessionID)
  if (!session) return yield* Effect.die("Missing fixture session")
  const messages = yield* store.context(sessionID)
  const inputID = SessionMessage.ID.create()
  yield* bus.publish(SessionEvent.Compaction.Started, { sessionID, reason: "manual", recent: "", inputID })
  const compact = compaction.compact({
    reason: "manual",
    inputID,
    context: {
      session,
      messages,
      model,
      initial: "Current instructions",
      agent: { id: Agent.defaultID, info: Agent.Info.default(Agent.defaultID) },
      tools: { definitions: [], execute: () => Effect.die("Compaction must not dispatch tools") },
    },
  })
  return { compact, bodies, store, sessionID, messages, blocked }
})

it.live("a truncated summary retries once with less history and persists only the complete summary", () =>
  Effect.gen(function* () {
    const fixture = yield* setup("stop")
    expect(yield* fixture.compact).toEqual({ status: "completed" })
    expect(fixture.bodies).toHaveLength(2)
    expect(JSON.stringify(fixture.bodies[1]).length).toBeLessThan(JSON.stringify(fixture.bodies[0]).length)
    const history = yield* fixture.store.context(fixture.sessionID)
    expect(history).toMatchObject([
      {
        type: "compaction",
        status: "completed",
        summary: "## Objective\n- Complete summary",
        recent: expect.stringContaining("latest"),
      },
    ])
    expect(JSON.stringify(history)).not.toContain("TRUNCATED")
  }),
)

it.live("a second truncated summary fails visibly without another retry or losing the original history", () =>
  Effect.gen(function* () {
    const fixture = yield* setup("length")
    expect(yield* fixture.compact).toMatchObject({
      status: "failed",
      error: { message: "Compaction summary reached the output token limit" },
    })
    expect(fixture.bodies).toHaveLength(2)
    const history = yield* fixture.store.context(fixture.sessionID)
    expect(history.filter((message) => message.type === "user")).toEqual(
      fixture.messages.filter((message) => message.type === "user"),
    )
    expect(history.some((message) => message.type === "compaction" && message.status === "completed")).toBe(false)
  }),
)

it.live("content filtering does not spend the length recovery allowance", () =>
  Effect.gen(function* () {
    const fixture = yield* setup("content_filter")
    expect(yield* fixture.compact).toMatchObject({ status: "failed" })
    expect(fixture.bodies).toHaveLength(1)
  }),
)

it.live("an unshrinkable latest exchange keeps the length failure without resending the same request", () =>
  Effect.gen(function* () {
    const fixture = yield* setup("stop", { single: true })
    expect(yield* fixture.compact).toMatchObject({
      status: "failed",
      error: { message: "Compaction summary reached the output token limit" },
    })
    expect(fixture.bodies).toHaveLength(1)
    expect((yield* fixture.store.context(fixture.sessionID)).filter((message) => message.type === "user")).toEqual(
      fixture.messages.filter((message) => message.type === "user"),
    )
  }),
)

it.live("cancelling the smaller request preserves the original history and does not start another retry", () =>
  Effect.gen(function* () {
    const fixture = yield* setup("stop", { hang: true })
    const fiber = yield* fixture.compact.pipe(Effect.forkScoped)
    yield* Deferred.await(fixture.blocked)
    yield* Fiber.interrupt(fiber)
    expect(fixture.bodies).toHaveLength(2)
    const history = yield* fixture.store.context(fixture.sessionID)
    expect(history.filter((message) => message.type === "user")).toEqual(
      fixture.messages.filter((message) => message.type === "user"),
    )
    expect(history.some((message) => message.type === "compaction" && message.status === "completed")).toBe(false)
  }),
)

for (const sequence of [
  ["overflow", "length", "overflow"],
  ["length", "overflow"],
] as const) {
  it.live(`mixed ${sequence.join(" → ")} compaction errors never resend a rejected size`, () =>
    Effect.gen(function* () {
      const fixture = yield* setup("stop", { sequence })
      const outcome = yield* fixture.compact
      const sizes = fixture.bodies.map((body) => JSON.stringify(body.messages).length)
      expect(outcome.status).toBe(sequence[0] === "overflow" ? "failed" : "completed")
      expect(fixture.bodies.length).toBeLessThanOrEqual(4)
      for (let index = 1; index < sizes.length; index++) {
        expect(sizes[index]).toBeLessThan(sizes[index - 1])
      }
      if (outcome.status === "failed") {
        const history = yield* fixture.store.context(fixture.sessionID)
        expect(history.filter((message) => message.type === "user")).toEqual(
          fixture.messages.filter((message) => message.type === "user"),
        )
      }
    }),
  )
}

it.live("length recovery shares the existing three-reduction budget with input overflow", () =>
  Effect.gen(function* () {
    const sequence = ["overflow", "length", "overflow", "overflow"] as const
    const fixture = yield* setup("stop", {
      sequence,
      messages: Array.from({ length: 8 }, (_, index) => `exchange ${index} ${"x".repeat(20_000)}`),
    })
    const outcome = yield* fixture.compact
    const sizes = fixture.bodies.map((body) => JSON.stringify(body.messages).length)
    expect(outcome.status).toBe("failed")
    expect(fixture.bodies).toHaveLength(4)
    for (let index = 1; index < sizes.length; index++) {
      expect(sizes[index]).toBeLessThan(sizes[index - 1])
    }
    const history = yield* fixture.store.context(fixture.sessionID)
    expect(history.filter((message) => message.type === "user")).toEqual(
      fixture.messages.filter((message) => message.type === "user"),
    )
  }),
)
