import { describe, expect, test } from "bun:test"
import { Harness, harnessCommand, harnessInvocation, parseHarnessEvent, routeHarness, routeTask } from "./ecode-router"

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
      `codex exec --json --color never 'Fix user'"'"'s test'`,
    )
    expect(harnessCommand(Harness.OpenCode, "Explain this repo", "opencode")).toBe(
      `opencode run --format json 'Explain this repo'`,
    )
  })

  test("builds an argument array without a shell", () => {
    expect(harnessInvocation(Harness.Codex, "What does this project do?", "gpt-5.6-sol", "codex")).toEqual([
      "codex",
      "exec",
      "--json",
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
    ).toBe(`'/Applications/Chat GPT.app/Contents/Resources/codex' exec --json --color never 'Explain this repo'`)
  })

  test("normalizes Codex command and reasoning events", () => {
    expect(
      parseHarnessEvent(
        Harness.Codex,
        JSON.stringify({
          type: "item.completed",
          item: {
            type: "command_execution",
            command: "bun test",
            aggregated_output: "2 pass\n",
            exit_code: 0,
          },
        }),
      ),
    ).toEqual([{ type: "command", command: "bun test", output: "2 pass\n", exitCode: 0 }])
    expect(
      parseHarnessEvent(
        Harness.Codex,
        JSON.stringify({ type: "item.completed", item: { type: "reasoning", text: "Checking the failing test." } }),
      ),
    ).toEqual([{ type: "reasoning", text: "Checking the failing test." }])
  })

  test("normalizes OpenCode shell tool events", () => {
    expect(
      parseHarnessEvent(
        Harness.OpenCode,
        JSON.stringify({
          type: "tool_use",
          part: { name: "shell", state: { input: { command: "git status --short" }, output: " M app.ts" } },
        }),
      ),
    ).toEqual([{ type: "command", command: "git status --short", output: " M app.ts", exitCode: undefined }])
  })
})
