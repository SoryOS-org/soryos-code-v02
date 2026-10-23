import { expect, test } from "bun:test"
import type { APIEvent } from "@solidjs/start/server"
import { GET } from "../src/routes/oauth/opencode/client.json"

test("publishes current and legacy loopback redirect URIs", async () => {
  // SAFETY: The route only reads the request URL.
  const response = GET({
    request: new Request("https://opencode.ai/oauth/opencode/client.json"),
  } as APIEvent)
  const document = await response.json()

  expect(document.client_id).toBe("https://opencode.ai/oauth/opencode/client.json")
  expect(document.redirect_uris).toEqual([
    "http://127.0.0.1/callback",
    "http://localhost/callback",
    "http://127.0.0.1/mcp/oauth/callback",
  ])
})
