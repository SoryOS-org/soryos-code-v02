import * as vscode from "vscode"
import path from "node:path"
import { readFile } from "node:fs/promises"
import { revertChanges, type Change, type FileDiff } from "./patch"
import type { ReviewStore } from "./store"

export const SCHEME = "opencode-review"

/**
 * Original-side documents for review diffs: the file with its pending changes
 * reverted, so the diff shows exactly what Keep or Discard would decide.
 */
export class ReviewContentProvider implements vscode.TextDocumentContentProvider {
  constructor(private readonly store: ReviewStore) {}

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const session = this.store.session()
    if (!session) return ""
    const relative = uri.path.replace(/^\//, "")
    const absolute = path.join(session.directory, relative)
    const content = await readFile(absolute, "utf8").catch(() => "")
    // Revert each pending change independently so one drifted region cannot hide the rest.
    let text = content
    for (const item of group(this.store.pendingFor(relative))) {
      const reverted = revertChanges(text, [item])
      if (reverted && !reverted.remove) text = reverted.text
    }
    return text
  }
}

function group(pending: readonly { change: Change }[]): { entry: FileDiff; changes: Change[] }[] {
  const items = new Map<FileDiff, Change[]>()
  for (const { change } of pending) {
    const changes = items.get(change.file) ?? []
    changes.push(change)
    items.set(change.file, changes)
  }
  return [...items].map(([entry, changes]) => ({ entry, changes }))
}

/** Opens the review diff for one file: pending changes on the left, the live file on the right. */
export async function openReviewDiff(store: ReviewStore, file: string) {
  const original = vscode.Uri.from({ scheme: SCHEME, path: `/${file}` })
  await vscode.commands.executeCommand(
    "vscode.diff",
    original,
    vscode.Uri.file(path.join(store.session()?.directory ?? "", file)),
    `Review: ${file}`,
  )
}
