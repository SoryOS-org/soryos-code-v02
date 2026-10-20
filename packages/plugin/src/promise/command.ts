import type { CommandApi } from "@lutungcode/client/promise/api"
import type { PromptInput } from "@lutungcode/schema/prompt-input"
import type { Session } from "@lutungcode/schema/session"
import type { SessionInbox } from "@lutungcode/schema/session-inbox"
import type { Transform } from "./registration.js"

export interface CommandInvocation {
  readonly sessionID: Session.ID
  readonly prompt: PromptInput.Prompt
  readonly delivery: SessionInbox.Delivery
}

export interface CommandDefinition {
  readonly name: string
  readonly description?: string
  readonly execute: (input: CommandInvocation) => Promise<void>
}

export interface CommandEditor {
  add(definition: CommandDefinition): void
}

export interface CommandDomain extends Pick<CommandApi, "list"> {
  readonly transform: Transform<CommandEditor>
  readonly reload: () => Promise<void>
}
