import { ModelTier, type ExecutorProfile, type RouteDecision, type RouteReason, type TaskSpec } from "./types.js"

export class NoExecutorAvailableError extends Error {
  constructor(taskID: string) {
    super(`No executor can satisfy task ${taskID}`)
    this.name = "NoExecutorAvailableError"
  }
}

export function routeTask(task: TaskSpec, executors: ExecutorProfile[]): RouteDecision {
  const tier = selectTier(task)
  const executor = executors
    .filter((item) => item.available)
    .filter((item) => item.tiers.includes(tier))
    .filter((item) => task.requiredCapabilities.every((capability) => item.capabilities.includes(capability)))
    .toSorted((a, b) => executorRank(task, a) - executorRank(task, b))[0]

  if (!executor) throw new NoExecutorAvailableError(task.id)

  return {
    executor: executor.id,
    tier,
    reasons: routeReasons(task),
    escalateOn: ["verification_failed", "scope_expanded", "executor_unavailable"],
    maxTurns: task.maxTurns ?? defaultTurns(tier),
    maxCostUSD: task.maxCostUSD,
  }
}

function selectTier(task: TaskSpec) {
  if (task.risk === "high") return ModelTier.Deep
  if (task.domains?.length) return ModelTier.Deep
  if ((task.estimatedFiles ?? 0) > 8) return ModelTier.Deep
  if (task.risk === "medium") return ModelTier.Balanced
  if (task.mode === "write") return ModelTier.Balanced
  if (task.verification?.length) return ModelTier.Balanced
  if ((task.estimatedFiles ?? 0) > 2) return ModelTier.Balanced
  return ModelTier.Fast
}

function routeReasons(task: TaskSpec): RouteReason[] {
  return [
    ...(task.risk === "high" ? (["high_risk"] as const) : []),
    ...(task.domains?.length ? (["complex_domain"] as const) : []),
    ...((task.estimatedFiles ?? 0) > 8 ? (["large_scope"] as const) : []),
    ...(task.mode === "write" ? (["mutation"] as const) : (["read_only"] as const)),
    ...(task.verification?.length ? (["verification_required"] as const) : []),
  ]
}

function executorRank(task: TaskSpec, executor: ExecutorProfile) {
  const preferred = task.preferredExecutors?.indexOf(executor.id) ?? -1
  if (preferred >= 0) return preferred
  return (task.preferredExecutors?.length ?? 0) + executor.priority
}

function defaultTurns(tier: ModelTier) {
  if (tier === ModelTier.Fast) return 4
  if (tier === ModelTier.Balanced) return 12
  return 24
}
