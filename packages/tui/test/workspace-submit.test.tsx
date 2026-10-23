import { expect, test } from "bun:test"
import { InputRenderable, TextareaRenderable } from "@opentui/core"
import path from "node:path"
import { createAppFixture } from "./fixture/app"
import { json } from "./fixture/tui-client"

test.each(["agent", "model", "config"])(
  "Enter waits for the destination %s catalog after switching worktrees",
  async (catalog) => {
    await using fixture = await workspace(catalog)
    await fixture.switchWorkspace()
    const input = fixture.setup.renderer.currentFocusedEditor
    expect(input).toBeInstanceOf(TextareaRenderable)
    expect(input?.plainText).toBe("Review the changes")
    expect(input?.focused).toBe(true)

    fixture.setup.mockInput.pressEnter()
    await fixture.setup.waitForVisualIdle({ quietFrames: 2 })
    expect(fixture.created).toHaveLength(0)
    expect(fixture.sent).toHaveLength(0)
    fixture.release()

    await fixture.setup.waitFor(() => fixture.sent.length === 1)
    expect(fixture.created[0]).toMatchObject({
      location: { directory: fixture.target },
      agent: "review",
      model: { providerID: "provider", id: "target-model" },
    })
    expect(fixture.sent[0]).toMatchObject({ text: "Review the changes" })
  },
)

test("repeated Enter during worktree loading submits only once", async () => {
  await using fixture = await workspace("agent")
  await fixture.switchWorkspace()
  fixture.setup.mockInput.pressEnter()
  fixture.setup.mockInput.pressEnter()
  await fixture.setup.waitForVisualIdle({ quietFrames: 2 })
  fixture.release()
  await fixture.setup.waitFor(() => fixture.sent.length === 1)
  expect(fixture.created).toHaveLength(1)
  expect(fixture.sent).toHaveLength(1)
})

test("editing the prompt while the worktree loads cancels the pending submit", async () => {
  await using fixture = await workspace("agent")
  await fixture.switchWorkspace()
  fixture.setup.mockInput.pressEnter()
  await fixture.setup.waitForVisualIdle({ quietFrames: 2 })
  await fixture.setup.mockInput.typeText(" and tests")
  fixture.release()
  await fixture.setup.waitForVisualIdle({ quietFrames: 2 })
  expect(fixture.created).toHaveLength(0)
  expect(fixture.sent).toHaveLength(0)
  expect(fixture.setup.renderer.currentFocusedEditor?.plainText).toBe("Review the changes and tests")
  fixture.setup.mockInput.pressEnter()
  await fixture.setup.waitFor(() => fixture.sent.length === 1)
  expect(fixture.sent[0]).toMatchObject({ text: "Review the changes and tests" })
})

test("switching away while the worktree loads cancels the pending submit", async () => {
  await using fixture = await workspace("agent")
  await fixture.switchWorkspace()
  fixture.setup.mockInput.pressEnter()
  await fixture.setup.waitForVisualIdle({ quietFrames: 2 })
  await fixture.selectWorkspace(process.cwd())
  fixture.release()
  await fixture.setup.waitForVisualIdle({ quietFrames: 2 })
  expect(fixture.created).toHaveLength(0)
  expect(fixture.sent).toHaveLength(0)
  expect(fixture.setup.renderer.currentFocusedEditor?.plainText).toBe("Review the changes")
})

test("switching worktrees after catalogs load inside the picker does not submit in the new location", async () => {
  await using fixture = await workspace("agent")
  await fixture.switchWorkspace()
  fixture.setup.mockInput.pressEnter()
  await fixture.setup.waitForVisualIdle({ quietFrames: 2 })
  await fixture.openWorkspace(process.cwd())
  fixture.release()
  await fixture.setup.waitForVisualIdle({ quietFrames: 3 })
  expect(fixture.created).toHaveLength(0)
  expect(fixture.sent).toHaveLength(0)

  fixture.setup.mockInput.pressEnter()
  await fixture.setup.waitForVisualIdle({ quietFrames: 3 })
  expect(fixture.created).toHaveLength(0)
  expect(fixture.sent).toHaveLength(0)
  expect(fixture.setup.renderer.currentFocusedEditor?.plainText).toBe("Review the changes")

  fixture.setup.mockInput.pressEnter()
  await fixture.setup.waitFor(() => fixture.sent.length === 1)
  expect(fixture.created[0]).toMatchObject({
    location: { directory: process.cwd() },
    agent: "build",
    model: { providerID: "provider", id: "source-model" },
  })
  expect(fixture.sent[0]).toMatchObject({ text: "Review the changes" })
})

