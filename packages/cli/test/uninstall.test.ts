import { expect, test } from "bun:test"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { isolatedEnv } from "./fixture/environment"
import { tmpdir } from "./fixture/tmpdir"
;["fallback", "ordinary", "failure", "dry-run"].forEach((mode) => {
  test("uninstall prints manual cleanup only after successful fallback removal: " + mode, async () => {
    await using root = await tmpdir()
    for (const key of ["cache", "data", "config", "state"]) {
      await mkdir(path.join(root.path, key), { recursive: true })
      await Bun.write(path.join(root.path, key, "keep.txt"), key)
    }
    const child = Bun.spawn([process.execPath, path.join(import.meta.dir, "fixture/uninstall.ts"), root.path, mode], {
      cwd: path.join(import.meta.dir, ".."),
      env: isolatedEnv(root.path, { OPENCODE_PRINT_LOGS: undefined }),
      stdout: "pipe",
      stderr: "pipe",
    })
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ])
    expect(code, stderr).toBe(mode === "failure" ? 1 : 0)
    const directory = path.join(root.path, "npm prefix", ".opencode", "retained-images")
    expect(stdout.includes(directory)).toBe(mode === "fallback")
    if (mode === "fallback") expect(stdout).toContain("after all OpenCode processes exit")
    expect(await Bun.file(path.join(root.path, "removal-called")).exists()).toBe(mode !== "dry-run")
    expect(await Bun.file(path.join(root.path, "cache/keep.txt")).exists()).toBe(mode === "dry-run")
    // Uninstall must keep sessions, settings and state, including on failure.
    for (const key of ["data", "config", "state"]) {
      expect(await Bun.file(path.join(root.path, key, "keep.txt")).text()).toBe(key)
    }
  })
})
