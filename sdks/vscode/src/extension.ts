// This method is called when your extension is deactivated
export function deactivate() {}

import * as vscode from "vscode"
import { ReviewStore } from "./review/store"
import { ReviewContentProvider, SCHEME, openReviewDiff } from "./review/diff"
import { changeAt, registerReviewUI, revealChange, showChanges } from "./review/ui"
import { restoreCheckpoint, restoreLatest } from "./review/checkpoint"
import type { Target } from "./review/ui"

const TERMINAL_NAME = "opencode"

export function activate(context: vscode.ExtensionContext) {
  const openNewTerminalDisposable = vscode.commands.registerCommand("opencode.openNewTerminal", async () => {
    await openTerminal()
  })

  const openTerminalDisposable = vscode.commands.registerCommand("opencode.openTerminal", async () => {
    // An opencode terminal already exists => focus it
    const existingTerminal = vscode.window.terminals.find((t) => t.name === TERMINAL_NAME)
    if (existingTerminal) {
      existingTerminal.show()
      return
    }

    await openTerminal()
  })

  let addFilepathDisposable = vscode.commands.registerCommand("opencode.addFilepathToTerminal", async () => {
    const fileRef = getActiveFile()
    if (!fileRef) {
      return
    }

    const terminal = vscode.window.activeTerminal
    if (!terminal) {
      return
    }

    if (terminal.name === TERMINAL_NAME) {
      terminal.sendText(fileRef, false)
      terminal.show()
    }
  })

  context.subscriptions.push(openNewTerminalDisposable, openTerminalDisposable, addFilepathDisposable)

  const store = new ReviewStore()
  context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(SCHEME, new ReviewContentProvider(store)))
  const ui = registerReviewUI(context, store)

  const decide = async (decision: "keep" | "discard", target?: Target) => {
    try {
      const editor = vscode.window.activeTextEditor
      const ref =
        target &&
        store
          .changes()
          .find((item) => item.call.partID === target.partID && item.change.index === target.index)
      const picked = ref ?? (editor ? changeAt(store, editor) : undefined)
      if (!picked) {
        void vscode.window.showInformationMessage("No pending AI edit at the cursor")
        return
      }
      if (decision === "discard") {
        const confirm = await vscode.window.showWarningMessage(
          "Discard this AI edit?",
          { modal: true, detail: "The change is reverted in the file. You can restore checkpoints later." },
          "Discard",
        )
        if (confirm !== "Discard") return
      }
      await store[decision](picked)
    } catch (error) {
      void vscode.window.showErrorMessage(error instanceof Error ? error.message : "Review failed")
    }
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("opencode.review.keep", (target?: Target) => decide("keep", target)),
    vscode.commands.registerCommand("opencode.review.discard", (target?: Target) => decide("discard", target)),
    vscode.commands.registerCommand("opencode.review.keepAll", () => store.keepAll().catch(showError)),
    vscode.commands.registerCommand("opencode.review.discardAll", async () => {
      const count = store.count()
      if (count === 0) return
      const confirm = await vscode.window.showWarningMessage(
        `Discard ${count} pending AI edit${count === 1 ? "" : "s"}?`,
        { modal: true, detail: "All pending changes are reverted in their files." },
        "Discard All",
      )
      if (confirm !== "Discard All") return
      await store.discardAll().catch(showError)
    }),
    vscode.commands.registerCommand("opencode.review.nextChange", () => {
      const editor = vscode.window.activeTextEditor
      if (editor) revealChange(store, editor, 1)
    }),
    vscode.commands.registerCommand("opencode.review.previousChange", () => {
      const editor = vscode.window.activeTextEditor
      if (editor) revealChange(store, editor, -1)
    }),
    vscode.commands.registerCommand("opencode.review.openDiff", async () => {
      const editor = vscode.window.activeTextEditor
      const pending = store.pending()
      const path =
        (editor && pending.find((ref) => ref.change.file.file === store.relative(editor.document.uri.fsPath))?.change.file
          .file) ?? pending[0]?.change.file.file
      if (path) await openReviewDiff(store, path)
    }),
    vscode.commands.registerCommand("opencode.review.showChanges", () => showChanges(store)),
    vscode.commands.registerCommand("opencode.review.selectSession", async () => {
      const picked = await vscode.window.showQuickPick(
        store.sessionList().map((session) => ({
          label: session.title?.slice(0, 40) || session.id,
          description: session.id === store.sessionID() ? "current" : undefined,
          id: session.id,
        })),
        { placeHolder: "Review changes for which session?" },
      )
      if (picked) {
        store.select(picked.id)
        ui.update()
      }
    }),
    vscode.commands.registerCommand("opencode.review.restoreCheckpoint", () =>
      restoreCheckpoint(store).catch(showError),
    ),
    vscode.commands.registerCommand("opencode.review.restoreLatest", () => restoreLatest(store).catch(showError)),
  )

  // The CLI runs the agent in its terminal; this extension follows the same session
  // over the service event stream and reconnects when the stream drops.
  const cancel = new AbortController()
  context.subscriptions.push({ dispose: () => cancel.abort() })
  void store.refresh().then(() => ui.update())
  void (async () => {
    while (!cancel.signal.aborted) {
      try {
        await store.events((event) => store.handle(event), cancel.signal)
      } catch {
        // fall through to the reconnect delay
      }
      if (cancel.signal.aborted) return
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
  })()
  context.subscriptions.push(
    store.onDidChange.on(() => ui.update()),
    store.onTurnEnd.on(() => {
      void autoOpenPending(store)
    }),
  )

  async function openTerminal() {
    // Create a new terminal in split screen
    const terminal = vscode.window.createTerminal({
      name: TERMINAL_NAME,
      iconPath: {
        light: vscode.Uri.file(context.asAbsolutePath("images/button-dark.svg")),
        dark: vscode.Uri.file(context.asAbsolutePath("images/button-light.svg")),
      },
      location: {
        viewColumn: vscode.ViewColumn.Beside,
        preserveFocus: false,
      },
      env: {
        OPENCODE_CALLER: "vscode",
      },
    })

    terminal.show()
    terminal.sendText("opencode")
  }

  function getActiveFile() {
    const activeEditor = vscode.window.activeTextEditor
    if (!activeEditor) {
      return
    }

    const document = activeEditor.document
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri)
    if (!workspaceFolder) {
      return
    }

    // Get the relative path from workspace root
    const relativePath = vscode.workspace.asRelativePath(document.uri)
    let filepathWithAt = `@${relativePath}`

    // Check if there's a selection and add line numbers
    const selection = activeEditor.selection
    if (!selection.isEmpty) {
      // Convert to 1-based line numbers
      const startLine = selection.start.line + 1
      const endLine = selection.end.line + 1

      if (startLine === endLine) {
        // Single line selection
        filepathWithAt += `#L${startLine}`
      } else {
        // Multi-line selection
        filepathWithAt += `#L${startLine}-${endLine}`
      }
    }

    return filepathWithAt
  }
}

/** Like Cursor, surface each round's edits in the editor as soon as the turn finishes. */
async function autoOpenPending(store: ReviewStore) {
  const config = vscode.workspace.getConfiguration("opencode.review")
  if (!config.get<boolean>("autoOpen", true)) return
  const files = [...new Set(store.pending().map((ref) => ref.change.file.file))].slice(0, 5)
  for (const file of files) await openReviewDiff(store, file)
}

function showError(error: unknown) {
  void vscode.window.showErrorMessage(error instanceof Error ? error.message : "Review failed")
}