test("opening and dismissing a dialog cancels the deferred submit without losing the draft", async () => {
  await using fixture = await workspace("agent")
  await fixture.switchWorkspace()
  fixture.setup.mockInput.pressEnter()
  await fixture.setup.waitForVisualIdle({ quietFrames: 2 })
  fixture.setup.mockInput.pressKey("p", { ctrl: true })
  await fixture.setup.waitFor(() => fixture.setup.renderer.currentFocusedEditor instanceof InputRenderable)
  fixture.release()
  await fixture.setup.waitForVisualIdle({ quietFrames: 3 })
  fixture.setup.mockInput.pressEscape()
  await fixture.setup.waitForVisualIdle({ quietFrames: 3 })
  expect(fixture.created).toHaveLength(0)
  expect(fixture.sent).toHaveLength(0)
  expect(fixture.setup.renderer.currentFocusedEditor?.plainText).toBe("Review the changes")

  fixture.setup.mockInput.pressEnter()
  await fixture.setup.waitFor(() => fixture.sent.length === 1)
  expect(fixture.created[0]).toMatchObject({
    location: { directory: fixture.target },
    agent: "review",
    model: { providerID: "provider", id: "target-model" },
  })
})

test("an edited prompt can be submitted again before the worktree finishes loading", async () => {
  await using fixture = await workspace("agent")
  await fixture.switchWorkspace()
  fixture.setup.mockInput.pressEnter()
  await fixture.setup.waitForVisualIdle({ quietFrames: 2 })
  await fixture.setup.mockInput.typeText(" and tests")
  fixture.setup.mockInput.pressEnter()
  await fixture.setup.waitForVisualIdle({ quietFrames: 2 })
  fixture.release()
  await fixture.setup.waitFor(() => fixture.sent.length === 1)
  expect(fixture.created).toHaveLength(1)
  expect(fixture.sent[0]).toMatchObject({ text: "Review the changes and tests" })
})

test("a pending worktree submit does not block sending in another workspace", async () => {
  await using fixture = await workspace("agent")
  await fixture.switchWorkspace()
  fixture.setup.mockInput.pressEnter()
  await fixture.setup.waitForVisualIdle({ quietFrames: 2 })
  await fixture.selectWorkspace(process.cwd())
  fixture.setup.mockInput.pressEnter()
  await fixture.setup.waitFor(() => fixture.sent.length === 1)
  expect(fixture.created[0]).toMatchObject({ location: { directory: process.cwd() }, agent: "build" })
  fixture.release()
  await fixture.setup.waitForVisualIdle({ quietFrames: 2 })
  expect(fixture.created).toHaveLength(1)
  expect(fixture.sent).toHaveLength(1)
})

test("a failed catalog load preserves the prompt and reports the error", async () => {
  await using fixture = await workspace("agent")
  await fixture.switchWorkspace()
  fixture.setup.mockInput.pressEnter()
  await fixture.setup.waitForVisualIdle({ quietFrames: 2 })
  fixture.fail()
  await fixture.setup.waitForFrame((frame) => frame.includes("Failed to prepare prompt"))
  expect(fixture.created).toHaveLength(0)
  expect(fixture.sent).toHaveLength(0)
  expect(fixture.setup.renderer.currentFocusedEditor?.plainText).toBe("Review the changes")
  fixture.setup.mockInput.pressEnter()
  await fixture.setup.waitFor(() => fixture.sent.length === 1)
  expect(fixture.sent[0]).toMatchObject({ text: "Review the changes" })
})

