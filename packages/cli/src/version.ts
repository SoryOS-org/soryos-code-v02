import { Option, Schema } from "effect"

declare const LUTUNGCODE_VERSION: string
declare const LUTUNGCODE_CHANNEL: string
declare const LUTUNGCODE_ARTIFACT: string
declare const LUTUNGCODE_RELEASE_HIGHLIGHTS: string

const version = typeof LUTUNGCODE_VERSION === "string" ? LUTUNGCODE_VERSION : "local"
const channel = typeof LUTUNGCODE_CHANNEL === "string" ? LUTUNGCODE_CHANNEL : "local"
const artifact = typeof LUTUNGCODE_ARTIFACT === "string" ? LUTUNGCODE_ARTIFACT : "cli"
// Stable release builds embed the release notes' Highlights; every other build has none.
const highlights =
  typeof LUTUNGCODE_RELEASE_HIGHLIGHTS === "string"
    ? Option.getOrElse(
        Schema.decodeUnknownOption(
          Schema.fromJsonString(Schema.Array(Schema.Struct({ title: Schema.String, body: Schema.String }))),
        )(LUTUNGCODE_RELEASE_HIGHLIGHTS),
        () => [],
      )
    : []

export {
  version as LUTUNGCODE_VERSION,
  channel as LUTUNGCODE_CHANNEL,
  artifact as LUTUNGCODE_ARTIFACT,
  highlights as LUTUNGCODE_HIGHLIGHTS,
}
export const LUTUNGCODE_LOCAL = channel === "local"
