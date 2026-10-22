# Mentor mode: issue backlog

Each section below is one GitHub issue, already written in the layout of `.github/ISSUE_TEMPLATE/anti-vibe-task.yml`. IDs (`M0`, `M1`, ...) stand in for issue numbers until the issues exist. Replace them with `#n` once they are filed.

The behavior spec for the whole feature is `.claude/skills/mentor/SKILL.md`. It doubles as a `/mentor` skill in Claude Code, so you can try the flow by hand today.

## Decisions already made

- New tools live in core, in fork-owned files. Each one asks the user through the existing `Form.ask` pipeline with its own `metadata.kind`.
- The TUI picks a fork-owned renderer by `metadata.kind`. Unknown kinds use the existing form renderer.
- Every mentor form *also* encodes itself as standard form fields. Web, desktop, and mini mode get a plain but working fallback for free, with no work in those clients.
- Core grades answers that have a key (quiz, fill-in-the-blank). The TUI reveals the correct answer and an explanation after the user submits.
- There is an escape hatch. It must be **user-initiated**: the model can never unlock itself.
- Edits are gated: the Mentor agent cannot edit files until a Decide round is answered or the user skips.

## Tracks

Three people can work in parallel once `M0` and `M2` land.

```
M0 setup ──┬─ Track A: M1 agent ──────────────── M9 gate ── M10 e2e test
           └─ M2 contract ─┬─ Track B: M3 TUI dispatch ── M4 quiz, M5 fill_blank
                           └─ Track C: M6 code_ref, M7 choose_code (core) ── M8 choose_code (TUI)
```

`M9` needs `M7` (choose_code unlocks the gate). `M10` needs everything.

---

## M0 `chore: fork setup for collaborators`

**Summary**: Make the fork safe and runnable for everyone before feature work starts.

**Area**: chore / setup. **Depends on**: none.

**Where to start**: `CONTRIBUTING.md` ("Development"). Actions do not run on the fork, so upstream's issue and PR bots in `.github/workflows/` are inert. If Actions are ever enabled, disable `triage.yml`, `compliance-close.yml`, `close-issues.yml`, `close-prs.yml`, and `pr-standards.yml` first: they are not limited to upstream's repo and would close our issues and PRs.

**Acceptance criteria**
- [ ] An `upstream` remote is documented: `git remote add upstream https://github.com/anomalyco/opencode`.
- [ ] Each collaborator can run `bun install && bun dev .`.
- [ ] Document running with a separate `OPENCODE_CONFIG_DIR` so the dev build does not take over an installed opencode's background service.
- [ ] An `anti-vibe` label exists.

**Tests**: none; this is setup.

---

## M1 `feat(core): add Mentor agent`

**Summary**: Add a selectable Mentor agent whose prompt encodes the flow in the mentor skill (Scout, Orient, Zoom, Decide, Implement, Recap).

**Area**: core (agent / prompt). **Depends on**: M0.

**Where to start**
- `packages/core/src/plugin/agent.ts`: how built-in agents are defined.
- `packages/core/src/plugin/plan.ts`: the closest model. It is a separate plugin with its own prompt and permission tweaks.
- `.claude/skills/mentor/SKILL.md`: the source text for the prompt.

**Acceptance criteria**
- [ ] A new plugin in a fork-owned file (e.g. `packages/core/src/plugin/mentor.ts` + `mentor.txt`) registers a `mentor` agent.
- [ ] The agent shows up in the TUI agent switcher.
- [ ] The prompt covers the stages, the question style, and the escape hatch. Until the mentor widgets land, it uses the existing `question` tool.

**Tests**
- A unit test asserting the agent is registered with the mentor prompt.
- A rendered-prompt test (pattern: `packages/core/test/session-system-prompt.test.ts`) that pins the stage names and the escape-hatch rule.

**Out of scope**: the edit gate (M9) and the new widgets.

**Open questions**: Should Mentor become the default agent, or stay opt-in at first?

---

## M2 `feat(schema): mentor form contract`

