import { describe, expect, test } from "bun:test"
import fs from "fs"
import os from "os"
import path from "path"
import { pathToFileURL } from "url"
import { Cause, Context, Effect, Exit, Layer } from "effect"
import { Global } from "../src/global.js"
import { it } from "../../core/test/lib/effect.js"

describe("global", () => {
  for (const kind of [
    "directory",
    "symlink",
    "loop",
    "file",
    // Windows does not enforce POSIX directory mode bits.
    ...(process.platform === "win32" ? [] : ["permission"]),
  ]) {
    it.live(`preserves normal data directory handling for ${kind}`, () =>
      Effect.gen(function* () {
        const root = yield* Effect.acquireRelease(
          Effect.sync(() => fs.mkdtempSync(path.join(os.tmpdir(), "opencode-global-control-"))),
          (root) =>
            Effect.sync(() => {
              if (kind === "permission") fs.chmodSync(path.join(root, "target"), 0o700)
              fs.rmSync(root, { recursive: true, force: true })
            }),
        )
        const data = path.join(root, "data")
        const target = path.join(root, "target")
        if (kind === "symlink") fs.mkdirSync(target)
        if (kind === "file") fs.writeFileSync(target, "not a directory")
        if (kind === "permission") fs.mkdirSync(target, { mode: 0o000 })
        if (kind !== "directory") {
          fs.symlinkSync(
            kind === "loop" ? data : kind === "permission" ? path.join(target, "data") : target,
            data,
            "dir",
          )
        }
        const exit = yield* Effect.exit(
          Layer.build(
            Global.layerWith({
              data,
              log: path.join(data, "log"),
              repos: path.join(data, "repos"),
              config: path.join(root, "config"),
              state: path.join(root, "state"),
              bin: path.join(root, "bin"),
              tmp: path.join(root, "tmp"),
            }),
          ),
        )
        if (kind === "directory" || kind === "symlink") {
          expect(Exit.isSuccess(exit)).toBe(true)
          expect(fs.statSync(path.join(data, "log")).isDirectory()).toBe(true)
          return
        }
        expect(Exit.isFailure(exit)).toBe(true)
        if (Exit.isFailure(exit)) {
          const message = Cause.pretty(exit.cause)
          expect(message).not.toContain("missing target")
          expect(message).toMatch(kind === "loop" ? /ELOOP/ : kind === "permission" ? /EACCES/ : /EEXIST|ENOTDIR/)
        }
      }),
    )
  }

  for (const relative of [false, true]) {
    it.live(`reports a missing ${relative ? "relative" : "absolute"} data symlink target`, () =>
      Effect.gen(function* () {
        const root = yield* Effect.acquireRelease(
          Effect.sync(() => fs.mkdtempSync(path.join(os.tmpdir(), "opencode-global-symlink-"))),
          (root) => Effect.sync(() => fs.rmSync(root, { recursive: true, force: true })),
        )
        const data = path.join(root, "data")
        const target = path.join(root, "missing", "target")
        const link = relative ? path.relative(root, target) : target
        fs.symlinkSync(link, data, "dir")
        const exit = yield* Effect.exit(
          Layer.build(
            Global.layerWith({
              data,
              log: path.join(data, "log"),
              repos: path.join(data, "repos"),
              config: path.join(root, "config"),
              state: path.join(root, "state"),
              bin: path.join(root, "bin"),
              tmp: path.join(root, "tmp"),
            }),
          ),
        )
        expect(Exit.isFailure(exit)).toBe(true)
        if (Exit.isFailure(exit)) {
          const message = Cause.pretty(exit.cause)
          expect(message).toContain("data directory is a symlink to a missing target")
          expect(message).toContain(JSON.stringify(data))
          expect(message).toContain(JSON.stringify(target))
          expect(message).toContain("Restore the target directory or correct the symlink")
        }
        expect(fs.readlinkSync(data)).toBe(link)
        expect(fs.existsSync(target)).toBe(false)
        expect(fs.existsSync(path.join(root, "config"))).toBe(false)
      }),
    )
  }

  test("importing the module does not create directories", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-global-import-"))
    const directories = ["data", "cache", "config", "state", "tmp"].map((directory) => path.join(root, directory))
    const module = pathToFileURL(path.join(import.meta.dir, "../src/global.ts")).href
    const result = Bun.spawnSync({
      cmd: [process.execPath, "-e", `const { Global } = await import(${JSON.stringify(module)}); void Global.Path.tmp`],
      env: {
        ...process.env,
        XDG_DATA_HOME: directories[0],
        XDG_CACHE_HOME: directories[1],
        XDG_CONFIG_HOME: directories[2],
        XDG_STATE_HOME: directories[3],
        // os.tmpdir() reads TMPDIR on POSIX and TEMP on Windows.
        TMPDIR: directories[4],
        TEMP: directories[4],
      },
      stderr: "pipe",
    })

    expect(result.exitCode, result.stderr.toString()).toBe(0)
    directories.forEach((directory) => expect(fs.existsSync(path.join(directory, "opencode"))).toBe(false))
    fs.rmSync(root, { recursive: true, force: true })
  })

  test("building layerWith creates service directories and preserves an explicit tmp", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-global-layer-"))
    const directories = {
      data: path.join(root, "data"),
      config: path.join(root, "config"),
      state: path.join(root, "state"),
      log: path.join(root, "log"),
      bin: path.join(root, "bin"),
      repos: path.join(root, "repos"),
      tmp: path.join(root, "nested", "..", "tmp"),
    }

    const context = await Effect.runPromise(Effect.scoped(Layer.build(Global.layerWith(directories))))

    Object.values(directories).forEach((directory) => expect(fs.statSync(directory).isDirectory()).toBe(true))
    expect(Context.get(context, Global.Service).tmp).toBe(directories.tmp)
    fs.rmSync(root, { recursive: true, force: true })
  })

  test("building a layer with default tmp creates and canonicalizes it", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-global-layer-"))
    const directories = ["data", "cache", "config", "state", "tmp"].map((directory) => path.join(root, directory))
    const module = pathToFileURL(path.join(import.meta.dir, "../src/global.ts")).href
    const result = Bun.spawnSync({
      cmd: [
        process.execPath,
        "-e",
        `
          import { Context, Effect, Layer } from "effect"
          const { Global } = await import(${JSON.stringify(module)})
          const context = await Effect.runPromise(Effect.scoped(Layer.build(Global.layerWith({}))))
          process.stdout.write(Context.get(context, Global.Service).tmp)
        `,
      ],
      cwd: path.join(import.meta.dir, ".."),
      env: {
        ...process.env,
        XDG_DATA_HOME: directories[0],
        XDG_CACHE_HOME: directories[1],
        XDG_CONFIG_HOME: directories[2],
        XDG_STATE_HOME: directories[3],
        // os.tmpdir() reads TMPDIR on POSIX and TEMP on Windows.
        TMPDIR: directories[4],
        TEMP: directories[4],
      },
      stdout: "pipe",
      stderr: "pipe",
    })

    expect(result.exitCode, result.stderr.toString()).toBe(0)
    // The layer canonicalizes through the native realpath, which on Windows also expands 8.3 short
    // names such as RUNNER~1 that the JavaScript realpathSync leaves in place.
    expect(result.stdout.toString()).toBe(fs.realpathSync.native(path.join(directories[4], "opencode")))
    const created = [
      path.join(directories[0], "opencode"),
      path.join(directories[1], "opencode", "bin"),
      path.join(directories[2], "opencode"),
      path.join(directories[3], "opencode"),
      path.join(directories[0], "opencode", "log"),
      path.join(directories[0], "opencode", "repos"),
      path.join(directories[4], "opencode"),
    ]
    created.forEach((directory) => expect(fs.statSync(directory).isDirectory()).toBe(true))
    fs.rmSync(root, { recursive: true, force: true })
  })
})
