export * as SessionReview from "./review.js"

import { and, eq } from "drizzle-orm"
import { Effect, Option, Schema } from "effect"
import { FileDiff } from "@opencode/schema/file-diff"
import { Bom } from "@opencode/util/bom"
import { Bus } from "../bus.js"
import { Database } from "../database/database.js"
import { Environment } from "../environment/index.js"
import { FileAccess } from "../file-access.js"
import { FileMutation } from "../file-mutation.js"
import { Instance } from "../instance/service.js"
import { SessionEvent } from "./event.js"
import { MessageNotFoundError, ReviewConflictError, ReviewNotFoundError } from "./error.js"
import { SessionMessage } from "./message.js"
import { SessionSchema } from "./schema.js"
import { SessionMessageTable } from "./sql.js"

export interface Input {
  readonly session: SessionSchema.Info
  readonly messageID: SessionMessage.ID
  readonly partID: string
  /** Change indexes to decide; omitted decides every change of the tool call. */
  readonly changes?: readonly number[]
}

export const keep = Effect.fn("SessionReview.keep")(function* (input: Input) {
  const bus = yield* Bus.Service
  const database = yield* Database.Service
  const instances = yield* Instance.Service
  return yield* Effect.gen(function* () {
    const part = yield* loadTool(database.db, pick(input))
    const selected = select(fileChanges(decodeFiles(part.state)), input.changes)
    if (selected.length > 0)
      yield* bus.publish(SessionEvent.Tool.Reviewed, {
        sessionID: input.session.id,
        assistantMessageID: input.messageID,
        id: input.partID,
        changes: selected.map((change) => change.index),
        decision: "keep",
      })
    return selected.map((change) => change.index)
  }).pipe(instances.provide(input.session))
})

export const discard = Effect.fn("SessionReview.discard")(function* (input: Input) {
  const bus = yield* Bus.Service
  const database = yield* Database.Service
  const instances = yield* Instance.Service
  return yield* Effect.gen(function* () {
    const environment = yield* Environment.Service
    const fileMutation = yield* FileMutation.Service
    const access = yield* FileAccess.Service
    const part = yield* loadTool(database.db, pick(input))
    const selected = select(fileChanges(decodeFiles(part.state)), input.changes)
    if (selected.length > 0) {
      const grouped = new Map<string, { entry: FileDiff.Info; changes: Change[] }[]>()
      for (const change of selected) {
        const items = grouped.get(change.file.file) ?? []
        if (!grouped.has(change.file.file)) grouped.set(change.file.file, items)
        let item = items.find((candidate) => candidate.entry === change.file)
        if (!item) {
          item = { entry: change.file, changes: [] }
          items.push(item)
        }
        item.changes.push(change)
      }
      // The call was authorized and applied when it ran; reverting it needs no new approval.
      const targets = yield* Effect.forEach(Array.from(grouped), ([file, items]) =>
        Effect.gen(function* () {
          const target = yield* access.resolve({ path: file, kind: "file" })
          return { file, items, target }
        }),
      )
      yield* fileMutation.withLock(targets.map((item) => item.target.absolute))(
        Effect.forEach(
          targets,
          ({ file, items, target }) =>
            Effect.gen(function* () {
              const current = yield* FileMutation.readText(environment.files, target.absolute).pipe(
                Effect.catchTag("Environment.NotFound", () => Effect.undefined),
              )
              const reverted = revertChanges(current?.text, items)
              if (!reverted) return yield* new ReviewConflictError({ ...pick(input), file })
              if (reverted.remove) {
                if (current !== undefined) yield* environment.files.remove(target.absolute)
                return
              }
              yield* fileMutation.write({ target, content: Bom.join(reverted.text, current?.bom ?? false) })
            }),
          { discard: true },
        ),
      )
      yield* bus.publish(SessionEvent.Tool.Reviewed, {
        sessionID: input.session.id,
        assistantMessageID: input.messageID,
        id: input.partID,
        changes: selected.map((change) => change.index),
        decision: "discard",
      })
    }
    return selected.map((change) => change.index)
  }).pipe(instances.provide(input.session))
})

const pick = (input: Input) => ({
  sessionID: input.session.id,
  messageID: input.messageID,
  partID: input.partID,
})

const loadTool = Effect.fnUntraced(function* (
  db: Database.Interface["db"],
  input: { readonly sessionID: SessionSchema.ID; readonly messageID: SessionMessage.ID; readonly partID: string },
) {
  const row = yield* db
    .select()
    .from(SessionMessageTable)
    .where(and(eq(SessionMessageTable.session_id, input.sessionID), eq(SessionMessageTable.id, input.messageID)))
    .get()
    .pipe(Effect.orDie)
  if (!row) return yield* new MessageNotFoundError(input)
  const message = yield* Schema.decodeUnknownEffect(SessionMessage.Info)({
    ...row.data,
    id: row.id,
    type: row.type,
  }).pipe(Effect.orDie)
  const part =
    message.type === "assistant"
      ? message.content.find(
          (item): item is SessionMessage.AssistantTool => item.type === "tool" && item.id === input.partID,
        )
      : undefined
  if (!part) return yield* new ReviewNotFoundError(input)
  return part
})

