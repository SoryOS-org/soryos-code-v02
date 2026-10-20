import { describe, expect, test } from "bun:test"
import type { SessionMessageInfo } from "@opencode/client"
import {
  Harness,
  harnessCommand,
  harnessInvocation,
  parseHarnessEvent,
  routeHarness,
  routeTask,
  withHarnessMemory,
} from "./ecode-router"

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

  test("shares prior user and final harness turns without command traces", () => {
    const messages: SessionMessageInfo[] = [
      {
        type: "synthetic",
        id: "user-1",
        text: "Fix the stuck Working indicator",
        description: "Fix the stuck Working indicator",
        metadata: { source: "harness-user" },
        time: { created: 1 },
      },
      {
        type: "synthetic",
        id: "trace-1",
        text: "$ git diff\nvery large trace",
        description: "$ git diff\nvery large trace",
        metadata: { source: "harness-trace", event: "command" },
        time: { created: 2 },
      },
      {
        type: "synthetic",
        id: "answer-1",
        text: "The fix is ready; the remaining step is to install it.",
        description: "The fix is ready; the remaining step is to install it.",
        metadata: { source: "harness", harness: "codex", state: "completed" },
        time: { created: 3 },
      },
    ]
    const prompt = withHarnessMemory("Make the change", messages)
    expect(prompt).toContain("User: Fix the stuck Working indicator")
    expect(prompt).toContain("Assistant (Codex CLI): The fix is ready")
    expect(prompt).toContain("<current_request>\nMake the change\n</current_request>")
    expect(prompt).not.toContain("very large trace")
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
