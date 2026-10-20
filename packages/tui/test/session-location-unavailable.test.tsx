import { expect, test } from "bun:test"
import { createTestRenderer } from "@opentui/core/testing"
import { Effect, FileSystem } from "effect"
import path from "node:path"
import { Global } from "@opencode/util/global"
import { createEventStream, createFetch, json } from "./fixture/tui-client"
import { tmpdir } from "./fixture/fixture"

// The session lives in another directory than the client's own location, so the client syncs
// that location instead of the default one.
const session = {
  id: "ses_test",
  title: "Location sync",
  projectID: "proj_test",
  location: { directory: "/tmp/opencode/other-clone" },
  cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  time: { created: 0, updated: 0 },
}

const unavailable = "Session location unavailable"

async function wait(predicate: () => boolean, timeout = 20_000) {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeout) throw new Error("timed out waiting for condition")
    await Bun.sleep(10)
  }
}

async function boot(root: string, fail: (url: URL) => Response | undefined) {
  const setup = await createTestRenderer({ width: 100, height: 30, kittyKeyboard: true })
  await setup.renderer.setupTerminal()
  setup.renderer.start()
  const events = createEventStream()
  const calls = createFetch(async (url) => {
    if (url.pathname === "/api/session") return json({ data: [session], cursor: {} })
    if (url.pathname === "/api/session/ses_test") return json({ data: session })
    if (url.pathname === "/api/session/ses_test/message") return json({ data: [], cursor: {} })
    if (url.pathname === "/api/session/ses_test/inbox") return json({ data: [] })
    if (url.pathname === "/api/session/ses_test/permission") return json({ data: [] })
    return fail(url)
  }, events)
  const server = Bun.serve({ port: 0, idleTimeout: 0, fetch: (request) => calls.fetch(request) })
  const { run } = await import("../src/app")
  const task = Effect.runPromise(
    run({
      app: { name: "test", version: "test", channel: "test" },
      server: { endpoint: { url: server.url.toString() } },
      config: { get: async () => ({ animations: false }), update: async () => ({}) },
      packages: { prepare: async () => ({ directory: "" }) },
      terminalHandoff: async () => ({ renderer: setup.renderer, mode: "dark", complete: () => {} }),
      args: { sessionID: "ses_test" },
      log: () => {},
    }).pipe(
      Effect.provide(
        Global.layerWith({
          home: path.join(root, "home"),
          data: path.join(root, "data"),
          cache: path.join(root, "cache"),
          config: path.join(root, "config"),
          state: path.join(root, "state"),
          bin: path.join(root, "cache", "bin"),
          log: path.join(root, "data", "log"),
          repos: path.join(root, "data", "repos"),
          tmp: path.join(root, "tmp"),
        }),
      ),
      Effect.provide(FileSystem.layerNoop({})),
    ),
  )
  return { setup, task, server }
}

function serviceUnavailable() {
  return json(
    { _tag: "ServiceUnavailableError", message: "Location plugins did not finish activating", service: "plugin" },
    { status: 503 },
  )
}

test("a location read that fails for a transient reason is retried", async () => {
  await using state = await tmpdir()
  let attempts = 0
  const app = await boot(state.path, (url) => {
    if (url.pathname !== "/api/model") return undefined
    if (url.searchParams.get("location[directory]") !== session.location.directory) return undefined
    attempts++
    return attempts === 1 ? serviceUnavailable() : undefined
  })
  try {
    await wait(() => attempts >= 2 || app.setup.captureCharFrame().includes(unavailable))
    expect(app.setup.captureCharFrame()).not.toContain(unavailable)
    expect(attempts).toBeGreaterThanOrEqual(2)
  } finally {
    if (!app.setup.renderer.isDestroyed) app.setup.renderer.destroy()
    await app.task.finally(() => app.server.stop(true))
  }
})

test("a location read that keeps failing keeps the composer", async () => {
  await using state = await tmpdir()
  let attempts = 0
  const app = await boot(state.path, (url) => {
    if (url.pathname !== "/api/model") return undefined
    if (url.searchParams.get("location[directory]") !== session.location.directory) return undefined
    attempts++
    return serviceUnavailable()
  })
  try {
    // The retry gives up after three attempts.
    await wait(() => attempts >= 3 || app.setup.captureCharFrame().includes(unavailable))
    await app.setup.waitForVisualIdle()
    const frame = app.setup.captureCharFrame()
    expect(frame).not.toContain(unavailable)
    expect(frame).not.toContain("Choose another directory to continue this session.")
    app.setup.mockInput.typeText("still typing")
    await app.setup.waitForVisualIdle()
    expect(app.setup.captureCharFrame()).toContain("still typing")
  } finally {
    if (!app.setup.renderer.isDestroyed) app.setup.renderer.destroy()
    await app.task.finally(() => app.server.stop(true))
  }
})

test("a location the server reports as missing asks for another directory", async () => {
  await using state = await tmpdir()
  let attempts = 0
  const app = await boot(state.path, (url) => {
    if (url.pathname !== "/api/location") return undefined
    if (url.searchParams.get("location[directory]") !== session.location.directory) return undefined
    attempts++
    return json(
      {
        _tag: "LocationNotFoundError",
        location: { directory: session.location.directory },
        message: `Location not found: ${session.location.directory}`,
      },
      { status: 404 },
    )
  })
  try {
    await app.setup.waitForFrame((frame) => frame.includes(unavailable))
    const frame = app.setup.captureCharFrame()
    expect(frame).toContain(session.location.directory)
    expect(frame).toContain("Choose another directory to continue this session.")
  } finally {
    if (!app.setup.renderer.isDestroyed) app.setup.renderer.destroy()
    await app.task.finally(() => app.server.stop(true))
  }
})
