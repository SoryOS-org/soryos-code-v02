import { existsSync } from "node:fs"

export const Harness = {
  Router: "router",
  Ecode: "ecode",
  OpenCode: "opencode",
  Codex: "codex",
  ClaudeCode: "claude-code",
} as const

export type Harness = (typeof Harness)[keyof typeof Harness]
export type LocalHarness = Exclude<Harness, "router" | "ecode">

export type RouteDecision = {
  harness: LocalHarness
  model?: string
}

export type HarnessTraceEvent =
  | { type: "status"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "command"; command: string; output?: string; exitCode?: number }
  | { type: "tool"; name: string; detail?: string }
  | { type: "file"; text: string }
  | { type: "message"; text: string }
  | { type: "error"; text: string }

export const harnessOptions = [
  { id: Harness.Router, title: "Router", description: "Automatically choose the best coding harness" },
  { id: Harness.OpenCode, title: "OpenCode CLI", description: "Run the task with your local OpenCode CLI" },
  { id: Harness.Codex, title: "Codex CLI", description: "Run the task with Codex" },
  { id: Harness.ClaudeCode, title: "Claude Code", description: "Run the task with Claude Code" },
  { id: Harness.Ecode, title: "ecode engine", description: "Use a provider model inside ecode" },
] as const

export function routeTask(prompt: string): RouteDecision {
  const input = prompt.toLowerCase()
  const deep = [
    "architecture",
    "migrate",
    "migration",
    "security",
    "vulnerability",
    "race condition",
    "distributed",
    "refactor",
    "root cause",
    "across the codebase",
  ]
  if (prompt.length >= 600 || deep.some((term) => input.includes(term))) {
    return { harness: Harness.Codex, model: "gpt-6-astra" }
  }

  const implementation = ["implement", "build", "create", "fix", "change", "update", "add ", "write tests", "debug"]
  if (prompt.length >= 220 || implementation.some((term) => input.includes(term))) {
    return { harness: Harness.ClaudeCode }
  }
  return { harness: Harness.Codex, model: "gpt-5.6-sol" }
}

export function routeHarness(prompt: string): LocalHarness {
  return routeTask(prompt).harness
}

