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
  if (harness === Harness.OpenCode) return [executable, "run", prompt]
  if (harness === Harness.Codex) {
    return [executable, "exec", "--color", "never", ...(model ? ["--model", model] : []), prompt]
  }
  return [executable, "-p", "--output-format", "text", "--permission-mode", "acceptEdits", prompt]
}

export async function executeHarness(decision: RouteDecision, prompt: string, cwd: string) {
  try {
    const invocation = harnessInvocation(decision.harness, prompt, decision.model)
    const child = Bun.spawn(invocation, {
      cwd,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    })
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ])
    return {
      exitCode,
      stdout: stdout.trim(),
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
