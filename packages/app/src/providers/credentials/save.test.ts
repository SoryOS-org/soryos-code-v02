import { describe, expect, test } from "bun:test"
import { OpenCode } from "@opencode/client/promise"
import type { CustomProvider } from "./form"
import { CustomProviderExistsError, saveCustomProvider } from "./save"

const config = {
  name: "Custom",
  package: "aisdk:@ai-sdk/openai-compatible",
  settings: { baseURL: "https://api.example.com/v1" },
  models: { example: { name: "Example" } },
}
const getConfig = "GET /api/experimental/config"
const listCredentials = "GET /api/credential"
const createCredential = "POST /api/credential"
const writeConfig = "PATCH /api/experimental/config"
const removeCredential = "DELETE /api/credential/cred_new"
const restoreCredential = "POST /api/credential/cred_old/activate"

describe("saveCustomProvider", () => {
  test.each([
    { name: "without a key", key: undefined, failure: "none", calls: [getConfig, writeConfig] },
    { name: "with a stored key", key: "test-key", failure: "none", calls: [getConfig, listCredentials, createCredential, writeConfig] },
    { name: "credential failure", key: "test-key", failure: "credential", calls: [getConfig, listCredentials, createCredential] },
    { name: "config failure", key: "test-key", failure: "config", calls: [getConfig, listCredentials, createCredential, writeConfig, removeCredential, restoreCredential] },
    { name: "rollback failure", key: "test-key", failure: "rollback", calls: [getConfig, listCredentials, createCredential, writeConfig, removeCredential, restoreCredential] },
    { name: "existing provider", key: "test-key", failure: "exists", calls: [getConfig] },
  ])("handles $name through the HTTP API", async (scenario) => {
    const requests: { call: string; body: unknown }[] = []
    const old = { id: "cred_old", integrationID: "custom", label: "Old", active: true, value: { type: "key", key: "old-key" } }
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        const call = `${request.method} ${new URL(request.url).pathname}`
        requests.push({ call, body: request.body ? await request.json() : undefined })
        if (call === getConfig)
          return Response.json(scenario.failure === "exists" ? [{ type: "document", info: { providers: { custom: config } } }] : [])
        if (call === listCredentials) return Response.json({ data: [old] })
        if (call === createCredential) {
          if (scenario.failure === "credential") return Response.json({ message: "credential failed" }, { status: 500 })
          return Response.json({ data: { ...old, id: "cred_new", label: "Custom", value: { type: "key", key: scenario.key } } })
        }
        if (call === writeConfig) {
          if (scenario.failure === "config" || scenario.failure === "rollback")
            return Response.json({ message: "config failed" }, { status: 500 })
          return new Response(null, { status: 204 })
        }
        if (call === removeCredential) {
          if (scenario.failure === "rollback") return Response.json({ message: "rollback failed" }, { status: 500 })
          return new Response(null, { status: 204 })
        }
        if (call === restoreCredential) return new Response(null, { status: 204 })
        return new Response(null, { status: 404 })
      },
    })

    try {
      const api = OpenCode.make({ baseUrl: server.url.href })
      const input: CustomProvider = { providerID: "custom", name: "Custom", key: scenario.key, config }
      if (scenario.failure === "none") expect(await saveCustomProvider(api, input)).toEqual(input)
      if (scenario.failure === "exists")
        await expect(saveCustomProvider(api, input)).rejects.toBeInstanceOf(CustomProviderExistsError)
      if (scenario.failure === "rollback")
        await expect(saveCustomProvider(api, input)).rejects.toBeInstanceOf(AggregateError)
      if (scenario.failure === "credential" || scenario.failure === "config")
        await expect(saveCustomProvider(api, input)).rejects.toThrow()

      expect(requests.map((request) => request.call)).toEqual(scenario.calls)
      const written = requests.find((request) => request.call === writeConfig)
      if (written) {
        expect(written.body).toEqual({ providers: { custom: config } })
        expect(JSON.stringify(written.body)).not.toContain("test-key")
      }
      const created = requests.find((request) => request.call === createCredential)
      if (created)
        expect(created.body).toMatchObject({ integrationID: "custom", label: "Custom", value: { type: "key", key: "test-key" } })
    } finally {
      await server.stop(true)
    }
  })
})
