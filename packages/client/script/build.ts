import { NodeFileSystem } from "@effect/platform-node"
import { compile, emitEffectImported, emitEffectShape, emitPromise, write } from "@lutungcode/httpapi-codegen"
import { ClientApi, effectOmitEndpoints, groupNames, promiseOmitEndpoints } from "@lutungcode/protocol/client"
import { Agent } from "@lutungcode/schema/agent"
import { Command } from "@lutungcode/schema/command"
import { Config } from "@lutungcode/schema/config"
import { Credential } from "@lutungcode/schema/credential"
import { Event } from "@lutungcode/schema/event"
import { EventLog } from "@lutungcode/schema/event-log"
import { FileDiff } from "@lutungcode/schema/file-diff"
import { FileSystem } from "@lutungcode/schema/filesystem"
import { Form } from "@lutungcode/schema/form"
import { Instruction } from "@lutungcode/schema/instruction"
import { InstructionEntry } from "@lutungcode/schema/instruction-entry"
import { Integration } from "@lutungcode/schema/integration"
import { Location } from "@lutungcode/schema/location"
import { Mcp } from "@lutungcode/schema/mcp"
import { Model } from "@lutungcode/schema/model"
import { Money } from "@lutungcode/schema/money"
import { Permission } from "@lutungcode/schema/permission"
import { PermissionSaved } from "@lutungcode/schema/permission-saved"
import { Plugin } from "@lutungcode/schema/plugin"
import { Project } from "@lutungcode/schema/project"
import { Worktree } from "@lutungcode/schema/worktree"
import { AgentAttachment, FileAttachment, Prompt, PromptMention } from "@lutungcode/schema/prompt"
import { PromptInput } from "@lutungcode/schema/prompt-input"
import { Provider } from "@lutungcode/schema/provider"
import { Pty } from "@lutungcode/schema/pty"
import { PtyTicket } from "@lutungcode/schema/pty-ticket"
import { Question } from "@lutungcode/schema/question"
import { Reference } from "@lutungcode/schema/reference"
import { AbsolutePath, RelativePath } from "@lutungcode/schema/schema"
import { Session } from "@lutungcode/schema/session"
import { SessionMessage } from "@lutungcode/schema/session-message"
import { SessionInbox } from "@lutungcode/schema/session-inbox"
import { Shell } from "@lutungcode/schema/shell"
import { Skill } from "@lutungcode/schema/skill"
import { Snapshot } from "@lutungcode/schema/snapshot"
import { Vcs } from "@lutungcode/schema/vcs"
import { WebSearch } from "@lutungcode/schema/websearch"
import { Workspace } from "@lutungcode/schema/workspace"
import { Effect, Schema } from "effect"
import { fileURLToPath } from "url"

