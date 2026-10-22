import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { SessionID } from "../src/session-id.js"

describe("SessionID", () => {
  test("emits an end-anchored JSON Schema pattern", () => {
    const { definitions } = Schema.toJsonSchemaDocument(SessionID)
    expect(definitions["Session.ID"]).toMatchObject({ type: "string", pattern: "^ses.*$" })
  })

  test("runtime validation still accepts session IDs and rejects other prefixes", () => {
    expect(Schema.is(SessionID)(SessionID.create())).toBe(true)
    expect(Schema.is(SessionID)("msg_123")).toBe(false)
  })
})
