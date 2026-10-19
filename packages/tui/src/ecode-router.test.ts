import { describe, expect, test } from "bun:test"
import { Harness, harnessCommand, harnessInvocation, routeHarness, routeTask } from "./ecode-router"

describe("ecode router", () => {
  test("routes simple questions to Codex with Sol", () => {
    expect(routeHarness("Explain what this function does")).toBe(Harness.Codex)
    expect(routeTask("Explain what this function does")).toEqual({ harness: Harness.Codex, model: "gpt-5.6-sol" })
  })

  test("routes implementation work to Claude Code", () => {
    expect(routeHarness("Fix the failing unit test and update the implementation")).toBe(Harness.ClaudeCode)
  })

  test("routes deep work to Codex", () => {
    expect(routeHarness("Plan a security migration across the codebase")).toBe(Harness.Codex)
  })

  test("quotes prompts passed to external harnesses", () => {
    expect(harnessCommand(Harness.Codex, "Fix user's test", "codex")).toBe(
      `codex exec --color never 'Fix user'"'"'s test'`,
    )
    expect(harnessCommand(Harness.OpenCode, "Explain this repo", "opencode")).toBe(`opencode run 'Explain this repo'`)
  })

  test("builds an argument array without a shell", () => {
    expect(harnessInvocation(Harness.Codex, "What does this project do?", "gpt-5.6-sol", "codex")).toEqual([
      "codex",
      "exec",
      "--color",
      "never",
      "--model",
      "gpt-5.6-sol",
      "What does this project do?",
    ])
  })

  test("quotes executable paths containing spaces", () => {
    expect(
      harnessCommand(Harness.Codex, "Explain this repo", "/Applications/Chat GPT.app/Contents/Resources/codex"),
    ).toBe(`'/Applications/Chat GPT.app/Contents/Resources/codex' exec --color never 'Explain this repo'`)
  })
})
