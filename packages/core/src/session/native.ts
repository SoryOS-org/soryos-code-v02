export * as SessionNative from "./native.js"

import { Message } from "@opencode/ai"
import type { Model } from "@opencode/schema/model"
import { Predicate, Schema } from "effect"
import type { SessionMessage } from "./message.js"

const messages = Schema.toCodecJson(Schema.Array(Message))

/** Native data, such as reasoning signatures or a provider compaction's window, only replays on the model that made it. */
export const reusable = (from: Model.Ref | undefined, to: Model.Ref) =>
  from !== undefined && String(from.providerID) === String(to.providerID) && String(from.id) === String(to.id)

/** A completed provider compaction, which replays `native.messages` instead of a local summary. */
export const isCheckpoint = (
  message: SessionMessage.Info,
): message is SessionMessage.CompactionCompleted & { readonly native: { readonly messages: unknown } } =>
  message.type === "compaction" && message.status === "completed" && message.native?.messages !== undefined

/**
 * Provider and attachment metadata can contain optional undefined entries, which JSON storage drops anyway, so use
 * JSON's omission semantics; `Media.Asset.toJSON` keeps binary media as base64.
 */
export const encode = (replacement: ReadonlyArray<Message>) => ({
  messages: Schema.decodeSync(Schema.fromJsonString(Schema.Json))(JSON.stringify(replacement)),
})

export const decode = (checkpoint: { readonly native: { readonly messages: unknown } }) =>
  Schema.decodeUnknownSync(messages)(upgradeLegacyMedia(checkpoint.native.messages))
export const validate = (checkpoint: { readonly native: { readonly messages: unknown } }) =>
  Schema.decodeUnknownEffect(messages)(upgradeLegacyMedia(checkpoint.native.messages))

/**
 * Before 2.0.15, version-1 checkpoints stored mediaType/data directly on media parts. Core only built
 * those parts from prompt attachments, whose data the Prompt schema guarantees is base64.
 */
function upgradeLegacyMedia(input: unknown) {
  if (!Array.isArray(input)) return input
  return input.map((message: unknown) => {
    if (!Predicate.isObject(message) || !Array.isArray(message.content)) return message
    return {
      ...message,
      content: message.content.map((part: unknown) => {
        if (
          !Predicate.isObject(part) ||
          part.type !== "media" ||
          part.media !== undefined ||
          typeof part.mediaType !== "string" ||
          typeof part.data !== "string"
        )
          return part
        const { mediaType, data, ...rest } = part
        return { ...rest, media: { source: { type: "base64", data, mediaType } } }
      }),
    }
  })
}
