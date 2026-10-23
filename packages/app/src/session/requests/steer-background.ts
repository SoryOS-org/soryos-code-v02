/**
 * A steer moves the run's blocking shells and subagents to the background, so the agent reads it at its next step.
 * Each work item is claimed once: work already moved, or being moved, isn't again. A claim the steer never acts on,
 * or a move that fails, is released so a later steer or the inline hint can move it.
 */
export function createSteerBackground(input: {
  sessionID: () => string | undefined
  blocking: () => readonly { partID: string }[]
  move: (sessionID: string) => Promise<void>
}) {
  const moved = new Set<string>()

  return (sessionID: string) => {
    if (input.sessionID() !== sessionID) return
    const parts = input.blocking().flatMap((task) => (moved.has(task.partID) ? [] : [task.partID]))

    if (parts.length === 0) return
    parts.forEach((id) => moved.add(id))
    const release = () => parts.forEach((id) => moved.delete(id))

    return {
      release,
      move: () => input.move(sessionID).then(() => undefined, release),
    }
  }
}
