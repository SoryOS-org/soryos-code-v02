import * as vscode from "vscode"
import { locate } from "./patch"
import { openReviewDiff } from "./diff"
import type { ChangeRef, ReviewStore } from "./store"

/** Uniquely identifies one change: tool call plus change index within the call. */
export type Target = { readonly path: string; readonly partID: string; readonly index: number }

const pendingDecoration = vscode.window.createTextEditorDecorationType({
  isWholeLine: true,
  backgroundColor: new vscode.ThemeColor("merge.currentContentBackground"),
  overviewRulerColor: new vscode.ThemeColor("editorInfo.foreground"),
  overviewRulerLane: vscode.OverviewRulerLane.Left,
})

export function registerReviewUI(context: vscode.ExtensionContext, store: ReviewStore) {
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
  const sessionStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 101)
  status.command = "opencode.review.showChanges"
  sessionStatus.command = "opencode.review.selectSession"
  context.subscriptions.push(status, sessionStatus, pendingDecoration)

  const fileDecoration = new (class implements vscode.FileDecorationProvider {
    readonly emitter = new vscode.EventEmitter<vscode.Uri>()
    readonly onDidChangeFileDecorations = this.emitter.event

    provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
      const pending = store.pendingFor(store.relative(uri.fsPath))
      if (pending.length === 0) return
      return {
        badge: "■",
        tooltip: `${pending.length} pending AI edit${pending.length === 1 ? "" : "s"} to keep or discard`,
      }
    }
  })()
  context.subscriptions.push(vscode.window.registerFileDecorationProvider(fileDecoration))

  const lenses = new (class implements vscode.CodeLensProvider {
    readonly emitter = new vscode.EventEmitter<void>()
    readonly onDidChangeCodeLenses = this.emitter.event

    provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
      const pending = store.pendingFor(store.relative(document.uri.fsPath))
      if (pending.length === 0) return []
      const result = pending.flatMap((ref) => {
        const range = regionRange(document, ref) ?? new vscode.Range(0, 0, 0, 0)
        const target = targetOf(ref)
        return [
          new vscode.CodeLens(range, {
            title: "$(check) Keep",
            command: "opencode.review.keep",
            arguments: [target],
          }),
          new vscode.CodeLens(range, {
            title: "$(discard) Discard",
            command: "opencode.review.discard",
            arguments: [target],
          }),
        ]
      })
      return [
        new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
          title: `$(check-all) Keep All (${pending.length})`,
          command: "opencode.review.keepAll",
        }),
        new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
          title: "$(discard) Discard All",
          command: "opencode.review.discardAll",
        }),
        new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
          title: "$(git-compare) Review Diff",
          command: "opencode.review.openDiff",
        }),
        ...result,
      ]
    }
  })()
  context.subscriptions.push(vscode.languages.registerCodeLensProvider({ scheme: "file" }, lenses))
  context.subscriptions.push(vscode.languages.registerCodeLensProvider({ scheme: "opencode-review" }, lenses))

  const update = () => {
    const pending = store.pending()
    for (const editor of vscode.window.visibleTextEditors) {
      const refs = pending.filter((ref) => ref.change.file.file === store.relative(editor.document.uri.fsPath))
      editor.setDecorations(
        pendingDecoration,
        refs.flatMap((ref) => {
          const range = regionRange(editor.document, ref)
          return range ? [{ range, hoverMessage: hoverFor(ref) }] : []
        }),
      )
    }
    const count = pending.length
    status.text = count > 0 ? `$(git-compare) ${count} edit${count === 1 ? "" : "s"} to review` : "$(git-compare) Review"
    status.tooltip = count > 0 ? "OpenCode: keep or discard pending AI edits" : "OpenCode: no pending AI edits"
    const session = store.session()
    sessionStatus.text = `$(comment-discussion) ${session?.title?.slice(0, 24) || "opencode"}`
    sessionStatus.tooltip = "OpenCode: switch review session"
    status.show()
    sessionStatus.show()
    void vscode.commands.executeCommand("setContext", "opencode.review.pending", count)
    fileDecoration.emitter.fire(vscode.Uri.file("/"))
    lenses.emitter.fire()
  }

  context.subscriptions.push(store.onDidChange.on(update), vscode.window.onDidChangeActiveTextEditor(update))
  update()
  return { update }
}

