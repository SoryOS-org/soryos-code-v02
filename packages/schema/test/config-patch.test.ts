import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { Config } from "../src/config.js"

const decode = Schema.decodeUnknownSync(Config.Patch)
const encode = Schema.encodeSync(Config.Patch)

describe("Config.Patch", () => {
  test("round-trips a provider-only patch without adding shell", () => {
    const input = {
      providers: {
        custom: {
          name: "Custom",
          package: "aisdk:@ai-sdk/openai-compatible",
          settings: { baseURL: "https://api.example.com/v1" },
          headers: { "X-Test": "enabled" },
          models: { example: { name: "Example" } },
        },
      },
    }
    const decoded = decode(input)
    expect(decoded).not.toHaveProperty("shell")
    expect(encode(decoded)).toEqual(input)
    expect(Object.getPrototypeOf(decoded.providers?.custom)).toBe(Object.prototype)
  })

  test.each([{ shell: "/bin/sh" }, { shell: null }, {}])(
    "preserves shell and empty patches: %j",
    (input) => {
      expect(encode(decode(input))).toEqual(input)
    },
  )

  test("accepts shell and providers in the same patch", () => {
    const input = { shell: "/bin/bash", providers: { custom: { name: "Custom" } } }
    expect(encode(decode(input))).toEqual(input)
  })

  test.each([
    { providers: { custom: { package: 42 } } },
    { providers: { custom: { canonical: 42 } } },
    { providers: { custom: { headers: { Authorization: 42 } } } },
    { providers: { custom: null } },
    { providers: [] },
  ])("rejects invalid provider patches: %j", (input) => {
    expect(() => decode(input)).toThrow()
  })
})
