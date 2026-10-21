import type { OpencodeClient } from "@opencode-ai/sdk/v2"

export async function resolveSession(sdk: OpencodeClient, value: string) {
  const id = value.startsWith("ses") ? value : `ses_${value}`
  const current = await sdk.session.get({ sessionID: id })
  if (current.data) return current.data
  if (current.response.status !== 404) throw current.error

  // Do not restrict resolution to the default page of the 100 newest sessions:
  // an older match can make an otherwise unique prefix ambiguous.
  const sessions = await sdk.session.list({ limit: Number.MAX_SAFE_INTEGER }, { throwOnError: true })
  const matches = sessions.data.filter((session) => session.id.startsWith(id))
  if (matches.length === 1) return matches[0]
  if (matches.length === 0) throw new Error(`Session not found: ${value}`)
  throw new Error(`Ambiguous session ID: ${value}. Use a longer ID. Matches: ${matches.map((s) => s.id).join(", ")}`)
}
