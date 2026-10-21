import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { resolveSession } from "../session"

export async function validateSession(input: {
  url: string
  sessionID?: string
  directory?: string
  fetch?: typeof fetch
  headers?: RequestInit["headers"]
}) {
  if (!input.sessionID) return

  const session = await resolveSession(
    createOpencodeClient({
      baseUrl: input.url,
      directory: input.directory,
      fetch: input.fetch,
      headers: input.headers,
    }),
    input.sessionID,
  )
  return session.id
}
