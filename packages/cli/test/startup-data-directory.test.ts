import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { isolatedEnv } from "./fixture/environment"

test("startup explains a dangling data symlink and works once its target is restored", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-startup-data-"))
  try {
    const data = path.join(root, "data", "opencode")
    const target = path.join(root, "restored")
    await fs.mkdir(path.dirname(data))
    await fs.symlink("../restored", data, "dir")
    const failed = await cli(root)
    expect(failed.stderr).toContain("data directory is a symlink to a missing target")
    expect(failed.stderr).toContain(JSON.stringify(data))
    expect(failed.stderr).toContain(JSON.stringify(target))
    expect(failed.stderr).toContain("Restore the target directory or correct the symlink")
    expect(failed.stderr.match(/data directory is a symlink to a missing target/g)).toHaveLength(1)
    expect(failed.exitCode).not.toBe(0)
    expect(failed.stdout).toBe("")
    expect(await fs.readlink(data)).toBe("../restored")
    expect(
      await fs.stat(target).then(
        () => false,
        (error: NodeJS.ErrnoException) => error.code === "ENOENT",
      ),
    ).toBe(true)

    await fs.mkdir(target)
    const restored = await cli(root)
    expect(restored.stderr).toBe("")
    expect(restored.exitCode).toBe(0)
    expect(restored.stdout).toContain(data)
    expect((await fs.stat(path.join(target, "log"))).isDirectory()).toBe(true)
    expect(await fs.readlink(data)).toBe("../restored")
    expect(await Bun.file(path.join(root, "state", "opencode", "service-local.json")).exists()).toBe(false)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

async function cli(root: string) {
  const child = Bun.spawn([process.execPath, "run", "src/index.ts", "debug", "paths"], {
    cwd: path.join(import.meta.dir, ".."),
    env: isolatedEnv(root, { TMPDIR: root, TEMP: root, OTEL_EXPORTER_OTLP_ENDPOINT: undefined }),
    stdout: "pipe",
    stderr: "pipe",
  })
  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ])
    return { stdout, stderr, exitCode }
  } finally {
    child.kill()
    await child.exited
  }
}
