import { describe, expect, test } from "bun:test"
import type { SessionInfo } from "@opencode/client/promise"
import type { ServerCtx } from "@/runtime/server/runtime"
import { parseVoiceDelegation } from "@/session/timeline/voice-delegation"
import { continuedHeader, header } from "./handoff"
import { VoiceTools } from "./tools"

const session = (id: string, title: string, extra: Partial<SessionInfo> = {}) =>
  ({
    id,
    title,
    location: { directory: `/Users/kit/code/${title.toLowerCase()}` },
    time: { created: 1, updated: 1 },
    ...extra,
  }) as SessionInfo

function setup(
  input: { open?: (session: SessionInfo) => Promise<void>; tabs?: string[]; sessions?: SessionInfo[] } = {},
) {
  const sessions = [
    session("ses_here", "HERE"),
    session("ses_desktop", "DESKTOP"),
    session("ses_old", "OLD", { time: { created: 1, updated: 1, archived: 2 } }),
    ...(input.sessions ?? []),
  ]

  const calls = {
    open: [] as string[],
    background: [] as string[],
    prompts: [] as { sessionID: string; text: string }[],
  }

  const empty = { data: [], cursor: {} }

  const ctx = {
    sdk: {
      api: {
        session: {
          get: async (request: { sessionID: string }) => {
            const found = sessions.find((item) => item.id === request.sessionID)

            if (!found) throw new Error("not found")

            return found
          },
          list: async (request: { search?: string; parentID?: null }) => ({
            data: sessions.filter(
              (item) =>
                !item.time.archived &&
                (request.parentID !== null || !item.parentID) &&
                (!request.search || item.title?.toLowerCase().includes(request.search.toLowerCase())),
            ),
            cursor: {},
          }),
          background: async (request: { sessionID: string }) => calls.background.push(request.sessionID),
          inbox: { list: async () => [] },
        },
        message: { list: async () => empty },
      },
    },
    data: {
      session: {
        prompt: async (request: { sessionID: string; text: string }) => calls.prompts.push(request),
      },
    },
  } as unknown as ServerCtx

  const tools = new VoiceTools(ctx, {
    open: async (next) => {
      calls.open.push(next.id)
      await input.open?.(next)
    },
    tabs: () => input.tabs ?? [],
  })

  const request = { id: "delegation", sessionID: "ses_here", transcript: ["user: go to the desktop session"] }
  let count = 0

  const run = async (name: string, args: Record<string, unknown> = {}) =>
    JSON.parse(
      await tools.run(
        { call_id: `call_${count++}`, name, arguments: JSON.stringify(args) },
        request,
        new AbortController().signal,
      ),
    )

  return { calls, request, run }
}

describe("open_session", () => {
  test("opens the session and later tools default to it", async () => {
    const voice = setup()

    expect(await voice.run("open_session", { session_id: "ses_desktop" })).toEqual({ opened: "DESKTOP" })
    expect(voice.calls.open).toEqual(["ses_desktop"])
    expect(voice.request.sessionID).toBe("ses_desktop")
  })

  test("reports a missing or archived session without moving the screen", async () => {
    const voice = setup()

    expect((await voice.run("open_session", { session_id: "ses_missing" })).error).toContain("did not move")
    expect((await voice.run("open_session", { session_id: "ses_old" })).error).toContain("archived")
    expect(voice.calls.open).toEqual([])
    expect(voice.request.sessionID).toBe("ses_here")
  })

  test("reports failure when Desktop never shows the session", async () => {
    const voice = setup({ open: () => Promise.reject(new Error("not shown")) })
    const result = await voice.run("open_session", { session_id: "ses_desktop" })

    expect(result.opened).toBeUndefined()
    expect(result.error).toContain("did not move")
    expect(voice.request.sessionID).toBe("ses_here")
  })
})

describe("search_sessions", () => {
  test("ranks the spoken name first, then top-level sessions with an open tab", async () => {
    const voice = setup({
      tabs: ["ses_hex_tab"],
      sessions: [
        session("ses_hex_sub", "Hex notes", { parentID: "ses_here", time: { created: 1, updated: 9 } }),
        session("ses_hex_new", "Hex notes", { time: { created: 1, updated: 5 } }),
        session("ses_hex_tab", "Hex notes", { time: { created: 1, updated: 2 } }),
        session("ses_hex", "HEX"),
      ],
    })

    const found = await voice.run("search_sessions", { query: "the hex session" })

    expect(found.map((row: { id: string }) => row.id)).toEqual(["ses_hex", "ses_hex_tab", "ses_hex_new", "ses_hex_sub"])
    expect(found[1].open_tab).toBe(true)
  })
})

describe("reading and messaging another session", () => {
  test("never moves the screen", async () => {
    const voice = setup()

    await voice.run("read_session", { session_id: "ses_desktop" })
    await voice.run("send_message", { session_id: "ses_desktop", text: "Run the tests." })

    expect(voice.calls.open).toEqual([])
    expect(voice.request.sessionID).toBe("ses_here")
  })
})

describe("send_message", () => {
  test("hands off in the iOS format, explaining the fields once per session", async () => {
    const voice = setup()

    expect((await voice.run("send_message", { session_id: "ses_desktop", text: "Run the tests." })).admitted).toBe(true)
    await voice.run("send_message", { session_id: "ses_desktop", text: "Also lint." })
    await voice.run("send_message", { text: "Check the build." })

    const [first, second, other] = voice.calls.prompts

    expect(first.text.startsWith(`${header}\n`)).toBe(true)
    expect(JSON.parse(first.text.slice(first.text.indexOf("\n") + 1))).toEqual({
      context: 'Session "DESKTOP" in project "desktop".',
      instruction: "Run the tests.",
      transcript_delta: ["user: go to the desktop session"],
    })
    expect(parseVoiceDelegation(first.text)).toEqual({ instruction: "Run the tests.", framing: undefined })
    expect(second.text.startsWith(`${continuedHeader}\n`)).toBe(true)
    expect(other.sessionID).toBe("ses_here")
    expect(other.text.startsWith(`${header}\n`)).toBe(true)
  })

  test("moves running work to the background before a steer, not before a queued message", async () => {
    const voice = setup()

    await voice.run("send_message", { text: "Stop and look at this." })
    await voice.run("send_message", { text: "Afterwards, lint.", delivery: "queue" })

    expect(voice.calls.background).toEqual(["ses_here"])
  })
})
