/**
 * Unified-diff hunk parsing and reversal for review changes.
 *
 * Mirrors `packages/core/src/session/review.ts`, which owns the same change-index
 * contract over a tool call's `metadata.files`. shortcut: duplicated because
 * sdks/vscode is a standalone package with no workspace dependencies, merge into a
 * shared published package if the two ever drift.
 */

export interface Hunk {
  /** Exact old-side region text, including line terminators except at a no-newline end. */
  readonly before: string
  /** Exact new-side region text as the call left it. */
  readonly after: string
  /** 1-based line where the region starts in the file as the call left it. */
  readonly newStart: number
}

export interface FileDiff {
  readonly file: string
  readonly patch: string
  readonly status: "added" | "deleted" | "modified"
}

export interface Change {
  readonly index: number
  readonly file: FileDiff
  /** Undefined for an existence-only change: an empty created or deleted file. */
  readonly hunk: Hunk | undefined
}

/**
 * One reviewable change per unified-diff hunk, in `metadata.files` order. A file entry
 * without hunks (empty created or deleted file) is one existence change.
 */
export function fileChanges(files: readonly FileDiff[]): Change[] {
  const changes = files.flatMap((file) => {
    const hunks = parseHunks(file.patch)
    return (hunks.length > 0 ? hunks : [undefined]).map((hunk) => ({ file, hunk }))
  })
  return changes.map((change, index) => ({ ...change, index }))
}

/**
 * Parses hunks from the unified patches `fileDiff` records. Line bodies keep their exact
 * bytes: a CRLF file's lines carry `\r`, joined back with `\n`.
 */
export function parseHunks(patch: string): Hunk[] {
  const result: Hunk[] = []
  let current: { newStart: number; before: string[]; after: string[]; last: "before" | "after" | "both" } | undefined
  for (const line of patch.split("\n")) {
    const header = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
    if (header) {
      if (current)
        result.push({ before: current.before.join(""), after: current.after.join(""), newStart: current.newStart })
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

function stripNewline(lines: string[]) {
  const index = lines.length - 1
  if (index >= 0) lines[index] = lines[index].slice(0, -1)
}

export interface Reverted {
  readonly text: string
  readonly remove: boolean
}

/**
 * Rewinds the selected changes in `content`, leaving unselected (kept) changes applied.
 * Returns undefined when the file drifted away from the call's recorded regions.
 */
export function revertChanges(
  content: string | undefined,
  items: readonly { entry: FileDiff; changes: readonly Change[] }[],
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

/** Start offset of a change region in current content, or undefined when it drifted. */
export function locate(content: string, hunk: Hunk): number | undefined {
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

function lineAt(content: string, position: number) {
  let line = 0
  for (let index = 0; index < position; index++) if (content.charCodeAt(index) === 10) line++
  return line
}
