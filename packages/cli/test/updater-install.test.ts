import { NodeServices } from "@effect/platform-node"
import { EffectFlock } from "@lutungcode/util/effect-flock"
import { LayerNode } from "@lutungcode/util/effect/layer-node"
import { Global } from "@lutungcode/util/global"
import { AppProcess } from "@lutungcode/util/process"
import { expect, spyOn, test } from "bun:test"
import { Effect, FileSystem, Layer, PlatformError, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"
import { existsSync, readdirSync } from "node:fs"
import path from "node:path"
import { Updater } from "../src/services/updater"
import { testEffect } from "../../core/test/lib/effect"

const it = testEffect(NodeServices.layer)

declare const LUTUNGCODE_CLI_NAME: string | undefined

function fixture(
  respond: (command: ChildProcess.StandardCommand) => Partial<AppProcess.RunResult> & {
    error?: AppProcess.AppProcessError
  } = () => ({}),
  name = "@lutungcode/cli",
  failCleanup = false,
  releasePackage = name,
  formula?: string,
  executableOverride?: (root: string, home: string) => Effect.Effect<string, PlatformError.PlatformError, FileSystem.FileSystem>,
) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "lutungcode-updater-" })
    const execPath = process.execPath
    const modules = path.join(root, "node_modules")
    const executable = executableOverride
      ? yield* executableOverride(root, path.join(root, "home"))
      : formula
        ? path.join(root, "Cellar", formula, "2.0.20", "bin", "lutungcode")
        : path.join(modules, "@lutungcode", "cli", "bin", "lutungcode")
    yield* fs.makeDirectory(path.dirname(executable), { recursive: true })
    yield* fs.writeFileString(executable, "binary")
    if (!formula && !executableOverride)
      yield* fs.writeFileString(
        path.join(modules, "@lutungcode", "cli", "package.json"),
        JSON.stringify({ name, bin: { lutungcode: "bin/lutungcode" } }),
      )
    const requests: string[] = []
    // The updater uses global fetch; scope this replacement to each install test.
    yield* Effect.acquireRelease(
      Effect.sync(() =>
        spyOn(globalThis, "fetch").mockImplementation(
          Object.assign(
            async (input: string | URL | Request) => {
              const url = input instanceof Request ? input.url : input.toString()
              requests.push(url)
              if (new URL(url).hostname === "formulae.brew.sh") return Response.json({ versions: { stable: "2.0.21" } })
              return Response.json({ version: "2.3.4", metadata: { package: releasePackage } })
            },
            { preconnect: fetch.preconnect },
          ),
        ),
      ),
      (request) => Effect.sync(() => request.mockRestore()),
    )
    const global = Global.make({
      home: path.join(root, "home"),
      data: path.join(root, "data"),
      cache: path.join(root, "cache"),
      config: path.join(root, "config"),
      state: path.join(root, "state"),
      tmp: path.join(root, "tmp"),
      bin: path.join(root, "bin"),
      log: path.join(root, "log"),
      repos: path.join(root, "repos"),
    })
    // Windows locates the installer's Git Bash through `git --exec-path`; answer it with a fixture install.
    const git = path.join(root, "Git")
    const bash = process.platform === "win32" ? path.join(git, "bin", "bash.exe") : "bash"
    if (process.platform === "win32") {
      yield* fs.makeDirectory(path.dirname(bash), { recursive: true })
      yield* fs.writeFileString(bash, "bash")
    }
    const commands: string[][] = []
    const updater = yield* Updater.Service.pipe(
      Effect.provide(Updater.layer),
      Effect.provide(
        LayerNode.compile(EffectFlock.node, {
          replacements: [Global.node.replace(Layer.succeed(Global.Service, global))],
        }),
      ),
      Effect.provideService(Global.Service, global),
      Effect.provideService(FileSystem.FileSystem, {
        ...fs,
        remove: (target, options) =>
          failCleanup && target.startsWith(global.cache)
            ? Effect.fail(
                PlatformError.systemError({
                  _tag: "PermissionDenied",
                  module: "FileSystem",
                  method: "remove",
                  pathOrDescriptor: target,
                }),
              )
            : fs.remove(target, options),
        realPath: (input) => (input === execPath ? fs.realPath(executable) : fs.realPath(input)),
      }),
      Effect.provideService(
        AppProcess.Service,
        AppProcess.Service.of({
          ...spawner,
          run: (command) =>
            Effect.suspend(() => {
              if (command._tag !== "StandardCommand") return Effect.die("Unexpected piped install command")
              const lookup = command.command === "git" && command.args[0] === "--exec-path"
              if (!lookup) commands.push([command.command, ...command.args])
              const result = lookup
                ? { stdout: Buffer.from(`${path.join(git, "mingw64", "libexec", "git-core")}\n`) }
                : respond(command)
              if (result.error) return Effect.fail(result.error)
              return Effect.succeed({
                command: command.command,
                exitCode: 0,
                stdout: Buffer.alloc(0),
                stderr: Buffer.alloc(0),
                stdoutTruncated: false,
                stderrTruncated: false,
                ...result,
              })
            }),
          runStream: () => Stream.die("Unexpected streaming install command"),
        }),
      ),
    )
    return { updater, commands, requests, global, fs, executable, bash }
  })
}

