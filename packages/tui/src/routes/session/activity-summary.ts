import type {
  SessionMessageAssistant,
  SessionMessageAssistantReasoning,
  SessionMessageAssistantTool,
  SessionMessageInfo,
} from "@opencode/client"
import { canonicalToolName, executeCalls } from "../../util/tool-display"
import { visitEntries } from "./anchor-view"
import { instructionPaths, type PartRef, type SessionEntry, type SessionNode } from "./grouping/session"
import { reasoningContent } from "./message-parts"
import { resolvePart } from "./rows"

type Item = {
  message: SessionMessageAssistant
  part: SessionMessageAssistantReasoning | SessionMessageAssistantTool
}

/**
 * Summary for an activity group's subtree; permission-blocked tools are left out.
 * Until something finishes, the label is the first running item's status, e.g. "Running command…".
 */
export function summarizeActivity(
  node: Extract<SessionNode, { type: "group" }>,
  message: (messageID: string) => SessionMessageInfo | undefined,
  pending: readonly PartRef[],
  closed: boolean,
) {
  const entries: SessionEntry[] = []
  visitEntries(node.children, (entry) => entries.push(entry))
  const items = entries.flatMap((entry) => {
    if (entry.type !== "part") return []
    if (pending.some((ref) => ref.messageID === entry.ref.messageID && ref.partID === entry.ref.partID)) return []
    const item = message(entry.ref.messageID)
    if (item?.type !== "assistant") return []
    const part = resolvePart(item, entry.ref.partID)
    return part?.type === "reasoning" || part?.type === "tool" ? [{ entry, message: item, part }] : []
  })
  const files = new Set(
    entries.flatMap((entry) => (entry.type === "message" ? instructionPaths(message(entry.messageID)) : [])),
  )
  const summary = activitySummary(items, files.size, closed)
  const current = items.find((item) => isActive(item, closed))
  return { ...summary, label: summary.label || (current ? busyLabel(current.part) : "") }
}

/** Status for a running item, independent of its details, so it doesn't flicker as they arrive. */
export function busyLabel(part: Item["part"]) {
  if (part.type === "reasoning") return "Thinking…"
  const name = canonicalToolName(part.name)
  if (name === "shell") return part.state.status === "streaming" ? "Preparing command…" : "Running command…"
  if (name === "read") return "Reading file…"
  if (name === "edit") return "Editing file…"
  if (name === "write") return "Writing file…"
  if (name === "patch") return "Applying patch…"
  if (name === "execute") return part.state.status === "streaming" ? "Preparing code…" : "Running code…"
  return `Running ${name}…`
}

/**
 * Low verbosity's activity summary, e.g. "3 commands, 1 edit, 2 thoughts, 4 reads".
 * The label counts only finished work; running items are reported through `active`.
 * Code-mode `execute` counts its finished nested calls rather than itself.
 * Instructions count distinct loaded files, matching the instruction subgroup.
 * Once a later row closes the group, its thoughts count as finished, as in Medium.
 */
export function activitySummary(items: readonly Item[], instructions: number, closed = false) {
  const counts = { command: 0, edit: 0, thought: 0, read: 0, tool: 0, instruction: instructions }
  items.forEach((item) => {
    if (item.part.type === "reasoning") {
      // Redacted-only reasoning renders nothing, so it isn't a visible thought.
      if (!isActive(item, closed) && reasoningContent(item.part)) counts.thought++
      return
    }
    const name = canonicalToolName(item.part.name)
    if (name === "execute") {
      const calls = executeCalls(
        item.part.state.status === "streaming" ? undefined : item.part.state.metadata?.toolCalls,
      ).filter((call) => call.status !== "running")
      calls.forEach((call) => {
        if (canonicalToolName(call.tool) === "read") counts.read++
        else counts.tool++
      })
      // With no finished nested calls to count, a finished execute counts as itself.
      if (calls.length === 0 && !isActive(item, closed)) counts.tool++
      return
    }
    if (isActive(item, closed)) return
    if (name === "shell") counts.command++
    else if (name === "read") counts.read++
    else if (name === "edit" || name === "write" || name === "patch") counts.edit++
    else counts.tool++
  })
  const n = (count: number, singular: string, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`
  return {
    label: [
      counts.command > 0 && `ran ${n(counts.command, "command")}`,
      counts.edit > 0 && `modified ${n(counts.edit, "file")}`,
      counts.read > 0 && `read ${n(counts.read, "file")}`,
      counts.tool > 0 && `used ${n(counts.tool, "tool")}`,
      counts.thought > 0 && `${n(counts.thought, "thought")}`,
      counts.instruction > 0 && `loaded ${n(counts.instruction, "instruction")}`,
    ]
      .filter(Boolean)
      .join(", "),
    active: items.some((item) => isActive(item, closed)),
  }
}

function isActive(item: Item, closed: boolean) {
  if (item.part.type === "reasoning")
    return !closed && item.part.time?.completed === undefined && item.message.time.completed === undefined
  return item.part.state.status === "streaming" || item.part.state.status === "running"
}
