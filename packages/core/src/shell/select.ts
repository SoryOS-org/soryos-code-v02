export * as ShellSelect from "./select.js"

import path from "path"
import { readFile } from "fs/promises"
import { statSync } from "fs"
import { Context, Effect, Layer, Schema } from "effect"
import { makeLocationNode } from "@opencode/util/effect/app-node"
import { FSUtil } from "@opencode/util/fs-util"
import { Global } from "@opencode/util/global"
import { State } from "../state.js"
import { which } from "../util/which.js"

const META: Record<string, { deny?: boolean; login?: boolean; ps?: boolean }> = {
  bash: { login: true },
  dash: { login: true },
  fish: { deny: true, login: true },
  ksh: { login: true },
  nu: { deny: true },
  powershell: { ps: true },
  pwsh: { ps: true },
  sh: { login: true },
  zsh: { login: true },
}

export type Item = {
  path: string
  name: string
  acceptable: boolean
}

export const Options = Schema.Struct({
  gitbash: Schema.optional(Schema.String),
})
export type Options = typeof Options.Type

type Data = {
  shell?: string
}

export type Editor = {
  configure: (shell: string) => void
}

export type ResolveInput = {
  priority: "config" | "compat"
}

export interface Interface extends State.Transformable<Editor> {
  readonly resolve: (input: ResolveInput) => Effect.Effect<string>
  readonly list?: () => Effect.Effect<Item[]>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/ShellSelect") {}

function stat(file: string) {
  return statSync(file, { throwIfNoEntry: false }) ?? undefined
}

function findExecutable(name: string, bin?: string) {
  return which(name, undefined, bin)
}

function full(file: string, options?: Options, bin?: string) {
  if (process.platform !== "win32") return file
  const shell = FSUtil.windowsPath(file)
  if (path.win32.dirname(shell) !== ".") {
    if (shell.startsWith("/") && name(shell) === "bash") return gitbash(options, bin) || shell
    return shell
  }
  if (name(shell) === "bash") return gitbash(options, bin) || findExecutable(shell, bin) || shell
  return findExecutable(shell, bin) || shell
}

function meta(file: string) {
  return META[name(file)]
}

function compatible(file: string) {
  return meta(file)?.deny !== true
}

function rooted(file: string) {
  return path.isAbsolute(FSUtil.windowsPath(file))
}

function executable(file: string, options?: Options, bin?: string) {
  const shell = full(file, options, bin)
  if (rooted(shell)) {
    if (stat(shell)?.isFile()) return shell
    return
  }
  return findExecutable(shell, bin) ?? undefined
}

function win(options?: Options, bin?: string) {
  return Array.from(
    new Set(
      [
        findExecutable("pwsh", bin),
        findExecutable("powershell", bin),
        gitbash(options, bin),
        process.env.COMSPEC || "cmd.exe",
      ]
        .filter((item): item is string => Boolean(item))
        .map((file) => full(file, options, bin)),
    ),
  )
}

async function unix() {
  const text = await readFile("/etc/shells", "utf8").catch(() => "")
  if (text) return Array.from(new Set(text.split("\n").filter((line) => line.trim() && !line.startsWith("#"))))
  return ["/bin/bash", "/bin/zsh", "/bin/sh"]
}

function select(file: string | undefined, options?: Options, opts?: { compatible?: boolean }, bin?: string) {
  if (file && (!opts?.compatible || compatible(file))) {
    const shell = executable(file, options, bin)
    if (shell) return shell
  }
  if (process.platform === "win32") return win(options, bin)[0]
  return fallback(bin)
}

export function gitbash(options?: Options, bin?: string) {
  if (process.platform !== "win32") return
  if (options?.gitbash) return options.gitbash
  const git = findExecutable("git", bin)
  if (!git) return
  const file = path.join(git, "..", "..", "bin", "bash.exe")
  if (stat(file)?.size) return file
}

function fallback(bin?: string) {
  if (process.platform === "darwin") return "/bin/zsh"
  const bash = findExecutable("bash", bin)
  if (bash) return bash
  return "/bin/sh"
}

export function name(file: string) {
  if (process.platform === "win32") return path.win32.parse(FSUtil.windowsPath(file)).name.toLowerCase()
  return path.basename(file).toLowerCase()
}

export function login(file: string) {
  return meta(file)?.login === true
}

export function ps(file: string) {
  return meta(file)?.ps === true
}

function info(file: string, options?: Options, bin?: string): Item {
  const item = full(file, options, bin)
  const n = name(item)
  return {
    path: item,
    name: executable(n, options, bin) ? n : item,
    acceptable: compatible(item),
  }
}

// MSYS2 and Cygwin programs such as Git Bash split their Windows command line with rules that differ from the
// MSVCRT quoting Node and Bun use: `\\` collapses to `\` and quoted arguments over 8192 chars are truncated.
// On Windows, bash reads the command from the environment instead, which any native bash inherits. The fixed
// script contains no `"` or `\`, so it decodes the same with or without MSYS=noglob. It disables globbing and
// field splitting so the unquoted expansion stays verbatim; the variable's value restores both and unsets
// itself before the command runs.
const COMMAND_ENV = "OPENCODE_SHELL_COMMAND"

export function launch(file: string, command: string): { args: string[]; env?: Record<string, string> } {
  const n = name(file)
  if (n === "cmd") return { args: ["/c", command] }
  if (ps(file)) return { args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command] }
  if (process.platform === "win32" && (n === "bash" || n === "sh") && !wsl(file))
    return {
      args: ["-c", `set -f;IFS=;eval $${COMMAND_ENV}`],
      env: { [COMMAND_ENV]: `set +f;IFS=$' \\t\\n';unset ${COMMAND_ENV};${command}` },
    }
  return { args: ["-c", command] }
}