const promiseContract = compile(ClientApi, { groupNames, omitEndpoints: promiseOmitEndpoints })
const effectContract = compile(ClientApi, { groupNames, omitEndpoints: effectOmitEndpoints })
const effectTypeReferences = [
  ...namespaceTypes("Agent", "@lutungcode/schema/agent", Agent),
  ...namespaceTypes("Command", "@lutungcode/schema/command", Command),
  ...namespaceTypes("Config", "@lutungcode/schema/config", Config),
  ...namespaceTypes("Credential", "@lutungcode/schema/credential", Credential),
  ...namespaceTypes("Event", "@lutungcode/schema/event", Event),
  ...namespaceTypes("EventLog", "@lutungcode/schema/event-log", EventLog),
  ...namespaceTypes("FileDiff", "@lutungcode/schema/file-diff", FileDiff),
  ...namespaceTypes("FileSystem", "@lutungcode/schema/filesystem", FileSystem),
  ...namespaceTypes("Form", "@lutungcode/schema/form", Form),
  ...namespaceTypes("Instruction", "@lutungcode/schema/instruction", Instruction),
  ...namespaceTypes("InstructionEntry", "@lutungcode/schema/instruction-entry", InstructionEntry),
  ...namespaceTypes("Integration", "@lutungcode/schema/integration", Integration),
  typeReference("Location.PublicRef", "@lutungcode/schema/location", Location.PublicRef),
  typeReference("Location.PublicInfo", "@lutungcode/schema/location", Location.PublicInfo),
  ...namespaceTypes("Mcp", "@lutungcode/schema/mcp", Mcp),
  ...namespaceTypes("Model", "@lutungcode/schema/model", Model),
  ...namespaceTypes("Money", "@lutungcode/schema/money", Money),
  ...namespaceTypes("Permission", "@lutungcode/schema/permission", Permission),
  ...namespaceTypes("PermissionSaved", "@lutungcode/schema/permission-saved", PermissionSaved),
  ...namespaceTypes("Plugin", "@lutungcode/schema/plugin", Plugin),
  ...namespaceTypes("Project", "@lutungcode/schema/project", Project),
  ...namespaceTypes("Worktree", "@lutungcode/schema/worktree", Worktree),
  ...namespaceTypes("PromptInput", "@lutungcode/schema/prompt-input", PromptInput),
  ...namespaceTypes("Provider", "@lutungcode/schema/provider", Provider),
  ...namespaceTypes("Pty", "@lutungcode/schema/pty", Pty),
  ...namespaceTypes("PtyTicket", "@lutungcode/schema/pty-ticket", PtyTicket),
  ...namespaceTypes("Question", "@lutungcode/schema/question", Question),
  ...namespaceTypes("Reference", "@lutungcode/schema/reference", Reference),
  ...namespaceTypes("Session", "@lutungcode/schema/session", Session),
  ...namespaceTypes("SessionMessage", "@lutungcode/schema/session-message", SessionMessage),
  ...namespaceTypes("SessionInbox", "@lutungcode/schema/session-inbox", SessionInbox),
  ...namespaceTypes("Shell", "@lutungcode/schema/shell", Shell),
  ...namespaceTypes("Skill", "@lutungcode/schema/skill", Skill),
  ...namespaceTypes("Snapshot", "@lutungcode/schema/snapshot", Snapshot),
  ...namespaceTypes("Vcs", "@lutungcode/schema/vcs", Vcs),
  ...namespaceTypes("WebSearch", "@lutungcode/schema/websearch", WebSearch),
  ...namespaceTypes("Workspace", "@lutungcode/schema/workspace", Workspace),
  typeReference("Prompt", "@lutungcode/schema/prompt", Prompt),
  typeReference("PromptMention", "@lutungcode/schema/prompt", PromptMention),
  typeReference("FileAttachment", "@lutungcode/schema/prompt", FileAttachment),
  typeReference("AgentAttachment", "@lutungcode/schema/prompt", AgentAttachment),
  typeReference("AbsolutePath", "@lutungcode/schema/schema", AbsolutePath),
  typeReference("RelativePath", "@lutungcode/schema/schema", RelativePath),
]

await Effect.runPromise(
  Effect.all(
    [
      write(
        emitPromise(promiseContract, {
          mutableOutputs: true,
        }),
        fileURLToPath(new URL("../src/promise/generated", import.meta.url)),
      ),
      write(
        emitEffectImported(effectContract, {
          module: "../../contract",
          api: "ClientApi",
          shapeModule: "../api/api.js",
        }),
        fileURLToPath(new URL("../src/effect/generated", import.meta.url)),
      ),
      write(
        emitEffectShape(effectContract, {
          typeReferences: effectTypeReferences,
          outputTypes: {
            "event.subscribe": {
              name: "LutungCodeEvent",
              import: 'import type { LutungCodeEvent } from "@lutungcode/protocol/groups/event"',
            },
          },
        }),
        fileURLToPath(new URL("../src/effect/api", import.meta.url)),
      ),
    ],
    { concurrency: 3, discard: true },
  ).pipe(Effect.provide(NodeFileSystem.layer)),
)

function namespaceTypes(namespace: string, module: string, values: object) {
  return Object.entries(values).flatMap(([name, schema]) =>
    Schema.isSchema(schema) ? [typeReference(`${namespace}.${name}`, module, schema)] : [],
  )
}

function typeReference(name: string, module: string, schema: Schema.Top) {
  return {
    schema,
    name,
    import: `import type { ${name.split(".")[0]} } from ${JSON.stringify(module)}`,
  }
}
