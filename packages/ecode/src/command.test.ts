import { describe, expect, test } from "bun:test"
import { executorCommand } from "./command.js"
import { parseConfig } from "./config.js"
import { ModelTier, type RouteDecision, type TaskSpec } from "./types.js"

const task: TaskSpec = {
  id: "task-1",
  objective: "Fix the failing test",
  mode: "write",
  risk: "medium",
  requiredCapabilities: ["files", "shell"],
  maxCostUSD: 1.5,
}

const decision: RouteDecision = {
  executor: "selected",
  tier: ModelTier.Balanced,
  reasons: ["mutation"],
  escalateOn: ["verification_failed"],
  maxTurns: 12,
  maxCostUSD: 1.5,
}

describe("executorCommand", () => {
  test("builds an OpenCode JSON run", () => {
    const executor = config({ kind: "opencode", command: "opencode" })
    expect(executorCommand(executor, task, decision)).toEqual([
      "opencode",
      "run",
      "--format",
      "json",
      "--model",
      "provider/balanced",
      task.objective,
    ])
  })

  test("builds a sandboxed Codex exec run", () => {
    const executor = config({ kind: "codex-cli", command: "codex", approval: "on-request" })
    expect(executorCommand(executor, task, decision)).toEqual([
      "codex",
      "exec",
      "--json",
      "--model",
      "provider/balanced",
      "--sandbox",
      "workspace-write",
      "--ask-for-approval",
      "on-request",
      task.objective,
    ])
  })

  test("builds a bounded Claude Code stream", () => {
    const executor = config({
      kind: "claude-code-cli",
      command: "claude",
      permissionMode: { read: "plan", write: "acceptEdits" },
    })
    expect(executorCommand(executor, task, decision)).toEqual([
      "claude",
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--model",
      "provider/balanced",
      "--max-turns",
      "12",
      "--permission-mode",
      "acceptEdits",
      "--max-budget-usd",
      "1.5",
      task.objective,
    ])
  })
})

function config(
  executor:
    | { kind: "opencode"; command: string }
    | { kind: "codex-cli"; command: string; approval: "on-request" }
    | {
        kind: "claude-code-cli"
        command: string
        permissionMode: { read: string; write: string }
      },
) {
  return parseConfig({
    version: 1,
    executors: {
      selected: {
        ...executor,
        capabilities: ["files", "shell"],
        models: { balanced: "provider/balanced" },
      },
    },
  }).executors.selected
}
