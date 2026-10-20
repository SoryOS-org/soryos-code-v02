import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

/** Connection details for the local OpenCode background service. */
export type Endpoint = {
  readonly url: string
  readonly password?: string
}

export type SessionInfo = {
  readonly id: string
  readonly title?: string
  readonly updated: number
  /** Absolute working directory of the session; tool diffs record paths relative to it. */
  readonly directory: string
  readonly revert?: { readonly messageID: string; readonly messages?: boolean }
}

export type ToolFile = {
  readonly file: string
  readonly patch: string
  readonly status: "added" | "deleted" | "modified"
}

export type ToolPart = {
  readonly id: string
  readonly name: string
  readonly files: readonly ToolFile[]
  readonly review: readonly ("pending" | "kept" | "discarded")[]
}

export type AssistantMessage = {
  readonly id: string
  readonly parts: readonly ToolPart[]
}

export type ReviewEvent = {
  readonly type: string
  readonly data: Record<string, unknown>
}

const REGISTRATION = join(process.env["XDG_STATE_HOME"] ?? join(homedir(), ".local", "state"), "opencode", "service.json")

/** Discover the running local OpenCode service from its registration file. */
export async function discover(): Promise<Endpoint | undefined> {
  const registration = await readFile(REGISTRATION, "utf8").then(
    (value) => JSON.parse(value) as { url?: unknown; pid?: unknown; password?: unknown },
    () => undefined,
  )
  if (!registration || typeof registration.url !== "string" || typeof registration.pid !== "number") return
  const endpoint: Endpoint = {
    url: registration.url,
    password: typeof registration.password === "string" ? registration.password : undefined,
  }
  // The service re-registers on restart; a stale file must not attach to a dead port.
  const health = await request(endpoint, "/api/info").catch(() => undefined)
  if (!health?.ok) return
  const info = (await health.json().catch(() => undefined)) as { pid?: unknown } | undefined
  if (info?.pid !== registration.pid) return
  return endpoint
}

