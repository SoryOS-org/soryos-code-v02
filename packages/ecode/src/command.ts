import { modelForTier, type ExecutorConfig } from "./config.js"
import type { RouteDecision, TaskSpec } from "./types.js"

export function executorCommand(executor: ExecutorConfig, task: TaskSpec, decision: RouteDecision) {
  const model = modelForTier(executor, decision.tier)
  if (executor.kind === "opencode") {
    return [executor.command, ...executor.args, "run", "--format", "json", "--model", model, task.objective]
  }
  if (executor.kind === "codex-cli") {
    return [
      executor.command,
      ...executor.args,
      "exec",
      "--json",
      "--model",
      model,
      "--sandbox",
      task.mode === "write" ? "workspace-write" : "read-only",
      "--ask-for-approval",
      executor.approval,
      task.objective,
    ]
  }
  return [
    executor.command,
    ...executor.args,
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--model",
    model,
    "--max-turns",
    decision.maxTurns.toString(),
    "--permission-mode",
    task.mode === "write" ? executor.permissionMode.write : executor.permissionMode.read,
    ...(decision.maxCostUSD === undefined ? [] : ["--max-budget-usd", decision.maxCostUSD.toString()]),
    task.objective,
  ]
}