const windows = process.platform === "win32" ? it.live : it.live.skip
const unix = process.platform === "win32" ? it.live.skip : it.live

const installs = [
  { method: "npm", command: ["npm", "install", "--global", "--force", "@lutungcode/cli@2.3.4-beta.1"] },
  {
    method: "pnpm",
    command: ["pnpm", "add", "--global", "--allow-build=@lutungcode/cli", "@lutungcode/cli@2.3.4-beta.1"],
  },
  { method: "yarn", command: ["yarn", "global", "add", "@lutungcode/cli@2.3.4-beta.1"] },
  { method: "vp", command: ["vp", "update", "-g", "@lutungcode/cli@2.3.4-beta.1"] },
] as const

installs.forEach(({ method }) => {
  it.live(`${method} does not install while the update service is unconfigured`, () =>
    Effect.gen(function* () {
      const test = yield* fixture()
      const error = yield* test.updater.upgrade(method, "v2.3.4-beta.1").pipe(Effect.flip)
      expect(error.message).toBe("LutungCode does not have an update service configured.")
      expect(test.commands).toEqual([])
      expect(test.requests).toEqual([])
    }),
  )
})

it.live("vp does not install a replacement package while the update service is unconfigured", () =>
  Effect.gen(function* () {
    const test = yield* fixture(() => ({}), "@lutungcode/cli", false, "@lutungcode/cli-node")
    const error = yield* test.updater.upgrade("vp", "v2.3.4-beta.1").pipe(Effect.flip)
    expect(error.message).toBe("LutungCode does not have an update service configured.")
    expect(test.commands).toEqual([])
  }),
)

it.live("vp removes the package from its managed global store", () =>
  Effect.gen(function* () {
    const test = yield* fixture()
    const removal = test.updater.removal("vp")
    if (!removal) return yield* Effect.die("Expected vp removal command")
    expect(removal.command).toEqual(["vp", "uninstall", "-g", "@lutungcode/cli"])
    yield* removal.run
    expect(test.commands).toEqual([["vp", "uninstall", "-g", "@lutungcode/cli"]])
  }),
)
it.live("bun does not install while the update service is unconfigured", () =>
  Effect.gen(function* () {
    const test = yield* fixture(() => ({}), "@lutungcode/cli", true)
    const error = yield* test.updater.upgrade("bun", "v2.3.4-beta.1").pipe(Effect.flip)
    expect(error.message).toBe("LutungCode does not have an update service configured.")
    expect(test.commands).toEqual([])
    expect(yield* test.fs.exists(test.global.cache)).toBe(false)
  }),
)

it.live("curl does not download an installer while the update service is unconfigured", () =>
  Effect.gen(function* () {
    const test = yield* fixture()
    const error = yield* test.updater.upgrade("curl", "v2.3.4-beta.1").pipe(Effect.flip)
    expect(error.message).toBe("LutungCode does not have an update service configured.")
    expect(test.commands).toEqual([])
    expect(test.requests).toEqual([])
    expect(yield* test.fs.exists(test.global.cache)).toBe(false)
  }),
)

it.live("unconfigured upgrades never execute a command or create a cache", () =>
  Effect.gen(function* () {
    const test = yield* fixture()
    yield* Effect.forEach(Updater.methods, (method) =>
      Effect.forEach(["", "latest", "2.3.4", "2.3.4; echo unsafe"], (version) =>
        Effect.gen(function* () {
          const error = yield* test.updater.upgrade(method, version).pipe(Effect.flip)
          expect(error.message).toBe("LutungCode does not have an update service configured.")
        }),
      ),
    )
    expect(test.commands).toEqual([])
    expect(test.requests).toEqual([])
    expect(yield* test.fs.exists(test.global.cache)).toBe(false)
  }),
)
;(["npm", "pnpm", "bun", "yarn", "vp", undefined] as const).forEach((method) => {
  it.live(`method detection identifies ${method ?? "an unknown installation"} using the V2 package`, () =>
    Effect.gen(function* () {
      const test = yield* fixture((command) => ({
        stdout: Buffer.from(
          command.command === method
            ? method === "vp"
              ? JSON.stringify([{ name: "@lutungcode/cli", version: "2.3.4" }])
              : "@lutungcode/cli@2.3.4"
            : command.command === "vp"
              ? "[]"
              : "@other/tool@1.0.0",
        ),
      }))
      expect(yield* test.updater.method()).toBe(method)
      expect(test.commands).toEqual([
        ["npm", "list", "-g", "--depth=0", "@lutungcode/cli"],
        ["pnpm", "list", "-g", "--depth=0", "@lutungcode/cli"],
        ["bun", "pm", "ls", "-g"],
        ["yarn", "global", "list"],
        ["vp", "list", "-g", "--json", "@lutungcode/cli"],
      ])
    }),
  )
})

