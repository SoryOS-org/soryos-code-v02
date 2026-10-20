# opencode VS Code Extension

A Visual Studio Code extension that integrates [opencode](https://opencode.ai) directly into your development workflow.

## Prerequisites

This extension requires the [opencode CLI](https://opencode.ai) to be installed on your system. Visit [opencode.ai](https://opencode.ai) for installation instructions.

## Features

- **Quick Launch**: Use `Cmd+Esc` (Mac) or `Ctrl+Esc` (Windows/Linux) to open opencode in a split terminal view, or focus an existing terminal session if one is already running.
- **New Session**: Use `Cmd+Shift+Esc` (Mac) or `Ctrl+Shift+Esc` (Windows/Linux) to start a new opencode terminal session, even if one is already open. You can also click the opencode button in the UI.
- **Context Awareness**: Automatically share your current selection or tab with opencode.
- **File Reference Shortcuts**: Use `Cmd+Option+K` (Mac) or `Alt+Ctrl+K` (Linux/Windows) to insert file references. For example, `@File#L37-42`.

## Reviewing agent edits

When an opencode session running in the terminal edits files, the extension surfaces each edit in the editor for review. Edits stay applied on disk; **Keep** acknowledges an edit and **Discard** reverts just that change.

- **Inline controls**: changed regions get a highlight with a hover showing the diff and Keep/Discard links, plus `Keep` / `Discard` code lenses on every pending change.
- **Review diff**: `opencode: Review AI Edits in Diff` opens a diff of a file's pending changes against their pre-edit state. The diff opens automatically when a turn finishes (disable with `opencode.review.autoOpen`).
- **Keyboard**: `Ctrl+Alt+Enter` keeps the change at the cursor, `Ctrl+Alt+Backspace` discards it, `Ctrl+Alt+Down` / `Ctrl+Alt+Up` move between changes, `Ctrl+Alt+Shift+Enter` keeps all pending edits. `opencode: Discard All AI Edits` reverts every pending edit after confirmation.
- **State**: files with pending edits show a `■` badge in the Explorer and tabs, and the status bar shows the pending count. The state survives restarts: it lives in the session, not the editor.
- **Checkpoints**: `opencode: Restore Checkpoint` reverts files to the state before a chosen request (the conversation is untouched) and offers `Restore to latest` to undo the restore.

The status bar also carries the reviewed session; `opencode: Switch Review Session` moves the review surface to another opencode session.

## Support

This is an early release. If you encounter issues or have feedback, please create an issue at https://github.com/anomalyco/opencode/issues.

## Development

1. `code sdks/vscode` - Open the `sdks/vscode` directory in VS Code. **Do not open from repo root.**
2. `bun install` - Run inside the `sdks/vscode` directory.
3. Press `F5` to start debugging - This launches a new VS Code window with the extension loaded.

#### Making Changes

`tsc` and `esbuild` watchers run automatically during debugging (visible in the Terminal tab). Changes to the extension are automatically rebuilt in the background.

To test your changes:

1. In the debug VS Code window, press `Cmd+Shift+P`
2. Search for `Developer: Reload Window`
3. Reload to see your changes without restarting the debug session
