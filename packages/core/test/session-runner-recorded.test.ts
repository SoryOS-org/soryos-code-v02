import { HttpRecorder } from "@lutungcode/http-recorder"
import { OpenAIChat } from "@lutungcode/ai/protocols/openai-chat"
import { Auth, LLMClient, type LLMClientService, RequestExecutor } from "@lutungcode/ai/route"
import { Model } from "@lutungcode/core/model"
import { Database } from "@lutungcode/core/database/database"
import { AppNodeBuilder } from "@lutungcode/core/effect/app-node-builder"
import { LayerNodePlatform } from "@lutungcode/core/effect/app-node-platform"
import { LayerNode } from "@lutungcode/util/effect/layer-node"
import { Bus } from "@lutungcode/core/bus"
import { EventTable } from "@lutungcode/core/event/sql"
import { Permission } from "@lutungcode/core/permission"
import { Agent } from "@lutungcode/core/agent"
import { Config } from "@lutungcode/core/config"
import { Project } from "@lutungcode/core/project"
import { ProjectTable } from "@lutungcode/core/project/sql"
import { AbsolutePath } from "@lutungcode/core/schema"
import { Session } from "@lutungcode/core/session"
import { Snapshot } from "@lutungcode/core/snapshot"
import { SessionProjector } from "@lutungcode/core/session/projector"
import { SessionExecution } from "@lutungcode/core/session/execution"
import { SessionRunCoordinator } from "@lutungcode/core/session/run-coordinator"
import { SessionRunner } from "@lutungcode/core/session/runner/index"
import { SessionRunnerLLM } from "@lutungcode/core/session/runner/llm"
import { SessionRunnerModel } from "@lutungcode/core/session/runner/model"
import { Tool } from "@lutungcode/core/tool"
import { SessionTable } from "@lutungcode/core/session/sql"
import { SessionStore } from "@lutungcode/core/session/store"
import { Location } from "@lutungcode/core/location"
import { InstructionBuiltIns } from "@lutungcode/core/instructions/builtins"
import { InstructionDiscovery } from "@lutungcode/core/instruction-discovery"
import { Instructions } from "@lutungcode/core/instructions/index"
import { SkillInstructions } from "@lutungcode/core/skill/instructions"
import { ReferenceInstructions } from "@lutungcode/core/reference/instructions"
import { McpInstructions } from "@lutungcode/core/mcp/instructions"
import { PluginSupervisor } from "@lutungcode/core/plugin/supervisor"
import { Plugin } from "@lutungcode/core/plugin"
import { PluginHooks } from "@lutungcode/core/plugin/hooks"
import { OptimizePlugin } from "@lutungcode/core/plugin/optimize"
import { IdentityPlugin } from "@lutungcode/core/plugin/identity"
import { describe, expect } from "bun:test"
import { eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import path from "node:path"
import { testEffect } from "./lib/effect"
import { LocationServiceMap } from "@lutungcode/core/location-service-map"
import { promptLocationNode } from "./fixture/prompt-location"
import { permissionLayer } from "./lib/permission"
import { agentHost, modelHost, host, noProviders } from "./plugin/host"

const cassetteName = "session-runner/openai-chat-streams-text"
const cassetteDirectory = path.resolve(import.meta.dir, "fixtures/recordings")
if (process.env.RECORD === "true") {
  if (process.env.CI !== undefined) throw new Error("Unset CI before recording HTTP cassettes")
  HttpRecorder.removeCassetteSync(cassetteName, { directory: cassetteDirectory })
}
const cassette = HttpRecorder.layerFetch(cassetteName, { directory: cassetteDirectory })
const executor = RequestExecutor.layer.pipe(Layer.provide(cassette))
const client = LLMClient.layer.pipe(Layer.provide(executor))
const permission = permissionLayer()
const model = OpenAIChat.route
  .with({
    endpoint: { baseURL: "https://api.openai.com/v1" },
    auth: Auth.bearer(process.env.OPENAI_API_KEY ?? "fixture"),
    generation: { maxTokens: 20, temperature: 0 },
  })
  .model({ id: "gpt-4o-mini", compatibility: { supportsPromptCacheKey: true } })
const models = Layer.mock(SessionRunnerModel.Service)({
  resolve: () =>
    Effect.succeed(
      SessionRunnerModel.resolved(model, {
        capabilities: { tools: true, input: ["text", "image"], output: ["text"] },
        cost: [],
        limit: { context: 200_000, output: 20 },
      }),
    ),
})
const systemContext = Layer.mock(InstructionBuiltIns.Service, { load: () => Effect.succeed(Instructions.empty) })
const instructionContext = Layer.mock(InstructionDiscovery.Service, {
  project: true,
  global: true,
  load: () => Effect.succeed(Instructions.empty),
})
const skillInstructions = Layer.mock(SkillInstructions.Service, { load: () => Effect.succeed(Instructions.empty) })
const referenceInstructions = Layer.mock(ReferenceInstructions.Service, {
  load: () => Effect.succeed(Instructions.empty),
})
const mcpInstructions = Layer.mock(McpInstructions.Service, { load: () => Effect.succeed(Instructions.empty) })
const config = Config.testLayer()
const promptModels = Layer.mock(Model.Service, {
  get: () => Effect.undefined,
  all: () => Effect.succeed([]),
  available: () => Effect.succeed([]),
  default: () => Effect.undefined,
  small: () => Effect.undefined,
})
const runnerLayer = (llmClient: Layer.Layer<LLMClientService>) =>
  AppNodeBuilder.build(SessionRunnerLLM.node, [
    Snapshot.node.replace(Snapshot.noopLayer),
    LayerNodePlatform.llmClient.replace(llmClient),
    SessionRunnerModel.node.replace(models),
    InstructionBuiltIns.node.replace(systemContext),
    InstructionDiscovery.node.replace(instructionContext),
    Location.node.replace(Location.boundNode({ directory: AbsolutePath.make("/project") })),
    SkillInstructions.node.replace(skillInstructions),
    ReferenceInstructions.node.replace(referenceInstructions),
    McpInstructions.node.replace(mcpInstructions),
    Config.node.replace(config),
    Permission.node.replace(permission),
    PluginSupervisor.node.replace(Layer.empty),
    Plugin.node.replace(Layer.mock(Plugin.Service, { awaitActivation: Effect.void })),
  ])
const execution = (llmClient: Layer.Layer<LLMClientService>) =>
  Layer.effect(
    SessionExecution.Service,
    Effect.gen(function* () {
      const sessionRunner = yield* SessionRunner.Service
      const coordinator = yield* SessionRunCoordinator.make<Session.ID, SessionRunner.RunError>({
        drain: (sessionID, force) => sessionRunner.drain({ sessionID, force }).pipe(Effect.asVoid),
      })
      return SessionExecution.Service.of({
        active: coordinator.active,
        isActive: coordinator.isActive,
        resume: coordinator.run,
        wake: coordinator.wake,
        interrupt: (sessionID) => coordinator.interrupt(sessionID),
        awaitIdle: coordinator.awaitIdle,
      })
    }),
  ).pipe(Layer.provide(runnerLayer(llmClient)), Layer.orDie)
const testLayer = (llmClient: Layer.Layer<LLMClientService>) =>
  AppNodeBuilder.build(
    LayerNode.group([
      Database.node,
      Bus.node,
      SessionProjector.node,
      SessionStore.node,
      Agent.node,
      Model.node,
      PluginHooks.node,
      Tool.node,
      SessionRunnerModel.node,
      InstructionBuiltIns.node,
      InstructionDiscovery.node,
      SkillInstructions.node,
      ReferenceInstructions.node,
      Config.node,
      Snapshot.node,
      SessionRunnerLLM.node,
      Session.node,
    ]),
    [
      Bus.node.replace(Bus.configured({ persist: true })),
      LocationServiceMap.node.replace(promptLocationNode),
      LayerNodePlatform.llmClient.replace(llmClient),
      Permission.node.replace(permission),
      Model.node.replace(promptModels),
      SessionRunnerModel.node.replace(models),
      InstructionBuiltIns.node.replace(systemContext),
      InstructionDiscovery.node.replace(instructionContext),
      Location.node.replace(Location.boundNode({ directory: AbsolutePath.make("/project") })),
      SkillInstructions.node.replace(skillInstructions),
      ReferenceInstructions.node.replace(referenceInstructions),
      Config.node.replace(config),
      Snapshot.node.replace(Snapshot.noopLayer),
      PluginSupervisor.node.replace(Layer.empty),
      Plugin.node.replace(Layer.mock(Plugin.Service, { awaitActivation: Effect.void })),
      SessionExecution.node.replace(execution(llmClient)),
    ],
  )
const it = testEffect(testLayer(client))
const sessionID = Session.ID.make("ses_runner_recorded")

describe("SessionRunnerLLM recorded", () => {
  it.effect("executes one recorded prompt through the recorded HTTP transport", () =>
    Effect.gen(function* () {
      const agents = yield* Agent.Service
      const models = yield* Model.Service
      const hooks = yield* PluginHooks.Service
      yield* agents.transform((editor) =>
        editor.update(Agent.ID.make("build"), (agent) => {
          agent.mode = "primary"
          agent.permissions.push({ action: "execute", resource: "*", effect: "deny" })
        }),
      )
      const pluginHost = host({
        agent: agentHost(agents),
        model: modelHost(models),
        provider: noProviders,
        session: { hook: (name, callback) => hooks.register("session", name, callback) },
      })
      yield* Effect.forEach(OptimizePlugin.Plugins, (plugin) => plugin.effect(pluginHost), { discard: true })
      yield* IdentityPlugin.Plugin.effect(pluginHost)
      const { db } = yield* Database.Service
      yield* db
        .insert(ProjectTable)
        .values({ id: Project.ID.global, worktree: AbsolutePath.make("/project"), sandboxes: [] })
        .onConflictDoNothing()
        .run()
        .pipe(Effect.orDie)
      yield* db
        .insert(SessionTable)
        .values({
          id: sessionID,
          project_id: Project.ID.global,
          slug: "test",
          directory: "/project",
          title: "test",
          version: "test",
        })
        .onConflictDoNothing()
        .run()
        .pipe(Effect.orDie)
      const session = yield* Session.Service
      const prompt = yield* session.prompt({
        sessionID,
        text: "Say hello in one short sentence.",
        resume: false,
      })

      yield* session.resume(sessionID)

      const messages = yield* session.context(sessionID)
      expect(messages).toHaveLength(2)
      expect(messages[0]).toMatchObject({ id: prompt.id, type: "user", text: "Say hello in one short sentence." })
      expect(messages[1]).toMatchObject({ type: "assistant", agent: "build", finish: "stop" })
      expect(messages[1]?.type === "assistant" ? messages[1].content : []).toMatchObject([
        { type: "text", text: "Hello!" },
      ])
      expect(
        (yield* db
          .select({ type: EventTable.type })
          .from(EventTable)
          .where(eq(EventTable.aggregate_id, sessionID))
          .orderBy(EventTable.seq)
          .all()).map((event) => event.type),
      ).toEqual([
        "session.inbox.enqueued.1",
        "session.instructions.updated.2",
        "session.inbox.delivered.1",
        "session.step.started.1",
        "session.text.started.1",
        "session.text.ended.1",
        "session.step.streamed.1",
        "session.step.ended.1",
      ])
    }),
  )
})
