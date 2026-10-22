import { expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

test("file logger diagnoses data symlinks before Global acquisition and preserves normal logging", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-logging-data-"))
  try {
    const module = pathToFileURL(path.join(import.meta.dir, "../src/observability/logging.ts")).href
    const result = Bun.spawnSync({
      cmd: [
        process.execPath,
        "-e",
        `
          import fs from "node:fs/promises"
          import path from "node:path"
          import { Cause, Effect, Exit, Logger } from "effect"
          import { NodeFileSystem } from "@effect/platform-node"
          const { Logging } = await import(${JSON.stringify(module)})
          const root = ${JSON.stringify(root)}
          const data = path.join(root, "opencode")
          const target = path.join(root, "missing", "target")
          const failures = []
          for (const link of [target, path.relative(root, target)]) {
            await fs.symlink(link, data, "dir")
            const exit = await Effect.runPromise(
              Logging.fileLogger().pipe(Effect.scoped, Effect.provide(NodeFileSystem.layer), Effect.exit),
            )
            failures.push({
              message: Exit.isFailure(exit) ? Cause.pretty(exit.cause) : "",
              link: await fs.readlink(data),
              missing: await fs.stat(target).then(() => false, (error) => error.code === "ENOENT"),
            })
            await fs.unlink(data)
          }
          const write = () => Effect.runPromise(
            Effect.logInfo("logger ready").pipe(
              Effect.provide(Logger.layer([Logging.fileLogger()], { mergeWithExisting: false })),
              Effect.provide(NodeFileSystem.layer),
            ),
          )
          await fs.mkdir(target, { recursive: true })
          await fs.symlink(target, data, "dir")
          await write()
          const linked = await fs.readFile(Logging.file(), "utf8")
          await fs.unlink(data)
          await write()
          process.stdout.write(JSON.stringify({ failures, linked, normal: await fs.readFile(Logging.file(), "utf8") }))
        `,
      ],
      cwd: path.join(import.meta.dir, ".."),
      env: { ...process.env, XDG_DATA_HOME: root },
      stdout: "pipe",
      stderr: "pipe",
    })
    expect(result.stderr.toString()).toBe("")
    expect(result.exitCode).toBe(0)
    const output = JSON.parse(result.stdout.toString())
    expect(output.failures).toHaveLength(2)
    output.failures.forEach((failure: { message: string; link: string; missing: boolean }, index: number) => {
      const target = path.join(root, "missing", "target")
      expect(failure.message).toContain("data directory is a symlink to a missing target")
      expect(failure.message).toContain(JSON.stringify(path.join(root, "opencode")))
      expect(failure.message).toContain(JSON.stringify(target))
      expect(failure.link).toBe(index === 0 ? target : path.relative(root, target))
      expect(failure.missing).toBe(true)
    })
    expect(output.linked).toContain("logger ready")
    expect(output.normal).toContain("logger ready")
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
