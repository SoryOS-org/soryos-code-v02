import { expect, test } from "bun:test"
import { Schema } from "effect"
import { Agent } from "@lutungcode/core/agent"
import { Session } from "@lutungcode/core/session"
import { SessionStore } from "@lutungcode/core/session/store"
import { Location } from "@lutungcode/schema/location"
import { Model } from "@lutungcode/schema/model"
import { Provider } from "@lutungcode/schema/provider"
import { Project } from "@lutungcode/schema/project"
import { Worktree } from "@lutungcode/schema/worktree"
import { Prompt } from "@lutungcode/schema/prompt"
import { SessionInbox } from "@lutungcode/schema/session-inbox"
import { SessionMessage } from "@lutungcode/schema/session-message"
import { Workspace } from "@lutungcode/schema/workspace"
import { Command } from "@lutungcode/schema/command"
import { Connection } from "@lutungcode/schema/connection"
import { Credential } from "@lutungcode/schema/credential"
import { FileSystem } from "@lutungcode/schema/filesystem"
import { Integration } from "@lutungcode/schema/integration"
import { LLM } from "@lutungcode/schema/llm"
import { Permission } from "@lutungcode/schema/permission"
import { Pty } from "@lutungcode/schema/pty"
import { Reference } from "@lutungcode/schema/reference"
import { Skill } from "@lutungcode/schema/skill"
import { AbsolutePath, optional, statics } from "@lutungcode/schema/schema"

