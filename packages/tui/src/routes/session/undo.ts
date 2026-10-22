import { isMessageNotFoundError, type OpenCodeClient } from "@opencode/client"

export type RevertUserMessageApi = {
  /** Returns false when cancel was declined locally (already toasted). */
  cancel: () => Promise<boolean>
  messageExists: () => Promise<boolean>
  interrupt: () => Promise<void>
  wait: () => Promise<void>
  stage: () => Promise<void>
}

/**
 * Undo one user message.
 *
 * Undelivered inbox rows have no projected history yet, so they are withdrawn
 * with `inbox.cancel`. `session.inbox.cancel` returns 204 both when withdrawal
 * wins and when promotion already won (the server swallows InboxConflictError),
 * so a follow-up `message.get` decides whether staged revert is still needed.
 */
export async function revertUserMessage(input: { pending: boolean; api: RevertUserMessageApi }) {
  if (input.pending) {
    if (!(await input.api.cancel())) return "aborted" as const
    if (!(await input.api.messageExists())) return "cancelled" as const
  }
  await input.api.interrupt()
  await input.api.wait()
  await input.api.stage()
  return "staged" as const
}

/** True when the message is projected; false only for MessageNotFoundError. */
export async function projectedMessageExists(get: () => Promise<unknown>) {
  try {
    await get()
    return true
  } catch (error) {
    if (isMessageNotFoundError(error)) return false
    throw error
  }
}

export function revertUserMessageApi(
  session: OpenCodeClient["session"],
  input: { sessionID: string; messageID: string },
): RevertUserMessageApi {
  return {
    cancel: () => session.inbox.cancel({ sessionID: input.sessionID, inboxID: input.messageID }).then(() => true),
    messageExists: () =>
      projectedMessageExists(() => session.message.get({ sessionID: input.sessionID, messageID: input.messageID })),
    interrupt: () => session.interrupt({ sessionID: input.sessionID }).then(() => undefined),
    wait: () => session.wait({ sessionID: input.sessionID }).then(() => undefined),
    stage: () =>
      session.revert.stage({ sessionID: input.sessionID, messageID: input.messageID }).then(() => undefined),
  }
}
