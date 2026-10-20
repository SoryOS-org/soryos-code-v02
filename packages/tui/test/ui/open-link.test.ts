import { expect, test } from "bun:test"

test("link routing opens local files and web URLs with the default application", async () => {
  // Isolate the launcher mock so other TUI tests cannot inherit it.
  const result = Bun.spawn([process.execPath, "-e", `
    import { mock } from "bun:test"
    import { deepStrictEqual, rejects } from "node:assert/strict"
    import { pathToFileURL } from "node:url"
    import path from "node:path"
    const opened = []
    mock.module(Bun.resolveSync("open", path.resolve("../util/src")), () => ({
      default: async (target) => { opened.push(target) },
    }))
    const { openLink } = await import("./src/ui/open-link.ts")
    const { openUrl } = await import("@opencode/util/open")
    const files = ["photo space.png", "clip.mp4", "report.pdf"].map((name) => path.resolve(name))
    for (const file of files) await openLink(pathToFileURL(file).href)
    await openLink("https://example.com")
    await openLink("http://example.com")
    deepStrictEqual(opened, [...files, "https://example.com/", "http://example.com/"])
    await rejects(() => openLink("javascript:alert(1)"))
    await rejects(() => openLink("not a URL"))
    await rejects(() => openUrl(pathToFileURL(files[0]).href))
    deepStrictEqual(opened, [...files, "https://example.com/", "http://example.com/"])
  `], { stdout: "pipe", stderr: "pipe" })
  const stderr = await new Response(result.stderr).text()
  expect(await result.exited, stderr).toBe(0)
})
