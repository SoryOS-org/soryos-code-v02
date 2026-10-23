import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { pollWith, Watcher } from "@opencode/core/filesystem/watcher"
import { tmpdir } from "../fixture/tmpdir"

describe("watcher poll fallback", () => {
  test("reports a missing file as created", async () => {
    await using tmp = await tmpdir()
    const file = path.join(tmp.path, "created.txt")
    let resolve!: (update: Watcher.Update) => void
    const seen = new Promise<Watcher.Update>((done) => (resolve = done))
    const scan = async () => {
      const next = new Map<string, string>()
      try {
        for (const entry of await fs.readdir(tmp.path, { withFileTypes: true })) {
          next.set(path.join(tmp.path, entry.name), "file")
        }
      } catch {}
      return next
    }

    const subscription = await pollWith(scan, 10, (update) => {
      if (update.path === file) resolve(update)
    })

    try {
      await fs.writeFile(file, "x")
      await expect(seen).resolves.toEqual({ path: file, type: "create" })
    } finally {
      await subscription.unsubscribe()
    }
  })
})
