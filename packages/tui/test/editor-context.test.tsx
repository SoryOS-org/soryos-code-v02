/** @jsxImportSource @opentui/solid */
import { afterEach, beforeEach, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { createEffect } from "solid-js"
import { EditorContextProvider, useEditorContext } from "../src/context/editor"
import { TestTuiContexts } from "./fixture/tui-environment"

const ports = {
  CLAUDE_CODE_SSE_PORT: process.env.CLAUDE_CODE_SSE_PORT,
  OPENCODE_EDITOR_SSE_PORT: process.env.OPENCODE_EDITOR_SSE_PORT,
}

beforeEach(() => {
  delete process.env.CLAUDE_CODE_SSE_PORT
  delete process.env.OPENCODE_EDITOR_SSE_PORT
})

afterEach(() => {
  Object.entries(ports).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  })
})

test.each(["authenticated", "unauthenticated"])("receives IDE selection over an %s mcp connection", async (mode) => {
  const token = mode === "authenticated" ? "ide-test-token" : undefined
  const request = Promise.withResolvers<Request>()
  const received = Promise.withResolvers<unknown>()
  const selection = {
    filePath: "/workspace/Main.kt",
    text: 'println("selected")',
    selection: { start: { line: 12, character: 2 }, end: { line: 12, character: 21 } },
  }
  using server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req, server) {
      request.resolve(req)
      if (req.headers.get("sec-websocket-protocol") !== "mcp") return new Response(null, { status: 400 })
      if (req.headers.get("x-claude-code-ide-authorization") !== (token ?? null)) {
        return new Response(null, { status: 401 })
      }
      if (server.upgrade(req, { headers: { "Sec-WebSocket-Protocol": "mcp" } })) return
      return new Response(null, { status: 400 })
    },
    websocket: {
      message(socket, data) {
        const message = JSON.parse(String(data))
        if (message.method === "initialize") {
          socket.send(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { serverInfo: { name: "IDE" } } }))
        }
        if (message.method === "notifications/initialized") {
          socket.send(JSON.stringify({ jsonrpc: "2.0", method: "selection_changed", params: selection }))
        }
      },
    },
  })

  function Probe() {
    const context = useEditorContext()
    createEffect(() => {
      if (context.selection()) received.resolve(context.selection())
    })
    return <text>{context.selection()?.filePath}</text>
  }

  await using app = await testRender(
    () => (
      <TestTuiContexts>
        <EditorContextProvider
          integration={{ connection: () => ({ url: `ws://127.0.0.1:${server.port}`, authToken: token, source: "test" }) }}
        >
          <Probe />
        </EditorContextProvider>
      </TestTuiContexts>
    ),
    { width: 80, height: 4 },
  )

  const headers = (await request.promise).headers
  expect(headers.get("sec-websocket-protocol")).toBe("mcp")
  expect(headers.get("x-claude-code-ide-authorization")).toBe(token ?? null)
  await expect(received.promise).resolves.toEqual({
    filePath: "/workspace/Main.kt",
    source: "websocket",
    ranges: [{ text: 'println("selected")', selection: selection.selection }],
  })
  await app.renderOnce()
  expect(app.captureCharFrame()).toContain("/workspace/Main.kt")
})