export function api(endpoint: Endpoint) {
  return {
    async sessions(): Promise<SessionInfo[]> {
      const response = await request(endpoint, "/api/session?limit=20&order=desc")
      if (!response?.ok) return []
      const body = (await response.json()) as { data?: unknown[] }
      return (body.data ?? []).flatMap((row) => {
        const item = row as {
          id?: unknown
          title?: unknown
          time?: { updated?: unknown }
          location?: { directory?: unknown }
          revert?: { messageID?: unknown; messages?: unknown }
        }
        if (typeof item.id !== "string" || typeof item.location?.directory !== "string") return []
        return [
          {
            id: item.id,
            title: typeof item.title === "string" ? item.title : undefined,
            updated: typeof item.time?.updated === "number" ? item.time.updated : 0,
            directory: item.location.directory,
            revert:
              typeof item.revert?.messageID === "string"
                ? {
                    messageID: item.revert.messageID,
                    messages: typeof item.revert.messages === "boolean" ? item.revert.messages : undefined,
                  }
                : undefined,
          },
        ]
      })
    },

    async messages(sessionID: string): Promise<AssistantMessage[]> {
      const response = await request(endpoint, `/api/session/${encodeURIComponent(sessionID)}/message?limit=200`)
      if (!response?.ok) return []
      const body = (await response.json()) as { data?: unknown[] }
      return (body.data ?? []).flatMap((row) => {
        const message = row as { id?: unknown; type?: unknown; content?: unknown }
        if (message.type !== "assistant" || typeof message.id !== "string" || !Array.isArray(message.content)) return []
        const parts = message.content.flatMap((item): ToolPart[] => {
          const part = item as {
            type?: unknown
            id?: unknown
            name?: unknown
            state?: { status?: unknown; metadata?: { files?: unknown } }
            review?: { changes?: unknown }
          }
          if (part.type !== "tool" || typeof part.id !== "string" || typeof part.name !== "string") return []
          const files = Array.isArray(part.state?.metadata?.files)
            ? part.state.metadata.files.flatMap((value): ToolFile[] => {
                const file = value as { file?: unknown; patch?: unknown; status?: unknown }
                if (typeof file.file !== "string" || typeof file.patch !== "string") return []
                return [
                  {
                    file: file.file,
                    patch: file.patch,
                    status:
                      file.status === "added" || file.status === "deleted" || file.status === "modified"
                        ? file.status
                        : "modified",
                  },
                ]
              })
            : []
          const review = Array.isArray(part.review?.changes)
            ? part.review.changes.map((value) =>
                value === "kept" ? ("kept" as const) : value === "discarded" ? ("discarded" as const) : ("pending" as const),
              )
            : []
          return [{ id: part.id, name: part.name, files, review }]
        })
        return [{ id: message.id, parts }]
      })
    },

    /** User prompts, oldest first: the checkpoint entries for a session's requests. */
    async requests(sessionID: string): Promise<{ id: string; text: string; created: number }[]> {
      const response = await request(
        endpoint,
        `/api/session/${encodeURIComponent(sessionID)}/message?limit=100&type=user`,
      )
      if (!response?.ok) return []
      const body = (await response.json()) as { data?: unknown[] }
      return (body.data ?? []).flatMap((row) => {
        const message = row as { id?: unknown; text?: unknown; time?: { created?: unknown } }
        if (typeof message.id !== "string" || typeof message.text !== "string") return []
        return [{ id: message.id, text: message.text, created: typeof message.time?.created === "number" ? message.time.created : 0 }]
      })
    },

    async review(
      sessionID: string,
      messageID: string,
      partID: string,
      decision: "keep" | "discard",
      changes?: readonly number[],
    ): Promise<void> {
      const response = await request(endpoint, `/api/session/${encodeURIComponent(sessionID)}/review/${decision}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messageID, partID, ...(changes ? { changes: [...changes] } : {}) }),
      })
      if (!response?.ok) {
        const body = (await response?.json().catch(() => undefined)) as { message?: unknown } | undefined
        throw new Error(typeof body?.message === "string" ? body.message : `Review ${decision} failed`)
      }
    },

    /** Files-only checkpoint restore: reverts files to the message's checkpoint, keeping messages. */
    async restoreCheckpoint(sessionID: string, messageID: string): Promise<void> {
      const response = await request(endpoint, `/api/session/${encodeURIComponent(sessionID)}/revert/stage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messageID, messages: false }),
      })
      if (!response?.ok) throw new Error("Checkpoint restore failed")
    },

    /** Undoes a staged restore by putting the pre-restore file state back. */
    async restoreLatest(sessionID: string): Promise<void> {
      const response = await request(endpoint, `/api/session/${encodeURIComponent(sessionID)}/revert`, {
        method: "DELETE",
      })
      if (!response?.ok) throw new Error("Checkpoint undo failed")
    },

    /** Streams server events until the signal aborts. Reconnects are the caller's concern. */
    async events(onEvent: (event: ReviewEvent) => void, signal: AbortSignal): Promise<void> {
      const response = await request(endpoint, "/api/event", { signal })
      if (!response?.ok || !response.body) throw new Error("Event stream unavailable")
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffered = ""
      try {
        while (!signal.aborted) {
          const { done, value } = await reader.read()
          if (done) break
          buffered += decoder.decode(value, { stream: true })
          const frames = buffered.split("\n\n")
          buffered = frames.pop() ?? ""
          for (const frame of frames) {
            const line = frame.split("\n").find((item) => item.startsWith("data:"))
            if (!line) continue
            const event = JSON.parse(line.slice(5).trim()) as ReviewEvent
            if (event.type !== "server.connected") onEvent(event)
          }
        }
      } finally {
        await reader.cancel().catch(() => undefined)
      }
    },
  }
}

async function request(endpoint: Endpoint, path: string, init?: RequestInit) {
  return fetch(new URL(path, endpoint.url), {
    ...init,
    headers: {
      ...(endpoint.password === undefined
        ? {}
        : { authorization: "Basic " + Buffer.from(`opencode:${endpoint.password}`).toString("base64") }),
      ...init?.headers,
    },
    signal: init?.signal ?? AbortSignal.timeout(10_000),
  }).catch(() => undefined)
}