it.live("method detection tolerates unavailable package managers", () =>
  Effect.gen(function* () {
    const test = yield* fixture((command) =>
      command.command === "yarn"
        ? { stdout: Buffer.from("@lutungcode/cli@2.3.4") }
        : { error: new AppProcess.AppProcessError({ command: command.command }) },
    )
    expect(yield* test.updater.method()).toBe("yarn")
    expect(test.commands).toHaveLength(5)
  }),
)

it.live("vp detection ignores no-match output that repeats the package name", () =>
  Effect.gen(function* () {
    const test = yield* fixture((command) => ({
      stdout: Buffer.from(command.command === "vp" ? "No global packages matching '@lutungcode/cli'." : ""),
    }))
    expect(yield* test.updater.method()).toBeUndefined()
  }),
)

it.live("Homebrew installs do not check or upgrade while the update service is unconfigured", () =>
  Effect.gen(function* () {
    const test = yield* fixture(() => ({}), "@lutungcode/cli", false, "lutungcode", "lutungcode")
    expect(yield* test.updater.method()).toBe("brew")
    const latest = yield* test.updater.latest().pipe(Effect.flip)
    const upgrade = yield* test.updater.upgrade("brew", "2.0.21").pipe(Effect.flip)
    expect(latest.message).toBe("LutungCode does not have an update service configured.")
    expect(upgrade.message).toBe("LutungCode does not have an update service configured.")
    expect(test.commands).toEqual([])
    expect(test.requests).toEqual([])
  }),
)

const winget = (search: Partial<AppProcess.RunResult>) =>
  fixture(
    (command) => (command.args[0] === "search" ? search : {}),
    "@lutungcode/cli",
    false,
    "@lutungcode/cli",
    undefined,
    (root) =>
      Effect.succeed(
        path.join(
          root,
          "AppData",
          "Local",
          "Microsoft",
          "WinGet",
          "Packages",
          "Anomaly.LutungCode_Microsoft.Winget.Source_8wekyb3d8bbwe",
          "lutungcode.exe",
        ),
      ),
  )
it.live("WinGet directories are ignored while no WinGet package id is configured", () =>
  Effect.gen(function* () {
    const test = yield* winget({
      stdout: Buffer.from("Name     Id               Version\r\nLutungCode Example.LutungCode 2.0.28\r\n"),
    })
    expect(yield* test.updater.method()).toBeUndefined()
    const error = yield* test.updater.latest().pipe(Effect.flip)
    expect(error.message).toBe("LutungCode does not have an update service configured.")
    expect(test.updater.removal("winget")).toBeUndefined()
    expect(test.commands).toEqual([])
    expect(test.requests).toEqual([])
  }),
)

// Links are named lutungcode-upgrade-<pid>-<random>.exe; read them from inside the installer run.
const links = (directory: string) =>
  existsSync(directory) ? readdirSync(directory).filter((name) => name.startsWith("lutungcode-")) : []
const upgradeLinks = (directory: string) =>
  links(directory).filter((name) => name.startsWith(`lutungcode-upgrade-${process.pid}-`))

windows("windows does not replace the running binary while updates are unconfigured", () =>
  Effect.gen(function* () {
    const test = yield* fixture()
    yield* test.fs.makeDirectory(test.global.cache, { recursive: true })
    yield* test.fs.writeFileString(path.join(test.global.cache, "lutungcode-upgrade-999999999-dead.exe"), "exited")
    const error = yield* test.updater.upgrade("bun", "2.3.4").pipe(Effect.flip)
    expect(error.message).toBe("LutungCode does not have an update service configured.")
    expect(test.commands).toEqual([])
    expect(yield* test.fs.readFileString(test.executable)).toBe("binary")
    expect(links(test.global.cache)).toEqual(["lutungcode-upgrade-999999999-dead.exe"])
  }),
)

