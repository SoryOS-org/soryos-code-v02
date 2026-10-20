import * as vscode from "vscode"
import type { ReviewStore } from "./store"

/**
 * Cursor-style checkpoint restore: files go back to the state before the picked
 * request while the conversation stays intact, and the revert stays undoable
 * until the next prompt commits it.
 */
export async function restoreCheckpoint(store: ReviewStore) {
  const requests = await store.requests()
  if (requests.length === 0) {
    void vscode.window.showInformationMessage("No checkpoints in this session yet")
    return
  }
  const picked = await vscode.window.showQuickPick(
    requests.map((request) => ({
      label: request.text.trim().slice(0, 80) || "(empty prompt)",
      description: "checkpoint",
      id: request.id,
    })),
    { placeHolder: "Discard all changes up to which request?" },
  )
  if (!picked) return
  const choice = await vscode.window.showWarningMessage(
    "Discard all changes up to this checkpoint?",
    { modal: true, detail: "You can always undo this later." },
    "Continue",
  )
  if (choice !== "Continue") return
  await store.restoreCheckpoint(picked.id)
  const undo = await vscode.window.showInformationMessage("Files restored to checkpoint", "Restore to latest")
  if (undo === "Restore to latest") await store.restoreLatest()
}

export async function restoreLatest(store: ReviewStore) {
  await store.restoreLatest()
  void vscode.window.showInformationMessage("Restored edits to the latest state")
}
