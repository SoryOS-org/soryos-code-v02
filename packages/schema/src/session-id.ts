import { Schema } from "effect"
import { descending } from "./identifier.js"
import { statics } from "./schema.js"

// The emitted JSON Schema pattern is end-anchored because some providers (older llama.cpp) reject unanchored patterns.
export const SessionID = Schema.String.check(
  Schema.isStartingWith("ses", { toJsonSchema: () => ({ pattern: "^ses.*$" }) }),
).pipe(
  Schema.brand("SessionID"),
  Schema.annotate({ identifier: "Session.ID" }),
  statics((schema) => {
    const create = () => schema.make("ses_" + descending())
    return {
      create,
      descending: (id?: string) => (id === undefined ? create() : schema.make(id)),
    }
  }),
)
export type SessionID = typeof SessionID.Type