export function harnessInvocation(
  harness: LocalHarness,
  prompt: string,
  model?: string,
  executable = harnessExecutable(harness),
) {
  if (harness === Harness.OpenCode) return [executable, "run", "--format", "json", prompt]
  if (harness === Harness.Codex) {
    return [executable, "exec", "--json", "--color", "never", ...(model ? ["--model", model] : []), prompt]
  }
  return [executable, "-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "acceptEdits", prompt]
}

export async function executeHarness(
  decision: RouteDecision,
  prompt: string,
  cwd: string,
  onTrace: (event: Exclude<HarnessTraceEvent, { type: "message" }>) => void | Promise<void> = () => {},
) {
  try {
    const invocation = harnessInvocation(decision.harness, prompt, decision.model)
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

export function parseHarnessEvent(harness: LocalHarness, line: string): HarnessTraceEvent[] {
  const value = parseRecord(line)
  if (!value) return []
  if (harness === Harness.Codex) return parseCodexEvent(value)
  if (harness === Harness.OpenCode) return parseOpenCodeEvent(value)
  return parseClaudeEvent(value)
}

function parseCodexEvent(event: Record<string, unknown>): HarnessTraceEvent[] {
  const type = stringValue(event.type)
  if (type === "turn.started") return [{ type: "status", text: "Working…" }]
  if (type === "turn.failed") return [{ type: "error", text: messageValue(event.error) ?? "Codex turn failed" }]
  const item = recordValue(event.item)
  if (!item) return []
  const itemType = stringValue(item.type)
  if (itemType === "reasoning" && type === "item.completed") {
    const text = stringValue(item.text)
    return text ? [{ type: "reasoning", text }] : []
  }
  if (itemType === "agent_message" && type === "item.completed") {
    const text = stringValue(item.text)
    return text ? [{ type: "message", text }] : []
  }
  if (itemType === "command_execution") {
    const command = stringValue(item.command)
    if (!command) return []
    if (type === "item.started") return [{ type: "status", text: `Running: ${command}` }]
    if (type !== "item.completed") return []
    return [
      {
        type: "command",
        command,
        output: stringValue(item.aggregated_output),
        exitCode: numberValue(item.exit_code),
      },
    ]
  }
  if (itemType === "file_change" && type === "item.completed") {
    const changes = arrayValue(item.changes)
      .flatMap((change) => {
        const value = recordValue(change)
        const path = value && stringValue(value.path)
        const kind = value && (stringValue(value.kind) ?? stringValue(value.type))
        return path ? [`${kind ?? "changed"}: ${path}`] : []
      })
      .join("\n")
    return changes ? [{ type: "file", text: changes }] : [{ type: "file", text: "Files changed" }]
  }
  return []
}

function parseOpenCodeEvent(event: Record<string, unknown>): HarnessTraceEvent[] {
  const type = stringValue(event.type)
  if (type === "step_start") return [{ type: "status", text: "Working…" }]
  if (type === "reasoning") {
    const text = stringValue(recordValue(event.part)?.text)
    return text ? [{ type: "reasoning", text }] : []
  }
  if (type === "text") {
    const text = stringValue(recordValue(event.part)?.text)
    return text ? [{ type: "message", text }] : []
  }
  if (type === "error") return [{ type: "error", text: messageValue(event.error) ?? "OpenCode failed" }]
  if (type !== "tool_use") return []
  const part = recordValue(event.part)
  if (!part) return []
  const name = stringValue(part.name) ?? stringValue(part.tool) ?? "tool"
  const state = recordValue(part.state)
  const input = recordValue(state?.input)
  const command = stringValue(input?.command)
  if (command) {
    return [
      {
        type: "command",
        command,
        output: stringValue(state?.output),
        exitCode: numberValue(recordValue(state?.metadata)?.exit),
      },
    ]
  }
  const path = stringValue(input?.path) ?? stringValue(input?.filePath)
  if (path) return [{ type: "file", text: `${name}: ${path}` }]
  return [{ type: "tool", name, detail: stringValue(state?.output) }]
}

function parseClaudeEvent(event: Record<string, unknown>): HarnessTraceEvent[] {
  const type = stringValue(event.type)
  if (type === "system") return [{ type: "status", text: "Claude Code started" }]
  if (type === "result") {
    const text = stringValue(event.result)
    if (event.is_error === true) return [{ type: "error", text: text ?? "Claude Code failed" }]
    return text ? [{ type: "message", text }] : []
  }
  const message = recordValue(event.message)
  const content = arrayValue(message?.content)
  return content.flatMap((block): HarnessTraceEvent[] => {
    const value = recordValue(block)
    if (!value) return []
    const blockType = stringValue(value.type)
    if (blockType === "thinking") {
      const text = stringValue(value.thinking)
      return text ? [{ type: "reasoning", text }] : []
    }
    if (blockType !== "tool_use") return []
    const name = stringValue(value.name) ?? "tool"
    const input = recordValue(value.input)
    const command = stringValue(input?.command)
    if (command) return [{ type: "status", text: `Running: ${command}` }]
    const path = stringValue(input?.file_path) ?? stringValue(input?.path)
    if (path) return [{ type: "file", text: `${name}: ${path}` }]
    return [{ type: "tool", name }]
  })
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

function parseRecord(value: string) {
  try {
    return recordValue(JSON.parse(value))
  } catch {
    return undefined
  }
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function messageValue(value: unknown) {
  return stringValue(value) ?? stringValue(recordValue(value)?.message)
}

export function harnessCommand(harness: LocalHarness, prompt: string, executable = harnessExecutable(harness)) {
  return harnessInvocation(harness, prompt, undefined, executable).map(shellQuote).join(" ")
}

export function harnessExecutable(harness: LocalHarness) {
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

function shellQuote(value: string) {
  if (/^[A-Za-z0-9_./-]+$/.test(value)) return value
  return `'${value.replaceAll("'", `'"'"'`)}'`
}
