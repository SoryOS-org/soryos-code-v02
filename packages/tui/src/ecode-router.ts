import { existsSync } from "node:fs"
import {
  Harness,
  harnessInvocation,
  parseHarnessEvent,
  type HarnessTraceEvent,
  type RouteDecision,
} from "@opencode/ecode/harness"

export {
  Harness,
  harnessAccess,
  harnessCommand,
  harnessInvocation,
  parseHarnessEvent,
  requestsWorkspaceWrite,
  routeHarness,
  routeTask,
  routeTaskWithJev,
  withHarnessMemory,
} from "@opencode/ecode/harness"
export type {
  HarnessAccess,
  HarnessResult,
  HarnessTraceEvent,
  LocalHarness,
  RouteDecision,
} from "@opencode/ecode/harness"

export const harnessOptions = [
  { id: Harness.Router, title: "Router", description: "Automatically choose the best coding harness" },
  { id: Harness.OpenCode, title: "OpenCode CLI", description: "Run the task with your local OpenCode CLI" },
  { id: Harness.Codex, title: "Codex CLI", description: "Run the task with Codex" },
  { id: Harness.ClaudeCode, title: "Claude Code", description: "Run the task with Claude Code" },
  { id: Harness.Ecode, title: "ecode engine", description: "Use a provider model inside ecode" },
] as const

export async function executeHarness(
  decision: RouteDecision,
  prompt: string,
  cwd: string,
  onTrace: (event: Exclude<HarnessTraceEvent, { type: "message" }>) => void | Promise<void> = () => {},
) {
  try {
    const invocation = harnessInvocation(
      decision.harness,
      prompt,
      decision.model,
      harnessExecutable(decision.harness),
      decision.access,
    )
    const child = Bun.spawn(invocation, {
      cwd,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    })
    const messages: string[] = []
    const raw: string[] = []
    const stdout = readLines(child.stdout, async (line) => {
      raw.push(line)
      const events = parseHarnessEvent(decision.harness, line)
      for (const event of events) {
        if (event.type === "message") messages.push(event.text)
        else await onTrace(event)
      }
    })
    const [, stderr, exitCode] = await Promise.all([stdout, new Response(child.stderr).text(), child.exited])
    return {
      exitCode,
      stdout: messages.join("\n\n").trim() || raw.join("\n").trim(),
      stderr: stderr.trim(),
    }
  } catch (error) {
    return {
      exitCode: 127,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
    }
  }
}

export function harnessExecutable(harness: RouteDecision["harness"]) {
  const name = harness === Harness.OpenCode ? "opencode" : harness === Harness.Codex ? "codex" : "claude"
  const found = Bun.which(name)
  if (found) return found

  const home = Bun.env.HOME
  const candidates =
    harness === Harness.Codex
      ? ["/Applications/ChatGPT.app/Contents/Resources/codex"]
      : harness === Harness.OpenCode
        ? ["/opt/homebrew/bin/opencode", "/usr/local/bin/opencode", home ? `${home}/.local/bin/opencode` : undefined]
        : [home ? `${home}/.local/bin/claude` : undefined, "/usr/local/bin/claude"]
  return candidates.find((candidate): candidate is string => candidate !== undefined && existsSync(candidate)) ?? name
}

async function readLines(stream: ReadableStream<Uint8Array>, onLine: (line: string) => void | Promise<void>) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let pending = ""
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    pending += decoder.decode(chunk.value, { stream: true })
    const lines = pending.split(/\r?\n/)
    pending = lines.pop() ?? ""
    for (const line of lines) if (line.trim()) await onLine(line)
  }
  pending += decoder.decode()
  if (pending.trim()) await onLine(pending)
}
