@AGENTS.md

# anti-vibe (fork of opencode)

Everything above is upstream opencode's `AGENTS.md`, and it still applies. Leave upstream files (`AGENTS.md`, nested `packages/*/AGENTS.md`, `.opencode/`) unedited so upstream merges stay clean. Fork-specific guidance goes here.

## Mission

anti-vibe is opencode reworked into a coding agent that teaches. The upstream agent optimizes for "done with the least human involvement." This fork optimizes for the human understanding what was done. Its stance: in a world where AI writes the code, people need to get better at reading it.

Target behavior of the shipped agent (not built yet; this is the direction of the work):

- Act like a senior developer pairing with a junior one. Assume the user can already program. Do not explain what a variable or a loop is.
- Check for understanding: ask the user to predict, explain, or choose before acting on non-trivial changes, and point them to the code they should read.
- Prefer showing the relevant code and the reasoning over silently producing large diffs.
- Do not use dark patterns: no manufactured urgency, no flattery, no padding that keeps the user dependent.

The behavior spec is `.claude/skills/mentor/SKILL.md` (also a user-invoked `/mentor` skill). The planned work, with decisions already made, is `specs/mentor/issues.md`.

When you work *on* this repo, you are a normal coding agent: the mentoring behavior is the product, not how you should talk to the maintainer.

## Where the agent's behavior lives

Most fork work touches these seams. Read them before changing behavior.

| Concern | Path |
| --- | --- |
| Base system prompt | `packages/core/src/session/runner/prompt/system.txt`, rendered with tool guidance by `packages/core/src/session/system-prompt.ts` |
| Per-model prompt overlays | `packages/core/src/plugin/system-prompt/*.txt`, selected in `packages/core/src/plugin/optimize.ts` |
| Built-in agents (Build, General, Explore, Compaction, Title, Summary) | `packages/core/src/plugin/agent.ts`; Plan agent in `packages/core/src/plugin/plan.ts` |
| Agent service and schema | `packages/core/src/agent.ts`, `packages/schema/src/agent.ts` |
| Asking the user questions | `packages/core/src/tool/plugin/question.ts` |
| Tool registry and built-in tools | `packages/core/src/tool.ts`, `packages/core/src/tool/plugin/` (read `packages/core/src/tool/AGENTS.md` first) |
| Permissions | `packages/core/src/permission.ts` |
| Built-in slash command prompts | `packages/core/src/plugin/command/*.txt` |
| Skills | `packages/core/src/skill/`, `packages/core/src/plugin/skill.ts` |
| Instruction files the agent loads (`AGENTS.md`, not `CLAUDE.md`) | `packages/core/src/instruction-discovery.ts`, `packages/core/src/tool/plugin/read.ts` |
| Session loop | `packages/core/src/session/` (see "Session Core" above) |
| Terminal UI | `packages/tui/`, CLI entry `packages/cli/src/index.ts` |

Package roles in one line each: `schema` holds wire contracts, `core` the agent runtime, `ai` the LLM provider layer, `protocol`/`server` the HTTP API, `client` the generated SDK, `cli`/`tui` the terminal app, `app`/`desktop`/`ui`/`session-ui`/`gui-extensions` the web and desktop GUI.

## Saving context

Search is pre-filtered by the root `.ignore` file (ripgrep honors it, so Grep/Glob here and opencode's own search do too). Excluded paths are still readable by explicit path. Do not open them unless the task is about them:

- **Out-of-scope products**: `packages/console` (46 MB SaaS console, mostly video), `packages/web` and `services/www` (docs and marketing sites, about 600 `.mdx` files), `packages/stats`, `packages/posts`, `infra/`, `salesforce/`, `sst.config.ts`. They depend only on `@opencode/ui`, so core changes cannot break them silently.
- **Generated**: `packages/client/src/*/generated/` (regenerate, never edit), `*/openapi.json`, `packages/core/src/models-dev/snapshot.txt` (6 MB), `*.gen.ts`, migration `snapshot.json`.
- **Fixtures**: `packages/ai/test/fixtures/recordings/` holds HTTP cassettes up to 1.3 MB each. Read one only when debugging that exact cassette.
- **Translations**: non-English `i18n/*.ts`, localized docs, and `README.*.md`. Feature work edits English source only (see `packages/ui/AGENTS.md`).
- **Binary assets**: fonts, icons, video, audio, and screenshots.

Other habits that save tokens:

- Read the nearest nested `AGENTS.md` before working in a package (`packages/app`, `ai`, `schema`, `gui-extensions`, `tui`, `ui`, `session-ui`, `desktop`, `codemode`, `plugin`, `cli`).
- Read only the `.opencode/skills/*` skill that matches the test type you are writing. They are long and precise.
- Prefer `bun typecheck` in one package over `bun run check` while iterating; run `bun run check` once at the end.

## Tests for fork features

Every behavior change the fork makes ships with a test that fails without the change. Follow the upstream Testing rules above and the matching `.opencode/skills` skill. On top of that:

- **Prompt and agent changes**: assert on the rendered output, like `packages/core/test/session-system-prompt.test.ts` does for `SessionSystemPrompt.make`. Pin the instruction the fork depends on, not the whole prompt text.
- **Behavior across a session** (for example "the agent asks a question before editing"): write a feature test that drives a real session against a recorded or scripted model. `packages/core/test/session-runner-recorded.test.ts` shows the cassette pattern using `@opencode/http-recorder`. Assert on durable session events or tool calls, not on model prose.
- **TUI-visible behavior**: a renderer test in `packages/tui/test` (`tui-tests` skill), plus a story when the user asks for one (see "TUI Stories" above).
- If a feature cannot reasonably get a feature-level test, say so and explain why, then cover the units underneath it. Do not skip tests silently.
- Run tests from the package directory, for example `cd packages/core && bun test test/session-system-prompt.test.ts`.

## Fork workflow

- `origin` is the fork (`ashwaghd/anti-vibe`). Upstream is `anomalyco/opencode`; add it as a remote named `upstream` when syncing.
- Keep fork changes in fork-owned files where practical (new prompt files, new agents, new plugins) rather than rewriting upstream files in place. This keeps upstream merges small.
- Upstream release tooling (`CHANGELOG.md`, `STATS.md`, `script/` release scripts, `.github/workflows`) is upstream's. Do not touch it unless the task is about releasing the fork.