**Summary**: Define the shared payload that mentor tools put on a form and that the TUI renders, plus the shared grading function.

**Area**: schema (contract). **Depends on**: M0.

**Where to start**: `packages/schema/src/form.ts` (`Info.metadata`, the field types) and `packages/schema/src/question.ts`.

**Acceptance criteria**
- [ ] A fork-owned `packages/schema/src/mentor.ts` defines tagged payloads for `quiz`, `fill_blank`, `code_ref`, and `choose_code`, carried in `Form.Info.metadata` under `kind`.
- [ ] Payloads that can be graded carry an answer key and a short explanation.
- [ ] There is a pure `grade(payload, answer)` function, used by core (authoritative, sent to the model) and by the TUI (for the reveal), so grading logic is not duplicated.
- [ ] Each payload documents its fallback mapping to standard fields (e.g. a quiz becomes a `string` field with options).
- [ ] Every mentor form includes a user-only "Skip, I've got this" choice, which the escape hatch in M9 relies on.

**Tests**: unit tests for `grade` (correct, wrong, and fill-in-the-blank normalization such as whitespace and case).

**Open questions**: Fill-in-the-blank matching: exact match, a list of accepted answers, or a regex?

---

## M3 `feat(tui): render mentor forms by kind, with answer reveal`

**Summary**: Route mentor forms to fork-owned components and show a reveal screen after the user submits.

**Area**: tui (widget). **Depends on**: M2.

**Where to start**
- `packages/tui/src/routes/session/form.tsx`: the current renderer.
- `packages/tui/src/mini/footer.form.tsx`: mini mode, which keeps the fallback.
- The "TUI Stories" and "TUI Theme Tokens" sections of `AGENTS.md`.

**Acceptance criteria**
- [ ] `form.tsx` dispatches on `metadata.kind` to components under `packages/tui/src/routes/session/mentor/`. Unknown kinds render exactly as today.
- [ ] After submission, the reveal shows correct or wrong, the right answer, and the explanation, then continues on a keypress.
- [ ] The stage label (`[Orient]`, `[Zoom]`, ...) is visible on the form.
- [ ] Colors use semantic theme tokens only (`text.feedback` for correct/wrong).

**Tests**: a renderer test in `packages/tui/test` (read the `tui-tests` skill first) covering dispatch, fallback, and the reveal. Add a storybook story for the reveal.

---

## M4 `feat(core,tui): quiz tool and widget`

**Summary**: A multiple-choice question with one right answer, graded in core and revealed in the TUI.

**Area**: core (tool), tui (widget). **Depends on**: M2, M3.

**Where to start**: `packages/core/src/tool/plugin/question.ts` (copy its structure) and `packages/core/src/tool/AGENTS.md`.

**Acceptance criteria**
- [ ] A `quiz` tool (fork-owned file) takes a question, 2 to 5 options, the correct option, and an explanation.
- [ ] The tool result sent to the model says what the user picked and whether it was right.
- [ ] The TUI widget lets the user pick with arrow keys or a number, then shows the reveal.
- [ ] The Mentor agent (M1) is allowed to use it, and its prompt mentions it.

**Tests**: unit tests for the tool's output (right, wrong, skipped) and a TUI renderer test for the widget.

---

## M5 `feat(core,tui): fill_blank tool and widget`

**Summary**: Show a short code snippet with a `___` gap. The user types the missing piece, which is graded against accepted answers.

**Area**: core (tool), tui (widget). **Depends on**: M2, M3.

**Acceptance criteria**
- [ ] A `fill_blank` tool takes a snippet with exactly one gap, the accepted answers, and an explanation.
- [ ] The snippet is syntax-highlighted, with the input box placed in the gap or directly below it.
- [ ] The reveal shows the completed snippet.

**Tests**: tool unit tests (accepted, rejected, normalized) and a TUI renderer test.

---

## M6 `feat(core,tui): code_ref for the Zoom stage`

**Summary**: Show real lines from a file next to a question about them.

**Area**: core (tool), tui (widget). **Depends on**: M2, M3.

