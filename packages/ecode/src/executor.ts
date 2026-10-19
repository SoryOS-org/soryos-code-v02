import type { ModelTier, TaskSpec } from "./types.js"

export type RunRequest = {
  task: TaskSpec
  tier: ModelTier
  workspace: string
}

export type RunResult = {
  runID: string
  sessionID?: string
  status: "completed" | "failed" | "cancelled"
  summary?: string
}

export type RunEvent =
  | { type: "run.started"; runID: string; sessionID?: string }
  | { type: "assistant.delta"; runID: string; text: string }
  | { type: "tool.requested"; runID: string; tool: string; callID: string }
  | { type: "tool.completed"; runID: string; callID: string; output?: string }
  | { type: "approval.required"; runID: string; callID: string; reason: string }
  | { type: "file.changed"; runID: string; path: string }
  | { type: "usage.updated"; runID: string; inputTokens?: number; outputTokens?: number; costUSD?: number }
  | { type: "run.completed"; runID: string }
  | { type: "run.failed"; runID: string; error: string }

export type RunHandle = {
  id: string
  events: AsyncIterable<RunEvent>
  wait(): Promise<RunResult>
}

export type Executor = {
  id: string
  start(request: RunRequest, signal?: AbortSignal): Promise<RunHandle>
  resume(sessionID: string, input: string, signal?: AbortSignal): Promise<RunHandle>
  cancel(runID: string): Promise<void>
}
