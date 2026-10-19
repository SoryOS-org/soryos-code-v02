import type { OpenCodeClient } from "@opencode/client/promise"
import type { CustomProvider } from "./form"

export class CustomProviderExistsError extends Error {
  readonly name = "CustomProviderExistsError"
}

export async function saveCustomProvider(api: OpenCodeClient, input: CustomProvider) {
  const entries = await api.config.get()
  if (entries.some((entry) => entry.type === "document" && Object.hasOwn(entry.info.providers ?? {}, input.providerID)))
    throw new CustomProviderExistsError(input.providerID)

  const credentials = input.key ? await api.credential.list() : []
  const previous = credentials.find((credential) => credential.integrationID === input.providerID && credential.active)
  const created = input.key
    ? await api.credential.create({
        integrationID: input.providerID,
        label: input.name,
        value: { type: "key", key: input.key },
      })
    : undefined

  try {
    await api.config.update({ providers: { [input.providerID]: input.config } })
  } catch (error) {
    if (!created) throw error

    const failures: unknown[] = [error]
    await api.credential.remove({ credentialID: created.id }).catch((failure) => {
      failures.push(failure)
    })
    if (previous)
      await api.credential.activate({ credentialID: previous.id }).catch((failure) => {
        failures.push(failure)
      })

    if (failures.length > 1) throw new AggregateError(failures)
    throw error
  }

  return input
}