**Acceptance criteria**
- [ ] The `code_ref` tool takes a path, a line range, and a question. **Core reads the lines from disk**, so the model cannot misquote code.
- [ ] A range over about 30 lines, or a path outside the project, is rejected with a clear tool error.
- [ ] The TUI shows `path:start-end` and the highlighted excerpt with line numbers, above the answer input.

**Tests**: a tool unit test with a temp file (reads the right lines, rejects bad ranges) and a TUI renderer test.

---

## M7 `feat(core): choose_code tool`

**Summary**: The Decide round. The model offers 2 to 4 candidate changes, the user picks one and writes a short defense, and the model gets back both.

**Area**: core (tool). **Depends on**: M2.

**Acceptance criteria**
- [ ] A `choose_code` tool takes 2 to 4 options (code, optional path, and a hidden "why this is weaker" note) plus which option is intended.
- [ ] The answer has two parts: the pick, and a required free-text defense.
- [ ] The tool result gives the model the pick, the defense, and whether the pick matched the intended option. The model responds to the defense; the tool does not judge it.
- [ ] A recorded Decide outcome is stored where M9 can read it.

**Tests**: tool unit tests (matched pick, unmatched pick, skip).

---

## M8 `feat(tui): choose_code widget`

**Summary**: Lay out 2 to 4 code blocks, let the user select one, then ask for the defense.

**Area**: tui (widget). **Depends on**: M3, M7 (the payload shape is enough to start).

**Acceptance criteria**
- [ ] Wide terminals show the options side by side. Narrow terminals stack them or show one at a time with tabs.
- [ ] Options are labeled A to D and selectable with arrow keys or letters. The selection is clearly marked using `formfield` tokens.
- [ ] After a pick, a defense input appears and is required to submit.
- [ ] The reveal shows the intended option, plus each other option's weakness note.

**Tests**: TUI renderer tests at a narrow and a wide size. Add a storybook story with keybindings for option count (2 to 4) and narrow vs. wide.

---

## M9 `feat(core): edit gate and escape hatch for Mentor`

**Summary**: The Mentor agent cannot edit files until a Decide round is answered or the user skips. Only the user can skip.

**Area**: core (permissions / gate). **Depends on**: M1, M7.

**Where to start**: `packages/core/src/plugin/plan.ts`. It already denies `edit` for the Plan agent and hooks `edit`/`write`/`patch` tool calls. Also `packages/core/src/permission.ts`.

**Acceptance criteria**
- [ ] With the Mentor agent, `edit`, `write`, and `patch` are denied with a model-facing message ("finish the Decide round first") until a `choose_code` round is answered.
- [ ] The gate unlocks for the current task when `choose_code` is answered, or when the user picks "Skip, I've got this" on any mentor form.
- [ ] A user-only `/handsoff` slash command unlocks edits for the rest of the session.
- [ ] The model has no tool or input that unlocks the gate itself.
- [ ] The gate re-locks when a new user prompt starts a new task.

**Tests**: a recorded or scripted session feature test (pattern: `packages/core/test/session-runner-recorded.test.ts`) asserting the tool calls and events: the edit is denied before Decide, allowed after Decide, and allowed after a skip.

**Open questions**: What counts as a "new task"? Every user prompt, or only prompts that are not answers to the agent?

---

## M10 `test(core): end-to-end Mentor flow`

**Summary**: One feature test that drives a whole Mentor session through Orient, Zoom, Decide, and Implement, plus one that drives the skip path.

**Area**: tests. **Depends on**: M1 to M9.

**Acceptance criteria**
- [ ] The happy path asserts the order of tool calls: a question or quiz, then `code_ref`, then `choose_code`, then `edit`.
- [ ] The skip path asserts that a skip leads straight to `edit` with no further mentor forms.
- [ ] The tests assert on events and tool calls, never on model prose.

---

## Later (not filed yet)

- A Recap card in the TUI at the end of a task.
- Remembering across sessions what the user already knows, to calibrate question difficulty.
- Rich widgets in the web and desktop apps (today they get the plain fallback).
