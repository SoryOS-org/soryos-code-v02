#!/usr/bin/env bun

import { parseArgs } from "node:util"
import path from "node:path"
import { executorCommand } from "./command.js"
import { executorProfiles, loadConfig, modelForTier } from "./config.js"
import { runProcess } from "./process.js"
import { routeTask } from "./router.js"
import { Capability, type TaskSpec } from "./types.js"

const args = process.argv.slice(2)
const command = args[0]

if (!command) {
  await opencode([])
} else if (command === "help" || command === "--help" || command === "-h") {
  help()
} else if (command === "doctor") {
  await doctor(args.slice(1))
} else if (command === "route" || command === "run") {
  await route(command, args.slice(1))
} else if (command === "opencode") {
  await opencode(args.slice(1))
} else {
  await opencode(args)
}

async function opencode(args: string[]) {
  process.exitCode = await runProcess(["opencode", ...args], process.cwd())
}

async function doctor(args: string[]) {
  const parsed = parseArgs({
    args,
    options: { config: { type: "string", default: "ecode.config.json" } },
    strict: true,
  })
  const config = await loadConfig(path.resolve(parsed.values.config))
  const results = Object.entries(config.executors).map(([id, executor]) => {
    const executable = Bun.which(executor.command)
    const credential = !executor.credentialEnv || Boolean(process.env[executor.credentialEnv])
    return {
      executor: id,
      kind: executor.kind,
      enabled: executor.enabled,
      command: executable ? "ready" : `missing: ${executor.command}`,
      credential: credential ? "ready" : `missing: ${executor.credentialEnv}`,
      tiers: Object.keys(executor.models),
    }
  })
  console.log(JSON.stringify(results, null, 2))
  if (
    results.some(
      (result) => result.enabled && (result.command.startsWith("missing") || result.credential.startsWith("missing")),
    )
  ) {
    process.exitCode = 1
  }
}

async function route(action: "route" | "run", args: string[]) {
  const parsed = parseArgs({
    args,
    options: {
      config: { type: "string", default: "ecode.config.json" },
      task: { type: "string" },
      cwd: { type: "string", default: process.cwd() },
      mode: { type: "string", default: "read" },
      risk: { type: "string", default: "low" },
      executor: { type: "string" },
      capability: { type: "string", multiple: true, default: [Capability.Files] },
      verify: { type: "string", multiple: true },
      "estimated-files": { type: "string" },
      "max-turns": { type: "string" },
      "max-cost-usd": { type: "string" },
      "dry-run": { type: "boolean", default: false },
    },
    allowPositionals: true,
    strict: true,
  })
  const config = await loadConfig(path.resolve(parsed.values.config))
  const objective = parsed.values.task ?? parsed.positionals.join(" ")
  if (!objective) throw new Error("Pass a task with --task or as positional text")
  if (parsed.values.mode !== "read" && parsed.values.mode !== "write") throw new Error("--mode must be read or write")
  if (!isRisk(parsed.values.risk)) throw new Error("--risk must be low, medium, or high")
  const capabilities = parsed.values.capability.map((item) => {
    if (!isCapability(item)) throw new Error(`Unknown capability: ${item}`)
    return item
  })
  const preferred = parsed.values.executor ?? config.defaultExecutor
  const task: TaskSpec = {
    id: crypto.randomUUID(),
    objective,
    mode: parsed.values.mode,
    risk: parsed.values.risk,
    requiredCapabilities: capabilities,
    preferredExecutors: preferred ? [preferred] : undefined,
    verification: parsed.values.verify,
    estimatedFiles: optionalNumber(parsed.values["estimated-files"], "--estimated-files"),
    maxTurns: optionalNumber(parsed.values["max-turns"], "--max-turns"),
    maxCostUSD: optionalNumber(parsed.values["max-cost-usd"], "--max-cost-usd"),
  }
  const decision = routeTask(task, executorProfiles(config))
  const executor = config.executors[decision.executor]
  if (!executor) throw new Error(`Missing executor configuration: ${decision.executor}`)
  if (executor.credentialEnv && !process.env[executor.credentialEnv]) {
    throw new Error(`Executor ${decision.executor} requires environment variable ${executor.credentialEnv}`)
  }
  const invocation = executorCommand(executor, task, decision)
  const output = {
    task,
    decision,
    model: modelForTier(executor, decision.tier),
    invocation,
    cwd: path.resolve(parsed.values.cwd),
  }
  if (action === "route" || parsed.values["dry-run"]) {
    console.log(JSON.stringify(output, null, 2))
    return
  }
  process.exitCode = await runProcess(invocation, output.cwd)
}

function isRisk(input: string): input is TaskSpec["risk"] {
  return input === "low" || input === "medium" || input === "high"
}

function isCapability(input: string): input is (typeof Capability)[keyof typeof Capability] {
  return Object.values(Capability).some((capability) => capability === input)
}

function optionalNumber(input: string | undefined, flag: string) {
  if (input === undefined) return
  const value = Number(input)
  if (!Number.isFinite(value) || value < 0) throw new Error(`${flag} must be a non-negative number`)
  return value
}

function help() {
  console.log(`ecode — everyday code, routed to the right coding agent

Usage:
  ecode                              Open the OpenCode interactive UI
  ecode doctor [--config ecode.config.json]
  ecode route --task "Explain the auth flow" [options]
  ecode run --task "Fix the failing test" --mode write [options]
  ecode opencode <command> [args]    Run an OpenCode command explicitly
  ecode <opencode-command> [args]    Run any other OpenCode command

Options:
  --config <path>            Configuration file (default: ecode.config.json)
  --cwd <path>               Target repository (default: current directory)
  --executor <id>            Prefer one configured executor
  --mode <read|write>        Workspace access intent
  --risk <low|medium|high>   Task risk used by routing
  --capability <name>        Required capability; repeatable
  --verify <command>         Verification command; repeatable
  --estimated-files <count>  Expected change scope
  --max-turns <count>        Override router turn budget
  --max-cost-usd <amount>    Cost ceiling where supported
  --dry-run                  Print the route and native command without running it`)
}
