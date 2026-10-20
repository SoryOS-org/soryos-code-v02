export * as SubagentCompletion from "./subagent-completion.js"

import { Effect } from "effect"
import type { Job } from "../job.js"
import type { Session } from "../session.js"
import type { SessionMessage } from "./message.js"
import type { SessionSchema } from "./schema.js"

export const NO_TEXT = "Subagent completed without a text response."

export function text(message: SessionMessage.Info | undefined) {
  if (message?.type !== "assistant") return NO_TEXT
  return (
    message.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .filter((text) => text.length > 0)
      .join("\n\n") || NO_TEXT
  )
}

/**
 * Runs the child until it is idle with no background work of its own left. Each background job
 * reports back through a synthetic message that wakes the child, so a job only stops counting once
 * its pending marker is cleared after admission; the next resume then drains that notice.
 */
export const settle = <E>(
  jobs: Pick<Job.Interface, "pendingBackground" | "get" | "wait">,
  sessionID: SessionSchema.ID,
  resume: Effect.Effect<void, E>,
): Effect.Effect<void, E> =>
  Effect.gen(function* () {
    yield* resume
    const pending = (yield* jobs.pendingBackground).filter(
      (background) =>
        (background.recovery.kind === "shell" ? background.recovery.sessionID : background.recovery.parentSessionID) ===
        sessionID,
    )
    if (pending.length === 0) return
    const running = yield* Effect.filter(pending, (background) =>
      jobs.get(background.id).pipe(Effect.map((info) => info?.status === "running")),
    )
    // Finished jobs keep their marker until their notice is admitted, which happens shortly after.
    if (running.length === 0) yield* Effect.sleep("50 millis")
    yield* Effect.forEach(running, (background) => jobs.wait({ id: background.id }), { discard: true })
    return yield* settle(jobs, sessionID, resume)
  })

export const deliver = Effect.fnUntraced(function* (
  sessions: Pick<Session.Interface, "synthetic">,
  jobs: Pick<Job.Interface, "completeBackground">,
  input: Pick<Job.Info, "status" | "output" | "error" | "notificationID"> & {
    recovery: Extract<Job.Recovery, { kind: "subagent" }>
    resume?: boolean
  },
) {
  if (input.status === "running") return
  const recovery = input.recovery
  const text =
    input.status === "completed"
      ? (input.output ?? NO_TEXT)
      : input.status === "error"
        ? (input.error ?? "Subagent failed")
        : "Subagent cancelled"
  yield* sessions.synthetic({
    ...(input.notificationID ? { id: input.notificationID } : {}),
    sessionID: recovery.parentSessionID,
    ...(input.resume === false ? { resume: false } : {}),
    description: recovery.description,
    text: `<subagent sessionID="${recovery.childSessionID}" state="${input.status}" description="${recovery.description}">\n${text}\n</subagent>`,
    metadata: { source: "subagent", childID: recovery.childSessionID, agent: recovery.agent, state: input.status },
  })
  if (input.notificationID) yield* jobs.completeBackground(input.notificationID)
})
