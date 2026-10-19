export const Capability = {
  Files: "files",
  Shell: "shell",
  Network: "network",
  Browser: "browser",
  MCP: "mcp",
} as const

export type Capability = (typeof Capability)[keyof typeof Capability]

export const ModelTier = {
  Fast: "fast",
  Balanced: "balanced",
  Deep: "deep",
} as const

export type ModelTier = (typeof ModelTier)[keyof typeof ModelTier]

export type TaskSpec = {
  id: string
  objective: string
  mode: "read" | "write"
  risk: "low" | "medium" | "high"
  domains?: ("security" | "database" | "concurrency")[]
  requiredCapabilities: Capability[]
  preferredExecutors?: string[]
  estimatedFiles?: number
  verification?: string[]
  maxTurns?: number
  maxCostUSD?: number
}

export type ExecutorProfile = {
  id: string
  available: boolean
  capabilities: Capability[]
  tiers: ModelTier[]
  priority: number
}

export type RouteReason =
  | "high_risk"
  | "complex_domain"
  | "large_scope"
  | "mutation"
  | "verification_required"
  | "read_only"

export type EscalationTrigger = "verification_failed" | "scope_expanded" | "executor_unavailable"

export type RouteDecision = {
  executor: string
  tier: ModelTier
  reasons: RouteReason[]
  escalateOn: EscalationTrigger[]
  maxTurns: number
  maxCostUSD?: number
}
