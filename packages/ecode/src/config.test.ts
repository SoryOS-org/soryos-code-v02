import { describe, expect, test } from "bun:test"
import { executorProfiles, parseConfig } from "./config.js"
import { ModelTier } from "./types.js"

describe("ecode config", () => {
  test("applies safe CLI defaults and creates executor profiles", () => {
    const config = parseConfig({
      version: 1,
      executors: {
        codex: {
          kind: "codex-cli",
          command: "codex",
          capabilities: ["files"],
          models: { balanced: "gpt-example" },
        },
      },
    })

    expect(config.executors.codex).toMatchObject({ enabled: true, args: [], approval: "on-request" })
    expect(executorProfiles(config)).toEqual([
      {
        id: "codex",
        available: true,
        capabilities: ["files"],
        tiers: [ModelTier.Balanced],
        priority: 0,
      },
    ])
  })

  test("rejects an executor without a model tier", () => {
    expect(() =>
      parseConfig({
        version: 1,
        executors: {
          opencode: { kind: "opencode", command: "opencode", capabilities: ["files"], models: {} },
        },
      }),
    ).toThrow()
  })
})
