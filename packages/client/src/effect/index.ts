// TODO: Keep additional network capabilities inside Schema and Protocol as the client grows; /effect must never import
// Core or Server. Preserve these datatype exports so internal model reorganizations do not require caller migrations.
import type { Effect } from "effect"
import type { LutungCode } from "./client.js"

export * from "./generated/index"
export { LutungCode } from "./client.js"
export type {
  AgentApi,
  AppApi,
  CommandApi,
  ConfigApi,
  EventApi,
  IntegrationApi,
  ModelApi,
  PluginApi,
  ProviderApi,
  ReferenceApi,
  RpcApi,
  RpcClient,
  WebSearchApi,
  SessionApi,
  SkillApi,
} from "./api.js"
export { Agent } from "@lutungcode/schema/agent"
export { Command } from "@lutungcode/schema/command"
export { Config } from "@lutungcode/schema/config"
export { Credential } from "@lutungcode/schema/credential"
export { Event } from "@lutungcode/schema/event"
export { EventLog } from "@lutungcode/schema/event-log"
export { FileSystem } from "@lutungcode/schema/filesystem"
export { Form } from "@lutungcode/schema/form"
export { Integration } from "@lutungcode/schema/integration"
export { Location } from "@lutungcode/schema/location"
export { Model } from "@lutungcode/schema/model"
export { Permission } from "@lutungcode/schema/permission"
export { PermissionSaved } from "@lutungcode/schema/permission-saved"
export { Project } from "@lutungcode/schema/project"
export { Worktree } from "@lutungcode/schema/worktree"
export { Vcs } from "@lutungcode/schema/vcs"
export { Provider } from "@lutungcode/schema/provider"
export { Pty } from "@lutungcode/schema/pty"
export { Question } from "@lutungcode/schema/question"
export { Reference } from "@lutungcode/schema/reference"
export { WebSearch } from "@lutungcode/schema/websearch"
export { AbsolutePath, RelativePath } from "@lutungcode/schema/schema"
export { Session } from "@lutungcode/schema/session"
export { SessionInbox } from "@lutungcode/schema/session-inbox"
export { SessionMessage } from "@lutungcode/schema/session-message"
export { Skill } from "@lutungcode/schema/skill"
export { Prompt } from "@lutungcode/schema/prompt"
export { PromptInput } from "@lutungcode/schema/prompt-input"
export type { LutungCodeEvent } from "@lutungcode/protocol/groups/event"
export type LutungCodeClient = Effect.Success<ReturnType<typeof LutungCode.make>>
