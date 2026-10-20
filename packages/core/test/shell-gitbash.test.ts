import { expect } from "bun:test"
import { Effect } from "effect"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { Config } from "@opencode/core/config"
import { Environment } from "@opencode/core/environment/index"
import { Location } from "@opencode/core/location"
import { Shell } from "@opencode/core/shell"
import { ShellSelect } from "@opencode/core/shell/select"
import { Global } from "@opencode/util/global"
import { hostEnvironmentLayer } from "./fixture/environment"
import { tempGlobalLayer } from "./fixture/global"
import { tempLocationLayer } from "./fixture/location"
import { it } from "./lib/effect"

// Git Bash re-splits its Windows command line, so these only exercise anything on Windows. gitbash() misses
// when git resolves to mingw64/bin, as it does inside a Git Bash session such as CI's.
const bash = process.platform === "win32" ? (ShellSelect.gitbash() ?? Bun.which("bash") ?? undefined) : undefined
const live = bash ? it.live : it.live.skip

const run = (command: string) =>
  Effect.gen(function* () {
    const shell = yield* Shell.Service
    return yield* shell.result(yield* shell.create({ shell: bash, command, timeout: 0 }))
  }).pipe(
    Effect.provide(
      AppNodeBuilder.build(Shell.node, [
        Location.node.replace(tempLocationLayer),
        Global.node.replace(tempGlobalLayer),
        Config.node.replace(Config.testLayer()),
        Environment.node.replace(hostEnvironmentLayer),
      ]),
    ),
  )

live("passes backslashes, quotes and long commands to Git Bash unchanged", () =>
  Effect.gen(function* () {
    // Longer than the msys runtime's 8192-char glob buffer.
    const text = String.raw`a\\b "c\"d" e\f` + "x".repeat(9000)
    expect(yield* run(`cat <<'EOF'\n${text}\nEOF\nexit 7`)).toMatchObject({
      info: { status: "exited", exit: 7 },
      capture: { output: `${text}\n` },
    })
  }),
)

live("does not expose the command to child processes", () =>
  Effect.gen(function* () {
    expect(yield* run("printenv OPENCODE_SHELL_COMMAND || echo unset")).toMatchObject({
      info: { status: "exited", exit: 0 },
      capture: { output: "unset\n" },
    })
  }),
)
