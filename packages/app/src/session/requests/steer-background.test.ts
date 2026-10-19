import { describe, expect, test } from "bun:test"
import { createSteerBackground } from "./steer-background"

function setup(input: { fail?: boolean } = {}) {
  const moves: string[] = []
  const state = { sessionID: "ses_alpha", blocking: [{ partID: "prt_shell" }] }

  const claim = createSteerBackground({
    sessionID: () => state.sessionID,
    blocking: () => state.blocking,
    move: async (sessionID) => {
      moves.push(sessionID)

      if (input.fail) throw new Error("server unavailable")
    },
  })

  return { claim, moves, state }
}

describe("createSteerBackground", () => {
  test("claims each blocking work item once", async () => {
    const { claim, moves, state } = setup()

    await claim("ses_alpha")?.move()
    expect(claim("ses_alpha")).toBeUndefined()

    state.blocking = [{ partID: "prt_shell" }, { partID: "prt_subagent" }]
    await claim("ses_alpha")?.move()
    expect(moves).toEqual(["ses_alpha", "ses_alpha"])
  })

  test("claims nothing without blocking work or for another session", () => {
    const { claim, state } = setup()

    expect(claim("ses_beta")).toBeUndefined()
    state.blocking = []
    expect(claim("ses_alpha")).toBeUndefined()
  })

  test("a released claim or failed move lets a later steer move the work", async () => {
    const released = setup()

    released.claim("ses_alpha")?.release()
    expect(released.claim("ses_alpha")).toBeDefined()

    const failed = setup({ fail: true })

    await failed.claim("ses_alpha")?.move()
    await failed.claim("ses_alpha")?.move()
    expect(failed.moves).toEqual(["ses_alpha", "ses_alpha"])
  })
})
