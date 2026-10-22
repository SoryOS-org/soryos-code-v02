import { expect, test } from "bun:test"
import { sessionEpilogue, updateRestartNotice } from "../../src/util/presentation"

test("formats session continuation summary", () => {
  const epilogue = sessionEpilogue({ title: "A session", sessionID: "ses_123" })
  expect(epilogue).toContain("A session")
  expect(epilogue).toContain("opencode -s ses_123")
})

test("tells the user to start OpenCode again after an update", () => {
  const notice = updateRestartNotice("2.0.0")
  expect(Bun.stripANSI(notice)).toBe("  Updated   OpenCode 2.0.0 · run opencode to start it")
})