const decodeFiles = (state: SessionMessage.ToolState) => {
  if (state.status !== "completed" && state.status !== "error") return []
  const value = state.metadata?.files
  if (value === undefined) return []
  return Option.getOrUndefined(Schema.decodeUnknownOption(Schema.Array(FileDiff.Info))(value)) ?? []
}

export interface Hunk {
  /** Exact old-side region text, including line terminators except at a no-newline end. */
  readonly before: string
  /** Exact new-side region text as the call left it. */
  readonly after: string
  /** 1-based line where the region starts in the file as the call left it. */
  readonly newStart: number
}

export interface Change {
  readonly index: number
  readonly file: FileDiff.Info
  /** Undefined for an existence-only change: an empty created or deleted file. */
  readonly hunk: Hunk | undefined
}

/**
 * One reviewable change per unified-diff hunk, in `metadata.files` order. A file entry
 * without hunks (empty created or deleted file) is one existence change.
 */
export function fileChanges(files: readonly FileDiff.Info[]): Change[] {
  const changes = files.flatMap((file) => {
    const hunks = parseHunks(file.patch)
    return (hunks.length > 0 ? hunks : [undefined]).map((hunk) => ({ file, hunk }))
  })
  return changes.map((change, index) => ({ ...change, index }))
}

const select = (changes: readonly Change[], requested: readonly number[] | undefined) => {
  if (requested === undefined) return changes
  const wanted = new Set(requested)
  return changes.filter((change) => wanted.has(change.index))
}

/**
 * Parses hunks from the unified patches `fileDiff` records. Line bodies keep their exact
 * bytes: a CRLF file's lines carry `\r`, joined back with `\n`.
 */
export function parseHunks(patch: string): Hunk[] {
  const result: Hunk[] = []
  let current:
    | { newStart: number; before: string[]; after: string[]; last: "before" | "after" | "both" }
    | undefined
  for (const line of patch.split("\n")) {
    const header = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
    if (header) {
      if (current) result.push({ before: current.before.join(""), after: current.after.join(""), newStart: current.newStart })
      current = { newStart: Number(header[1]), before: [], after: [], last: "both" }
      continue
    }
    if (!current) continue
    // A bare empty entry is the trailing split artifact of the patch's final newline, never
    // a content line: this patch producer prefixes unchanged empty lines with a space.
    if (line === "") continue
    if (line.startsWith("\\")) {
      // "\ No newline at end of file": the entry before this marker ends its side's region.
      if (current.last !== "after") stripNewline(current.before)
      if (current.last !== "before") stripNewline(current.after)
      continue
    }
    const text = `${line.slice(1)}\n`
    if (line.startsWith("-")) {
      current.before.push(text)
      current.last = "before"
      continue
    }
    if (line.startsWith("+")) {
      current.after.push(text)
      current.last = "after"
      continue
    }
    current.before.push(text)
    current.after.push(text)
    current.last = "both"
  }
  if (current) result.push({ before: current.before.join(""), after: current.after.join(""), newStart: current.newStart })
  return result
}

const stripNewline = (lines: string[]) => {
  const index = lines.length - 1
  if (index >= 0) lines[index] = lines[index].slice(0, -1)
}

interface Reverted {
  readonly text: string
  readonly remove: boolean
}

/**
 * Rewinds the selected changes in `content`, leaving unselected (kept) changes applied.
 * Returns undefined when the file drifted away from the call's recorded regions.
 */
function revertChanges(
  content: string | undefined,
  items: readonly { entry: FileDiff.Info; changes: readonly Change[] }[],
): Reverted | undefined {
  let text = content ?? ""
  let created = false
  for (const item of items) {
    if (item.entry.status === "added") created = true
    for (const change of item.changes) {
      if (!change.hunk) {
        if (item.entry.status === "added") {
          if (text !== "") return undefined
          created = true
          continue
        }
        if (item.entry.status === "deleted") {
          if (text !== "") return undefined
          continue
        }
        continue
      }
      if (change.hunk.after === "") {
        // A whole-file deletion: restoring its content only makes sense onto an absent file.
        if (text !== "") return undefined
        text = change.hunk.before
        continue
      }
      const at = locate(text, change.hunk)
      if (at === undefined) return undefined
      text = `${text.slice(0, at)}${change.hunk.before}${text.slice(at + change.hunk.after.length)}`
    }
  }
  // A discarded creation leaves no file behind unless the user wrote more into it.
  if (created && text === "") return { text, remove: true }
  return { text, remove: false }
}

function locate(content: string, hunk: Hunk): number | undefined {
  const positions: number[] = []
  let offset = content.indexOf(hunk.after)
  while (offset !== -1) {
    positions.push(offset)
    offset = content.indexOf(hunk.after, offset + hunk.after.length)
  }
  if (positions.length === 0) return undefined
  if (positions.length === 1) return positions[0]
  return positions.find((position) => lineAt(content, position) === hunk.newStart - 1)
}

const lineAt = (content: string, position: number) => {
  let line = 0
  for (let index = 0; index < position; index++) if (content.charCodeAt(index) === 10) line++
  return line
}
