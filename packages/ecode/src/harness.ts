export const Harness = {
  Router: "router",
  Ecode: "ecode",
  OpenCode: "opencode",
  Codex: "codex",
  ClaudeCode: "claude-code",
} as const

export type Harness = (typeof Harness)[keyof typeof Harness]
export type LocalHarness = Exclude<Harness, "router" | "ecode">
export type HarnessAccess = "read" | "write"

export type RouteDecision = {
  harness: LocalHarness
  model?: string
  access: HarnessAccess
}

export type HarnessTraceEvent =
  | { type: "status"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "command"; command: string; output?: string; exitCode?: number }
  | { type: "tool"; name: string; detail?: string }
  | { type: "file"; text: string }
  | { type: "message"; text: string }
  | { type: "error"; text: string }

export type HarnessResult = {
  exitCode: number
  stdout: string
  stderr: string
}

type HarnessMessage =
  | { type: "user"; text: string }
  | { type: "assistant"; content: readonly { type: string; text?: string }[] }
  | { type: "synthetic"; text: string; metadata?: Readonly<Record<string, unknown>> }
  | { type: string }

const HARNESS_MEMORY_CHARS = 24_000
const HARNESS_MEMORY_TURNS = 12
const HARNESS_MEMORY_TURN_CHARS = 8_000

export function routeTask(prompt: string): RouteDecision {
  const input = prompt.toLowerCase()
  const access = harnessAccess(prompt)
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
    return { harness: Harness.Codex, model: "gpt-6-astra", access }
  }

  const implementation = ["implement", "build", "create", "fix", "change", "update", "add ", "write tests", "debug"]
  if (prompt.length >= 220 || implementation.some((term) => input.includes(term))) {
    return { harness: Harness.ClaudeCode, access }
  }
  return { harness: Harness.Codex, model: "gpt-5.6-sol", access }
}

/**
 * Route via JEV (TypeSafe AI's System One model) when TYPESAFE_AI_KEY is set.
 * JEV is 70-500ms and $0.042/MTok — ideal for structured routing decisions.
 * Falls back to keyword-based routeTask() if the API is unavailable.
 */
export async function routeTaskWithJev(prompt: string): Promise<RouteDecision> {
  const apiKey =
    (typeof process !== "undefined" ? process.env.TYPESAFE_AI_KEY : undefined) ??
    (typeof Bun !== "undefined" ? Bun.env.TYPESAFE_AI_KEY : undefined)

  if (!apiKey) return routeTask(prompt)

  try {
    const response = await fetch("https://api.typesafe.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "jev",
        messages: [
          {
            role: "system",
            content:
              "You route coding tasks to the right AI harness. Reply with JSON only: { harness, model?, access }.\n" +
              'harness: "codex" | "claude-code" | "opencode"\n' +
              'model: "gpt-5.6-sol" (fast/read) | "gpt-6-astra" (deep/complex) — codex only\n' +
              'access: "read" | "write"',
          },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(2000),
    })

    if (!response.ok) return routeTask(prompt)

    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] }
    const content = data.choices?.[0]?.message?.content
    if (!content) return routeTask(prompt)

    const parsed = JSON.parse(content) as Partial<RouteDecision & { harness: string }>
    const harness =
      parsed.harness === "claude-code"
        ? Harness.ClaudeCode
        : parsed.harness === "opencode"
          ? Harness.OpenCode
          : Harness.Codex
    const access = parsed.access === "write" ? "write" : "read"
    return { harness, ...(parsed.model ? { model: parsed.model } : {}), access }
  } catch {
    return routeTask(prompt)
  }
}

export function harnessAccess(prompt: string): HarnessAccess {
  return /\b(implement|build|create|fix|change|update|add|write|modify|edit|delete|remove|rename|refactor|migrate|debug)\b/i.test(
    prompt,
  )
    ? "write"
    : "read"
}

