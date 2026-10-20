export * as SessionNative from "./native.js"

import { Message } from "@opencode/ai"
import type { Model } from "@opencode/schema/model"
import { Schema } from "effect"
import type { SessionMessage } from "./message.js"

/** A completed provider compaction, which replays `native.messages` instead of a summary. */
export type Checkpoint = SessionMessage.CompactionCompleted & { readonly native: { readonly messages: unknown } }

const Window = Schema.toCodecJson(Schema.Array(Message))

/** Native data, such as reasoning signatures or a compaction window, only replays on the model that made it. */
export const reusable = (from: Model.Ref | undefined, to: Model.Ref) =>
  from?.providerID === to.providerID && from.id === to.id

export const isCheckpoint = (message: SessionMessage.Info): message is Checkpoint =>
  message.type === "compaction" && message.status === "completed" && message.native?.messages !== undefined

// Plain JSON, not the schema encoder: provider metadata can hold undefined entries, which that encoder rejects.
export const encode = (window: ReadonlyArray<Message>): { readonly messages: unknown } => ({
  messages: JSON.parse(JSON.stringify(window)),
})
export const decode = (checkpoint: Pick<Checkpoint, "native">) =>
  Schema.decodeUnknownSync(Window)(checkpoint.native.messages)
export const validate = (checkpoint: Pick<Checkpoint, "native">) =>
  Schema.decodeUnknownEffect(Window)(checkpoint.native.messages)
