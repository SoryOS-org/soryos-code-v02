import { z } from "zod"
import { Capability, ModelTier, type ExecutorProfile } from "./types.js"

const Models = z
  .object({
    fast: z.string().min(1).optional(),
    balanced: z.string().min(1).optional(),
    deep: z.string().min(1).optional(),
  })
  .refine((models) => Object.values(models).some(Boolean), "Configure at least one model tier")

const Common = {
  enabled: z.boolean().default(true),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  credentialEnv: z.string().min(1).optional(),
  capabilities: z.array(z.enum(Capability)).min(1),
  models: Models,
}

const ExecutorConfig = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("opencode"),
    ...Common,
  }),
  z.object({
    kind: z.literal("codex-cli"),
    ...Common,
    approval: z.enum(["untrusted", "on-failure", "on-request", "never"]).default("on-request"),
  }),
  z.object({
    kind: z.literal("claude-code-cli"),
    ...Common,
    permissionMode: z
      .object({
        read: z.string().min(1).default("plan"),
        write: z.string().min(1).default("acceptEdits"),
      })
      .default({ read: "plan", write: "acceptEdits" }),
  }),
])

export const EcodeConfig = z.object({
  version: z.literal(1),
  defaultExecutor: z.string().min(1).optional(),
  executors: z.record(z.string().min(1), ExecutorConfig),
})

export type EcodeConfig = z.infer<typeof EcodeConfig>
export type ExecutorConfig = z.infer<typeof ExecutorConfig>

export function parseConfig(input: unknown) {
  return EcodeConfig.parse(input)
}

export async function loadConfig(file: string) {
  return parseConfig(await Bun.file(file).json())
}

export function executorProfiles(config: EcodeConfig): ExecutorProfile[] {
  return Object.entries(config.executors).map(([id, executor], priority) => ({
    id,
    available: executor.enabled,
    capabilities: executor.capabilities,
    tiers: Object.values(ModelTier).filter((tier) => executor.models[tier] !== undefined),
    priority,
  }))
}

export function modelForTier(executor: ExecutorConfig, tier: ModelTier) {
  const model = executor.models[tier]
  if (!model) throw new Error(`Executor ${executor.kind} does not configure the ${tier} tier`)
  return model
}
