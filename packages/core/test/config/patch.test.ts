import { describe, expect, test } from "bun:test"
import { parse } from "jsonc-parser"
import { ConfigPatch } from "@opencode/core/config/patch"

const custom = {
  name: "Custom",
  package: "aisdk:@ai-sdk/openai-compatible",
  settings: { baseURL: "https://api.example.com/v1" },
  models: { example: { name: "Example" } },
}

describe("ConfigPatch.apply", () => {
  test("adds providers without changing existing settings or comments", () => {
    const text = `{
  // Keep the existing local provider.
  "shell": "/bin/sh",
  "model": "ollama/local",
  "providers": {
    "ollama": {
      "settings": { "baseURL": "http://localhost:11434/v1" },
    },
  },
}
`
    const updated = ConfigPatch.apply(text, { providers: { custom } })
    expect(updated).toContain("// Keep the existing local provider.")
    expect(parse(updated)).toEqual({
      shell: "/bin/sh",
      model: "ollama/local",
      providers: {
        ollama: { settings: { baseURL: "http://localhost:11434/v1" } },
        custom,
      },
    })
  })

  test("creates the providers map and applies multiple entries", () => {
    const updated = ConfigPatch.apply("{}\n", {
      providers: { first: custom, second: { ...custom, name: "Second" } },
    })
    expect(parse(updated)).toEqual({
      providers: { first: custom, second: { ...custom, name: "Second" } },
    })
  })

  test("replaces only the requested provider", () => {
    const text = JSON.stringify({
      providers: { custom, other: { name: "Other" } },
      model: "other/model",
    })
    const replacement = { ...custom, headers: { "X-Test": "enabled" } }
    expect(parse(ConfigPatch.apply(text, { providers: { custom: replacement } }))).toEqual({
      providers: { custom: replacement, other: { name: "Other" } },
      model: "other/model",
    })
  })

  test("keeps shell updates independent of provider updates", () => {
    const text = JSON.stringify({ shell: "/bin/sh", providers: { custom } })
    expect(parse(ConfigPatch.apply(text, { shell: "/bin/bash" }))).toEqual({
      shell: "/bin/bash",
      providers: { custom },
    })
    expect(parse(ConfigPatch.apply(text, { shell: null }))).toEqual({ providers: { custom } })
    expect(parse(ConfigPatch.apply("{}", { shell: null }))).toEqual({})
    expect(parse(ConfigPatch.apply(text, { shell: null, providers: { second: custom } }))).toEqual({
      providers: { custom, second: custom },
    })
  })

  test("leaves an empty patch byte-for-byte unchanged", () => {
    const text = '{\n  // unchanged\n  "shell": "/bin/sh",\n}\n'
    expect(ConfigPatch.apply(text, {})).toBe(text)
  })

  test.each(["{", "{} {}", "[]", "null", '"config"', '{"providers":}'])(
    "rejects an invalid document instead of rewriting it: %s",
    (text) => {
      expect(() => ConfigPatch.apply(text, { providers: { custom } })).toThrow(
        "Cannot update malformed config: expected a JSONC object",
      )
    },
  )
})
