import type { SessionInfo } from "@opencode/client/promise"

// Home lists live root sessions only.
export function parseHomeSessionIndex(sessions: SessionInfo[]) {
  return sessions.filter((session) => !session.parentID && typeof session.time.archived !== "number")
}