export function requestsWorkspaceWrite(result: Pick<HarnessResult, "stdout" | "stderr">) {
  const output = `${result.stdout}\n${result.stderr}`
  return /(workspace write access|workspace-write|read[- ]only (?:file ?system|sandbox|session|environment)|(?:reopen|rerun).{0,80}(?:write access|writable)|(?:cannot|can't|unable to|blocked from).{0,80}(?:write|edit|modify|patch|change))/is.test(
    output,
  )
}

export function routeHarness(prompt: string): LocalHarness {
  return routeTask(prompt).harness
}

/** Give local CLIs a compact, harness-neutral transcript so switching harnesses preserves context. */
export function withHarnessMemory(prompt: string, messages: readonly HarnessMessage[]) {
  const turns = messages.flatMap((message) => {
    if (message.type === "user" && "text" in message) return message.text.trim() ? [`User: ${message.text.trim()}`] : []
    if (message.type === "assistant" && "content" in message) {
      const text = message.content
        .flatMap((part) => (part.type === "text" && part.text?.trim() ? [part.text.trim()] : []))
        .join("\n\n")
      return text ? [`Assistant (ecode): ${text}`] : []
    }
    if (message.type !== "synthetic" || !("text" in message)) return []
    const source = message.metadata?.source
    if (source === "harness-user") return message.text.trim() ? [`User: ${message.text.trim()}`] : []
    if (source !== "harness") return []
    const harness = stringValue(message.metadata?.harness)
    const actor =
      harness === Harness.ClaudeCode ? "Claude Code" : harness === Harness.OpenCode ? "OpenCode CLI" : "Codex CLI"
    return message.text.trim() ? [`Assistant (${actor}): ${message.text.trim()}`] : []
  })
  if (!turns.length) return prompt

  const selected: string[] = []
  let remaining = HARNESS_MEMORY_CHARS
  for (const turn of turns.slice(-HARNESS_MEMORY_TURNS).reverse()) {
    if (remaining <= 0) break
    const compact = turn.length <= HARNESS_MEMORY_TURN_CHARS ? turn : `${turn.slice(0, HARNESS_MEMORY_TURN_CHARS)}\n…`
    if (compact.length > remaining && selected.length > 0) break
    selected.push(compact.slice(0, remaining))
    remaining -= compact.length
  }
  selected.reverse()
  return [
    "Continue the existing ecode coding session. Use the prior conversation for context and preserve decisions already made.",
    "Do not claim that context is missing when the answer is present below. Inspect the current repository state before changing files.",
    "",
    "<ecode_session_history>",
    selected.join("\n\n"),
    "</ecode_session_history>",
    "",
    "<current_request>",
    prompt,
    "</current_request>",
  ].join("\n")
}

export function harnessInvocation(
  harness: LocalHarness,
  prompt: string,
  model?: string,
  executable = harnessName(harness),
  access: HarnessAccess = "read",
) {
  if (harness === Harness.OpenCode)
    return [executable, "run", "--format", "json", ...(access === "write" ? ["--auto"] : []), prompt]
  if (harness === Harness.Codex)
    return [
      executable,
      "exec",
      "--json",
      "--color",
      "never",
      "--sandbox",
      access === "write" ? "workspace-write" : "read-only",
      ...(model ? ["--model", model] : []),
      prompt,
    ]
  return [
    executable,
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--permission-mode",
    access === "write" ? "acceptEdits" : "plan",
    prompt,
  ]
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
      { type: "command", command, output: stringValue(item.aggregated_output), exitCode: numberValue(item.exit_code) },
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
  if (command)
    return [
      {
        type: "command",
        command,
        output: stringValue(state?.output),
        exitCode: numberValue(recordValue(state?.metadata)?.exit),
      },
    ]
  const path = stringValue(input?.path) ?? stringValue(input?.filePath)
  if (path) return [{ type: "file", text: `${name}: ${path}` }]
  return [{ type: "tool", name, detail: stringValue(state?.output) }]
}

function parseClaudeEvent(event: Record<string, unknown>): HarnessTraceEvent[] {
  const type = stringValue(event.type)
  if (type === "system") return [{ type: "status", text: "Claude Code started" }]
  if (type === "result") {
    const text = stringValue(event.result)
    if (event.is_error === true) {
      const errorText = text ?? "Claude Code failed"
      const isAuthError =
        /401|oauth.*expired|access token.*expired|authentication.*failed|re-?auth/i.test(errorText)
      if (isAuthError)
        return [{ type: "error", text: "Claude Code authentication expired — run: claude login" }]
      return [{ type: "error", text: errorText }]
    }
    return text ? [{ type: "message", text }] : []
  }
  const message = recordValue(event.message)
  return arrayValue(message?.content).flatMap((block): HarnessTraceEvent[] => {
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

export function harnessCommand(
  harness: LocalHarness,
  prompt: string,
  executable = harnessName(harness),
  access: HarnessAccess = "read",
) {
  return harnessInvocation(harness, prompt, undefined, executable, access).map(shellQuote).join(" ")
}

export function harnessName(harness: LocalHarness) {
  return harness === Harness.OpenCode ? "opencode" : harness === Harness.Codex ? "codex" : "claude"
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

function shellQuote(value: string) {
  if (/^[A-Za-z0-9_./-]+$/.test(value)) return value
  return `'${value.replaceAll("'", `'"'"'`)}'`
}
