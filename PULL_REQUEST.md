### Issue for this PR

Closes #

### Type of change

- [ ] Bug fix
- [x] New feature
- [x] Refactor / code improvement
- [ ] Documentation

### What does this PR do?

Ports the GitHub integration (`opencode github install` and `opencode github run`) from v1 to v2.

- Adds `opencode github` CLI command with `install` and `run` subcommands.
- `github install` interactively prompts for a model (any provider from models.dev) and generates `.github/workflows/opencode.yml`, including the appropriate provider API key secret (supports `OPENCODE_API_KEY`).
- `github run` resolves a standalone/shared server, runs a prompt via the v2 non-interactive runner, performs permission checks and reactions, supports mock events (`--event`/`--token`), handles fork PRs, schedule/workflow_dispatch routing, and opens a PR when the working tree changes.
- Adds `@octokit/rest` to `packages/cli`.

### How did you verify your code works?

- `bun run typecheck:tsc` passes in `packages/cli`.
- `opencode github install` and `opencode github run --standalone` execute successfully (model execution blocked by free-tier guard in this environment).

### Screenshots / recordings

N/A

### Checklist

- [x] I have tested my changes locally
- [x] I have not included unrelated changes in this PR