windows("windows keeps the uninstall link in the temporary directory, not the removed cache", () =>
  Effect.gen(function* () {
    const layout = { tmp: "" }
    const test = yield* fixture(() => {
      expect(upgradeLinks(layout.tmp)).toHaveLength(1)
      return {}
    })
    layout.tmp = test.global.tmp
    yield* test.fs.makeDirectory(test.global.cache, { recursive: true })
    const removal = test.updater.removal("bun")
    if (!removal) return yield* Effect.die("Expected bun removal command")
    yield* removal.run
    expect(test.commands).toEqual([["bun", "remove", "--global", "@lutungcode/cli"]])
    expect(links(test.global.cache)).toEqual([])
    expect(links(test.global.tmp)).toEqual([])
  }),
)

windows("windows curl installs do not download while updates are unconfigured", () =>
  Effect.gen(function* () {
    const test = yield* fixture(
      () => ({}),
      "@lutungcode/cli",
      false,
      "@lutungcode/cli",
      undefined,
      (_root, home) => Effect.succeed(path.join(home, ".lutungcode", "bin", "lutungcode.exe")),
    )
    const original = process.execPath
    process.execPath = test.executable
    yield* Effect.addFinalizer(() => Effect.sync(() => (process.execPath = original)))
    expect(yield* test.updater.method()).toBe("curl")
    const error = yield* test.updater.upgrade("curl", "2.3.4").pipe(Effect.flip)
    expect(error.message).toBe("LutungCode does not have an update service configured.")
    expect(test.commands).toEqual([])
    expect(yield* test.fs.readFileString(test.executable)).toBe("binary")
  }),
)

unix("curl method detection resolves symlinked home directories", () =>
  Effect.gen(function* () {
    const test = yield* fixture(
      () => ({}),
      "@lutungcode/cli",
      false,
      "@lutungcode/cli",
      undefined,
      (root, home) =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem
          const realHome = path.join(root, "real-home")
          const bin = path.join(realHome, ".lutungcode", "bin", "lutungcode")
          yield* fs.makeDirectory(path.dirname(bin), { recursive: true })
          yield* fs.symlink(realHome, home)
          return bin
        }),
    )
    expect(yield* test.updater.method()).toBe("curl")
    expect(test.commands).toEqual([])
  }),
)

windows("windows leaves a source checkout's runtime alone", () =>
  Effect.gen(function* () {
    const test = yield* fixture(() => ({}), "not-lutungcode")
    const error = yield* test.updater.upgrade("bun", "2.3.4").pipe(Effect.flip)
    expect(error.message).toBe("LutungCode does not have an update service configured.")
    expect(test.commands).toEqual([])
    expect(yield* test.fs.readFileString(test.executable)).toBe("binary")
  }),
)

unix("other platforms do not install while updates are unconfigured", () =>
  Effect.gen(function* () {
    const test = yield* fixture()
    const error = yield* test.updater.upgrade("bun", "2.3.4").pipe(Effect.flip)
    expect(error.message).toBe("LutungCode does not have an update service configured.")
    expect(test.commands).toEqual([])
    expect(yield* test.fs.readFileString(test.executable)).toBe("binary")
  }),
)

test("Node distribution honors the compile-time CLI name", async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      "test",
      import.meta.path,
      "--define",
      'LUTUNGCODE_CLI_NAME="lutungcode-node"',
      "--test-name-pattern",
      "^Node distribution resolves the published npm package$",
    ],
    {
      cwd: path.join(import.meta.dir, ".."),
      stdout: "ignore",
      stderr: "pipe",
      // Bun 1.4 can reuse cached modules compiled with different --define values.
      env: { ...process.env, BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0" },
    },
  )
  const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()])
  expect(code, stderr).toBe(0)
  expect(stderr).toContain("1 pass")
})

if (typeof LUTUNGCODE_CLI_NAME === "string" && LUTUNGCODE_CLI_NAME === "lutungcode-node") {
  it.live("Node distribution resolves the published npm package", () =>
    Effect.gen(function* () {
      const test = yield* fixture(
        (command) => ({
          stdout: Buffer.from(command.command === "npm" ? "@lutungcode/cli-node@2.3.4" : ""),
        }),
        "@lutungcode/cli-node",
      )
      expect(yield* test.updater.method()).toBe("npm")
      const error = yield* test.updater.upgrade("npm", "v2.3.4").pipe(Effect.flip)
      expect(error.message).toBe("LutungCode does not have an update service configured.")
      expect(test.commands).toEqual([
        ["npm", "list", "-g", "--depth=0", "@lutungcode/cli-node"],
        ["pnpm", "list", "-g", "--depth=0", "@lutungcode/cli-node"],
        ["bun", "pm", "ls", "-g"],
        ["yarn", "global", "list"],
        ["vp", "list", "-g", "--json", "@lutungcode/cli-node"],
      ])
    }),
  )
}
