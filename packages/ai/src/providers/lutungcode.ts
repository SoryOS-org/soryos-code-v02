import { HttpOptions, ProviderID, type ModelID } from "../schema/index.js"
import { AuthOptions, type ProviderAuthOption } from "../route/auth-options.js"
import { SystemOne } from "../experimental/system-one.js"

export const id = ProviderID.make("lutungcode")
const baseURL = "https://lutungcode.ai/inference/systemone/v1"

export type Options = ProviderAuthOption<"optional"> & {
  readonly baseURL?: string
  readonly headers?: Record<string, string>
  readonly http?: HttpOptions.Input
}

export const configure = (input: Options = {}) => {
  const evaluation = (modelID: string | ModelID) =>
    SystemOne.model({
      id: modelID,
      provider: id,
      providerMetadataKey: "lutungcode",
      auth: AuthOptions.bearer(input, "LUTUNGCODE_API_KEY"),
      baseURL: input.baseURL ?? baseURL,
      headers: input.headers,
      http: HttpOptions.make(input.http),
    })
  return { id, experimental: { evaluation }, configure }
}

export const provider = configure()
export const experimental = provider.experimental

export * as LutungCode from "./lutungcode.js"