async function workspace(catalog: string) {
  const source = process.cwd()
  const target = path.join(path.parse(source).root, "opencode-worktree")
  const gate = Promise.withResolvers<void>()
  const requested = Promise.withResolvers<void>()
  const created: unknown[] = []
  const sent: unknown[] = []
  let session: unknown
  let failures = 0
  const setup = await createAppFixture({
    config: { animations: false, tabs: { enabled: false } },
    fetch: async (url, request) => {
      const directory = url.searchParams.get("location[directory]") ?? source
      const destination = directory === target
      const location = { directory, project: { id: "proj_test", directory, canonical: source } }
      if (destination && url.pathname === `/api/${catalog}`) {
        requested.resolve()
        await gate.promise
        if (failures > 0) {
          failures--
          return json({ message: "Catalog unavailable" }, { status: 503 })
        }
      }
      if (url.pathname === "/api/location") return json(location)
      if (url.pathname === "/api/fs/list") return json({ location, data: [] })
      if (url.pathname === "/api/agent")
        return json({
          location,
          data: [{ id: destination ? "review" : "build", mode: "primary", hidden: false, permissions: [] }],
        })
      if (url.pathname === "/api/model")
        return json({
          location,
          data: [
            { id: "source-model", providerID: "provider", name: "Source Model", variants: [] },
            { id: "target-model", providerID: "provider", name: "Target Model", variants: [] },
          ],
        })
      if (url.pathname === "/api/config")
        return json(destination ? [{ type: "document", info: { model: "provider/target-model" } }] : [])
      if (url.pathname === "/api/provider") return json({ location, data: [{ id: "provider", name: "Provider" }] })
      if (url.pathname === "/api/command") return json({ location, data: [] })
      if (url.pathname === "/api/worktree") return json([{ directory: source }, { directory: target, strategy: "git" }])
      if (url.pathname === "/api/session" && request.method === "POST") {
        const body = await request.json()
        created.push(body)
        session = {
          ...body,
          projectID: "proj_test",
          cost: 0,
          tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          time: { created: 1, updated: 1 },
        }
        return json({ data: session })
      }
      if (session && /^\/api\/session\/[^/]+$/.test(url.pathname)) return json({ data: session })
      if (/^\/api\/session\/[^/]+\/(message|inbox|permission)$/.test(url.pathname))
        return json({ data: [], cursor: {} })
      if (/^\/api\/session\/[^/]+\/prompt$/.test(url.pathname)) {
        sent.push(await request.json())
        return json({ data: {} })
      }
      return undefined
    },
  })

  async function openWorkspace(directory: string) {
    setup.mockInput.pressKey("p", { ctrl: true })
    await setup.waitFor(() => setup.renderer.currentFocusedEditor instanceof InputRenderable)
    await setup.mockInput.typeText("move")
    await setup.waitForFrame((frame) => frame.includes("Manage workspaces"))
    setup.mockInput.pressEnter()
    await setup.waitForFrame((frame) => frame.includes("Worktrees") && frame.includes(target))
    await setup.waitFor(() => setup.renderer.currentFocusedEditor instanceof InputRenderable)
    await setup.mockInput.typeText(directory)
    await setup.waitForFrame((frame) => frame.includes(path.basename(directory)) && frame.includes("new ctrl+a"))
  }

  async function selectWorkspace(directory: string) {
    await openWorkspace(directory)
    setup.mockInput.pressEnter()
    await setup.waitForFrame((frame) => !frame.includes("Worktrees") && frame.includes(path.basename(directory)))
  }

  return {
    setup,
    target,
    created,
    sent,
    release: gate.resolve,
    fail() {
      failures = 1
      gate.resolve()
    },
    openWorkspace,
    selectWorkspace,
    async switchWorkspace() {
      await setup.ready
      await setup.waitForFrame((frame) => frame.includes("Build · Source Model Provider"))
      await setup.waitFor(() => setup.renderer.currentFocusedEditor instanceof TextareaRenderable)
      setup.renderer.currentFocusedEditor?.setText("")
      await setup.mockInput.typeText("Review the changes")
      await selectWorkspace(target)
      await requested.promise
    },
    async [Symbol.asyncDispose]() {
      gate.resolve()
      await setup[Symbol.asyncDispose]()
    },
  }
}
