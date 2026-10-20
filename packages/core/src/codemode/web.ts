export * as CodeModeWeb from "./web.js"

import { Extension } from "@opencode/codemode"
import { isRecord } from "@opencode/ai/utils/record"
import { Effect } from "effect"

const TIMEOUT_MS = 30_000

type Init = {
  readonly method?: string
  readonly headers?: Record<string, string> | Array<[string, string]>
  readonly body?: string | Uint8Array<ArrayBuffer> | URLSearchParams
}

/** Runs before the request leaves the process, so a failure keeps it off the network entirely. */
type Guard<R> = (url: string) => Effect.Effect<void, unknown, R>

const fetch =
  <R>(guard: Guard<R>) =>
  (input: string | URL, init: Init = {}) =>
    Effect.gen(function* () {
      if (URL.parse(String(input))?.protocol === "file:")
        return yield* Effect.fail(new Error("fetch cannot be used for filesystem access."))
      yield* guard(String(input))
      return yield* Effect.tryPromise({ try: () => send(input, init), catch: (reason) => reason })
    })

const send = async (input: string | URL, init: Init) => {
  const response = await globalThis.fetch(input, {
    method: init.method,
    headers: init.headers,
    body: init.body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const bytes = await response.bytes()
  const headers = Object.fromEntries(response.headers)
  const text = () => new TextDecoder().decode(bytes)
  return {
    url: response.url,
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
    redirected: response.redirected,
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
      has: (name: string) => name.toLowerCase() in headers,
      entries: () => Object.entries(headers),
    },
    text: async () => text(),
    json: async () => JSON.parse(text()) as unknown,
    bytes: async () => bytes,
  }
}

/**
 * `fetch` returns an Effect so the guard sees this execution's services: the interpreter runs it in the caller's
 * fiber, which means an interrupted call also interrupts a permission prompt that is still waiting for an answer.
 */
export const extension = <R = never>(guard: Guard<R> = () => Effect.void) =>
  Extension.make({ name: "web", globals: { fetch: fetch(guard) } })

/** What to show for a fetch call: its method and URL. */
export const display = (args: ReadonlyArray<unknown>) => {
  const [input, init] = args
  const method = isRecord(init) && typeof init.method === "string" ? init.method.toUpperCase() : "GET"
  return { method, url: String(input) }
}