export function targetOf(ref: ChangeRef): Target {
  return { path: ref.change.file.file, partID: ref.call.partID, index: ref.change.index }
}

/** Start line of a change region in the document, following the region text as it is now. */
export function regionRange(document: vscode.TextDocument, ref: ChangeRef): vscode.Range | undefined {
  const text = document.getText()
  const offset = ref.change.hunk ? locate(text, ref.change.hunk) : 0
  if (offset === undefined) return
  const start = document.positionAt(offset)
  return new vscode.Range(start, start)
}

function hoverFor(ref: ChangeRef): vscode.MarkdownString {
  const preview = ref.change.hunk
    ? [...ref.change.hunk.before.split("\n").map((line) => `-${line}`), ...ref.change.hunk.after.split("\n").map((line) => `+${line}`)].join(
        "\n",
      )
    : ref.change.file.status
  const markdown = new vscode.MarkdownString()
  markdown.isTrusted = { enabledCommands: ["opencode.review.keep", "opencode.review.discard"] }
  markdown.appendMarkdown(`**AI edit** · ${ref.change.file.file}\n\n`)
  markdown.appendCodeblock(preview, "diff")
  markdown.appendMarkdown(
    `[Keep](command:opencode.review.keep?${encodeURIComponent(JSON.stringify(targetOf(ref)))}) · ` +
      `[Discard](command:opencode.review.discard?${encodeURIComponent(JSON.stringify(targetOf(ref)))})`,
  )
  return markdown
}

/** The pending change at the cursor, or the nearest one in the document. */
export function changeAt(store: ReviewStore, editor: vscode.TextEditor): ChangeRef | undefined {
  const pending = store
    .pendingFor(store.relative(editor.document.uri.fsPath))
    .map((ref) => ({ ref, range: regionRange(editor.document, ref) }))
    .filter((item): item is { ref: ChangeRef; range: vscode.Range } => item.range !== undefined)
  if (pending.length === 0) return
  const line = editor.selection.active.line
  return (
    pending.find((item) => item.range.start.line <= line && line <= item.range.start.line + 8)?.ref ??
    [...pending].sort((a, b) => Math.abs(a.range.start.line - line) - Math.abs(b.range.start.line - line))[0]?.ref
  )
}

/** Moves the cursor to the next or previous pending change, wrapping within the file. */
export function revealChange(store: ReviewStore, editor: vscode.TextEditor, direction: 1 | -1) {
  const pending = store
    .pendingFor(store.relative(editor.document.uri.fsPath))
    .map((ref) => ({ ref, range: regionRange(editor.document, ref) }))
    .filter((item): item is { ref: ChangeRef; range: vscode.Range } => item.range !== undefined)
    .sort((a, b) => a.range.start.line - b.range.start.line)
  if (pending.length === 0) return
  const line = editor.selection.active.line
  const next =
    direction === 1
      ? pending.find((item) => item.range.start.line > line) ?? pending[0]
      : [...pending].reverse().find((item) => item.range.start.line < line) ?? pending[pending.length - 1]
  if (!next) return
  editor.selection = new vscode.Selection(next.range.start, next.range.start)
  editor.revealRange(next.range, vscode.TextEditorRevealType.InCenter)
}

export async function showChanges(store: ReviewStore) {
  const pending = store.pending()
  if (pending.length === 0) {
    void vscode.window.showInformationMessage("No AI edits to review")
    return
  }
  const picked = await vscode.window.showQuickPick(
    pending.map((ref) => ({
      label: `${ref.change.file.file}`,
      description: changeLabel(ref),
      ref,
    })),
    { placeHolder: "Keep or discard a change, or open its file diff" },
  )
  if (!picked) return
  await openReviewDiff(store, picked.ref.change.file.file)
}

function changeLabel(ref: ChangeRef) {
  const added = ref.change.hunk ? ref.change.hunk.after.split("\n").length : 0
  const removed = ref.change.hunk ? ref.change.hunk.before.split("\n").length : 0
  return `+${added} -${removed}`
}