test("Core reuses the canonical shared schemas", async () => {
  const schemaAgent = await import("@lutungcode/schema/agent")
  const schemaSession = await import("@lutungcode/schema/session")
  const [
    coreCommand,
    coreConnection,
    coreCredential,
    coreFileSystem,
    coreIntegration,
    coreLocation,
    coreAI,
    coreModel,
    corePermission,
    coreWorktree,
    corePty,
    coreProject,
    coreProvider,
    coreReference,
    coreSessionInbox,
    coreSessionMessage,
    coreSkill,
    coreSchema,
    coreWorkspace,
  ] = await Promise.all([
    import("@lutungcode/core/command"),
    import("@lutungcode/core/integration/connection"),
    import("@lutungcode/core/credential"),
    import("@lutungcode/core/filesystem"),
    import("@lutungcode/core/integration"),
    import("@lutungcode/core/location"),
    import("@lutungcode/ai"),
    import("@lutungcode/core/model"),
    import("@lutungcode/core/permission"),
    import("@lutungcode/core/worktree"),
    import("@lutungcode/core/pty"),
    import("@lutungcode/core/project/schema"),
    import("@lutungcode/core/provider"),
    import("@lutungcode/core/reference"),
    import("@lutungcode/core/session/inbox"),
    import("@lutungcode/core/session/message"),
    import("@lutungcode/core/skill"),
    import("@lutungcode/core/schema"),
    import("@lutungcode/core/workspace"),
  ])

  const schemas = [
    [Agent.ID, schemaAgent.Agent.ID],
    [Agent.Name, schemaAgent.Agent.Name],
    [Agent.Color, schemaAgent.Agent.Color],
    [Agent.Info, schemaAgent.Agent.Info],
    [coreCommand.Info, Command.Info],
    [coreConnection.CredentialInfo, Connection.CredentialInfo],
    [coreConnection.EnvInfo, Connection.EnvInfo],
    [coreConnection.Info, Connection.Info],
    [coreCredential.ID, Credential.ID],
    [coreCredential.OAuth, Credential.OAuth],
    [coreCredential.Key, Credential.Key],
    [coreCredential.Value, Credential.Value],
    [coreFileSystem.Entry, FileSystem.Entry],
    [coreFileSystem.Submatch, FileSystem.Submatch],
    [coreFileSystem.Match, FileSystem.Match],
    [coreIntegration.ID, Integration.ID],
    [coreIntegration.MethodID, Integration.MethodID],
    [coreIntegration.OAuthMethod, Integration.OAuthMethod],
    [coreIntegration.KeyMethod, Integration.KeyMethod],
    [coreIntegration.EnvMethod, Integration.EnvMethod],
    [coreIntegration.Method, Integration.Method],
    [coreIntegration.Ref, Integration.Ref],
    [coreLocation.Ref, Location.Ref],
    [coreAI.FinishReason, LLM.FinishReason],
    [coreModel.ID, Model.ID],
    [coreModel.VariantID, Model.VariantID],
    [coreModel.Ref, Model.Ref],
    [coreModel.Family, Model.Family],
    [coreModel.Capabilities, Model.Capabilities],
    [coreModel.Cost, Model.Cost],
    [coreModel.Info, Model.Info],
    [coreProvider.ID, Provider.ID],
    [coreProvider.Request, Provider.Request],
    [coreProvider.Compaction, Provider.Compaction],
    [coreProvider.Transport, Provider.Transport],
    [coreProvider.Settings, Provider.Settings],
    [coreProvider.Info, Provider.Info],
    [corePermission.Effect, Permission.Effect],
    [corePermission.Rule, Permission.Rule],
    [corePermission.Ruleset, Permission.Ruleset],
    [coreWorktree.CreateInput, Worktree.CreateInput],
    [coreWorktree.RemoveInput, Worktree.RemoveInput],
    [coreWorktree.Info, Worktree.Info],
    [coreWorktree.List, Worktree.List],
    [coreWorktree.Event, Worktree.Event],
    [corePty.Info, Pty.Info],
    [corePty.Event, Pty.Event],
    [coreProject.ID, Project.ID],
    [coreProject.Current, Project.Current],
    [coreReference.LocalSource, Reference.LocalSource],
    [coreReference.GitSource, Reference.GitSource],
    [coreReference.Source, Reference.Source],
    [Session.ID, schemaSession.Session.ID],
    [Session.Info, schemaSession.Session.Info],
    [Session.ListAnchor, schemaSession.Session.ListAnchor],
    [Session.ListInput, SessionStore.ListInput],
    [coreSessionInbox.Delivery, SessionInbox.Delivery],
    [coreSessionInbox.Item, SessionInbox.Item],
    [coreSessionInbox.User, SessionInbox.User],
    [coreSessionInbox.Synthetic, SessionInbox.Synthetic],
    [coreSessionMessage.ID, SessionMessage.ID],
    [coreSessionMessage.AssistantRetry, SessionMessage.AssistantRetry],
    [coreSessionMessage.AgentSelected, SessionMessage.AgentSelected],
    [coreSessionMessage.ModelSelected, SessionMessage.ModelSelected],
    [coreSessionMessage.LocationSwitched, SessionMessage.LocationSwitched],
    [coreSessionMessage.User, SessionMessage.User],
    [coreSessionMessage.Synthetic, SessionMessage.Synthetic],
    [coreSessionMessage.System, SessionMessage.System],
    [coreSessionMessage.Shell, SessionMessage.Shell],
    [coreSessionMessage.ToolStateStreaming, SessionMessage.ToolStateStreaming],
    [coreSessionMessage.ToolStateRunning, SessionMessage.ToolStateRunning],
    [coreSessionMessage.ToolStateCompleted, SessionMessage.ToolStateCompleted],
    [coreSessionMessage.ToolStateError, SessionMessage.ToolStateError],
    [coreSessionMessage.ToolState, SessionMessage.ToolState],
    [coreSessionMessage.AssistantTool, SessionMessage.AssistantTool],
    [coreSessionMessage.AssistantText, SessionMessage.AssistantText],
    [coreSessionMessage.AssistantReasoning, SessionMessage.AssistantReasoning],
    [coreSessionMessage.AssistantContent, SessionMessage.AssistantContent],
    [coreSessionMessage.Assistant, SessionMessage.Assistant],
    [coreSessionMessage.Compaction, SessionMessage.Compaction],
    [coreSessionMessage.Info, SessionMessage.Info],
    [coreSkill.DirectorySource, Skill.DirectorySource],
    [coreSkill.UrlSource, Skill.UrlSource],
    [coreSkill.EmbeddedSource, Skill.EmbeddedSource],
    [coreSkill.Source, Skill.Source],
    [coreSkill.Info, Skill.Info],
    [coreSchema.optional, optional],
    [coreSchema.statics, statics],
    [coreWorkspace.ID, Workspace.ID],
  ]
  for (const [core, shared] of schemas) expect(core).toBe(shared)

  expect(coreModel.Info.default(coreProvider.ID.make("test"), coreModel.ID.make("model"))).toEqual(
    Model.Info.default(Provider.ID.make("test"), Model.ID.make("model")),
  )
  expect(coreProvider.Info.empty(coreProvider.ID.make("test"))).toEqual(Provider.Info.empty(Provider.ID.make("test")))
  expect(Skill.Source.key(Skill.DirectorySource.make({ type: "directory", path: AbsolutePath.make("/tmp") }))).toBe(
    "directory:/tmp",
  )
})

test("shared record schemas construct and decode plain objects", () => {
  const made = Prompt.make({ text: "hello" })
  const decoded = Schema.decodeUnknownSync(Prompt)({ text: "hello" })
  const content = Schema.decodeUnknownSync(SessionMessage.AssistantText)({ type: "text", text: "hi" })

  expect(Object.getPrototypeOf(made)).toBe(Object.prototype)
  expect(Object.getPrototypeOf(decoded)).toBe(Object.prototype)
  expect(Object.getPrototypeOf(content)).toBe(Object.prototype)
  expect(Prompt.ast.annotations?.identifier).toBe("Prompt")
  expect(SessionMessage.AssistantText.ast.annotations?.identifier).toBe("Session.Message.Assistant.Text")
  expect(Prompt.equivalence(Prompt.make({ text: "hello" }), decoded)).toBe(true)
  expect(Prompt.fromUserMessage({ text: "hello" })).toEqual(made)
  expect(Workspace.ID.ascending("")).toStartWith("wrk_")
})
