import { describe, expect, test } from "bun:test"
import { validateCustomProvider } from "./form"

const t = (key: string) => key

describe("validateCustomProvider", () => {
  test("builds trimmed V2 config with an environment credential and headers", () => {
    const result = validateCustomProvider({
      form: {
        providerID: "custom-provider",
        name: " Custom Provider ",
        baseURL: "https://api.example.com ",
        apiKey: " {env: CUSTOM_PROVIDER_KEY} ",
        models: [{ row: "m0", id: " model-a ", name: " Model A ", err: {} }],
        headers: [
          { row: "h0", key: " X-Test ", value: " enabled ", err: {} },
          { row: "h1", key: "", value: "", err: {} },
        ],
        err: {},
      },
      t,
      existingProviderIDs: new Set(),
    })

    expect(result.result).toEqual({
      providerID: "custom-provider",
      name: "Custom Provider",
      key: undefined,
      config: {
        name: "Custom Provider",
        package: "aisdk:@ai-sdk/openai-compatible",
        env: ["CUSTOM_PROVIDER_KEY"],
        settings: { baseURL: "https://api.example.com" },
        headers: { "X-Test": "enabled" },
        models: { "model-a": { name: "Model A" } },
      },
    })
  })

  test("rejects existing providers and duplicate model and header rows", () => {
    const result = validateCustomProvider({
      form: {
        providerID: "custom-provider",
        name: "Provider",
        baseURL: "https://api.example.com",
        apiKey: "secret",
        models: [
          { row: "m0", id: "model-a", name: "Model A", err: {} },
          { row: "m1", id: "model-a", name: "Model A 2", err: {} },
        ],
        headers: [
          { row: "h0", key: "Authorization", value: "one", err: {} },
          { row: "h1", key: "authorization", value: "two", err: {} },
        ],
        err: {},
      },
      t,
      existingProviderIDs: new Set(["custom-provider"]),
    })

    expect(result.result).toBeUndefined()
    expect(result.err.providerID).toBe("provider.custom.error.providerID.exists")
    expect(result.models[1]).toEqual({ id: "provider.custom.error.duplicate", name: undefined })
    expect(result.headers[1]).toEqual({ key: "provider.custom.error.duplicate", value: undefined })
  })

  test.each(["", "raw-test-key"])("keeps raw API keys out of provider config: %s", (apiKey) => {
    const result = validateCustomProvider({
      form: {
        providerID: "custom",
        name: "Custom",
        baseURL: "https://api.example.com/v1",
        apiKey,
        models: [{ row: "m0", id: "example", name: "Example", err: {} }],
        headers: [{ row: "h0", key: "", value: "", err: {} }],
        err: {},
      },
      t,
      existingProviderIDs: new Set(),
    }).result

    expect(result).toBeDefined()
    expect(result?.key).toBe(apiKey || undefined)
    expect(result?.config).toEqual({
      name: "Custom",
      package: "aisdk:@ai-sdk/openai-compatible",
      settings: { baseURL: "https://api.example.com/v1" },
      models: { example: { name: "Example" } },
    })
    expect(result?.config).not.toHaveProperty("env")
    expect(result?.config).not.toHaveProperty("settings.apiKey")
  })
})
