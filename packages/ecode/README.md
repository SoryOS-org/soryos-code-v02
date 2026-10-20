# ecode

ecode ("everyday code") is a multi-harness coding CLI built from the OpenCode TUI and runtime.

## Start

The native executable is installed on the local `PATH`:

```bash
ecode
```

No `npx` prefix is required. The command opens the ecode TUI in the current directory.

## Choose a coding harness

Open the model picker with `/models` or the configured model shortcut. The first section contains:

- **Router** — chooses a harness from the prompt's complexity.
- **OpenCode CLI** — sends the task to the locally installed `opencode` executable.
- **Codex CLI** — sends the task directly to `codex exec`.
- **Claude Code** — sends the task directly to `claude -p`.
- **ecode engine** — uses a provider-backed model inside the native ecode agent loop.

The current deterministic Router sends short explanatory prompts to the local OpenCode CLI, implementation and debugging prompts to Claude Code, and long or architecture, migration, security, or cross-codebase prompts to Codex. Local-harness sessions do not require an ecode provider model or API key. This classifier is intentionally isolated so it can later be replaced by a small-model router.

All three harnesses use their native CLI authentication. Authenticate those CLIs before selecting them in ecode. The optional **ecode engine** choice is the only route that requires a provider integration or API credential.

## Rebuild and install

From the repository root:

```bash
npx --yes bun@1.4.2 run packages/cli/script/build.ts \
  --single \
  --skip-install \
  --skip-web-ui \
  --outdir=dist-ecode

cp packages/cli/dist-ecode/cli-darwin-arm64/bin/opencode ~/.local/bin/ecode
chmod 755 ~/.local/bin/ecode
codesign --force --sign - --timestamp=none ~/.local/bin/ecode
```

The source-level runner is also available from the repository root with `npx --yes bun@1.4.2 run ecode`.