// The WSL launcher is a system component under the Windows directory and does not forward the environment.
function wsl(file: string) {
  const exe = rooted(file) ? FSUtil.windowsPath(file) : findExecutable(file)
  if (!exe) return false
  const relative = path.win32.relative(process.env.SystemRoot ?? "C:\\Windows", exe)
  return !relative.startsWith("..") && !path.win32.isAbsolute(relative)
}

// Resolve afresh so removing a shell does not leave terminals using a stale cached path.
export function environment(bin?: string, filter?: { compatible?: boolean }) {
  return select(process.env.SHELL, undefined, filter, bin) ?? fallback(bin)
}

let defaultConfigured: { bin?: string; value: string } | undefined
let defaultCompatible: { bin?: string; value: string } | undefined

export function resolve(input: ResolveInput, configShell?: string, options?: Options, bin?: string) {
  const filter = input.priority === "compat" ? { compatible: true } : undefined
  if (configShell) return select(configShell, options, filter, bin)
  if (options?.gitbash) return select(process.env.SHELL, options, filter, bin)
  const cached = input.priority === "compat" ? defaultCompatible : defaultConfigured
  if (cached && cached.bin === bin) return cached.value
  const value = environment(bin, filter)
  if (input.priority === "compat") defaultCompatible = { bin, value }
  if (input.priority === "config") defaultConfigured = { bin, value }
  return value
}
resolve.reset = () => {
  defaultConfigured = undefined
  defaultCompatible = undefined
}

export async function list(options?: Options, bin?: string): Promise<Item[]> {
  const shells = process.platform === "win32" ? win(options, bin) : await unix()
  return shells.filter((shell) => executable(shell, options, bin)).map((shell) => info(shell, options, bin))
}

const layer = (options?: Options) =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const global = yield* Global.Service
      const state = State.create<Data, Editor>({
        name: "shell-select",
        initial: () => ({}),
        editor: (editor) => ({
          configure: (shell) => {
            editor.shell = shell
          },
        }),
      })
      return Service.of({
        transform: state.transform,
        reload: state.reload,
        resolve: (input) => Effect.sync(() => resolve(input, state.get().shell, options, global.bin)),
        list: () => Effect.promise(() => list(options, global.bin)),
      })
    }),
  )

export function configured(options?: Options) {
  return makeLocationNode({ service: Service, layer: layer(options), deps: [Global.node] })
}

export const node = configured()
