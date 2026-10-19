import { describe, expect, test } from "bun:test"
import { NoExecutorAvailableError, routeTask } from "./router.js"
import { Capability, ModelTier, type ExecutorProfile, type TaskSpec } from "./types.js"

const executors: ExecutorProfile[] = [
  {
    id: "opencode",
    available: true,
    capabilities: [Capability.Files, Capability.Shell, Capability.Network, Capability.MCP],
    tiers: [ModelTier.Fast, ModelTier.Balanced, ModelTier.Deep],
    priority: 0,
  },
  {
    id: "codex",
    available: true,
    capabilities: [Capability.Files, Capability.Shell, Capability.Network, Capability.MCP],
    tiers: [ModelTier.Balanced, ModelTier.Deep],
    priority: 1,
  },
  {
    id: "claude-code",
    available: true,
    capabilities: [Capability.Files, Capability.Shell, Capability.Browser, Capability.MCP],
    tiers: [ModelTier.Fast, ModelTier.Balanced, ModelTier.Deep],
    priority: 2,
  },
]

function task(overrides: Partial<TaskSpec> = {}): TaskSpec {
  return {
    id: "task-1",
    objective: "Explain the request flow",
    mode: "read",
    risk: "low",
    requiredCapabilities: [Capability.Files],
    ...overrides,
  }
}

describe("routeTask", () => {
  test("uses the fast tier for a narrow read-only task", () => {
    expect(routeTask(task(), executors)).toMatchObject({
      executor: "opencode",
      tier: ModelTier.Fast,
      reasons: ["read_only"],
      maxTurns: 4,
    })
  })

  test("uses the balanced tier for a mutating task with verification", () => {
    expect(
      routeTask(
        task({ mode: "write", objective: "Add input validation", verification: ["bun test"], estimatedFiles: 3 }),
        executors,
      ),
    ).toMatchObject({
      tier: ModelTier.Balanced,
      reasons: ["mutation", "verification_required"],
      maxTurns: 12,
    })
  })

  test("uses the deep tier for high-risk domains", () => {
    expect(routeTask(task({ risk: "high", domains: ["security"] }), executors)).toMatchObject({
      tier: ModelTier.Deep,
      reasons: ["high_risk", "complex_domain", "read_only"],
      maxTurns: 24,
    })
  })

  test("honors executor preference after capability filtering", () => {
    expect(
      routeTask(
        task({
          preferredExecutors: ["claude-code", "opencode"],
          requiredCapabilities: [Capability.Browser],
        }),
        executors,
      ).executor,
    ).toBe("claude-code")
  })

  test("fails when no executor supports the task", () => {
    expect(() => routeTask(task({ requiredCapabilities: [Capability.Browser] }), executors.slice(0, 2))).toThrow(
      NoExecutorAvailableError,
    )
  })
})
