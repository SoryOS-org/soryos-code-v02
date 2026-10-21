# Tool argument recovery benchmark

From `packages/core`, run:

```sh
bun script/benchmark-tool-repair.mjs
```

Requires Bun 1.4.2, installed workspace dependencies, and Git history containing the revisions below. This downloads pinned official GitHub and Cloudflare OpenAPI specifications (40MB total, once), verifies SHA256 hashes, and installs pinned Ajv 8.17.1 in a temporary cache outside the repository. It creates detached cached worktrees for the exact historical parent, original feature PR, and latest baseline, installs each revision's frozen lockfile with lifecycle scripts disabled, and executes the same fixture through each revision's real tool registry, repair plugin (when present), and original schema validator. The working tree is tested through that same pipeline. Only inert capture/echo tools execute: no API service, model, or application configuration is used. The generated test file is removed afterward. Individual versions can be selected as arguments: `parent historical baseline current`; `--hooks-only` skips worktree setup and runs isolated diagnostics only.

The script takes every published object request example accepted by the independent schema validator. It then individually stringifies numeric/boolean values and JSON containers or unwraps singleton arrays, retaining only variants rejected by the original schema. Credit requires exact recovery of the original typed value and schema acceptance. Valid arguments must preserve identity/value. Exclusions, hashes, per-case outcomes and unweighted per-operation means are written to the cache. The corpus is deduplicated before saving; no large dataset is committed.

The corpus and perturbation rules were frozen before implementation. GitHub was the development family; Cloudflare remained held out until implementation selection. This measures coverage of representation errors, not their production frequency or overall agent success.

| Implementation                 |    GitHub | Cloudflare | Total exact recovery |
| ------------------------------ | --------: | ---------: | -------------------: |
| Before #45002 (`219ecada6819`) |   0/1,005 |      0/378 |              0/1,383 |
| #45002 (`437cdc03a92d`)        | 908/1,005 |    231/378 |          1,139/1,383 |
| Latest baseline (`79fd806343`) | 908/1,005 |    231/378 |          1,139/1,383 |
| Composed object repair         | 969/1,005 |    367/378 |          1,336/1,383 |

These are actual execution-pipeline scores: 197 additional exact recoveries across 37 operations, 82.36% to 96.60%, with residual failures reduced from 244 to 47 (80.74%). No previously exact executions regress, and no new incorrect executions occur. The baseline's nine incorrect malformed executions decrease to one; the remaining pre-existing case is `repos/update-information-about-pages-site`, whose stringified `source` reaches the executor without repair. All 460 independently valid examples remain in the denominator: 457 execute unchanged in every version; three are rejected by every version's original schema validator (`gists/update:deleteFile` and two `security-advisories/create-repository-advisory` examples). The benchmark reports rather than masks these validator incompatibilities. Ninety-one examples excluded before the corpus freeze are logged with reasons.

Alternative implementations were evaluated on GitHub: disjoint `allOf` projection alone had no gain; routing only to one structural candidate gained recoveries but regressed eight examples; consensus across plausible `anyOf` branches avoided those regressions. Safety restrictions require unique structural selection for `oneOf` and disable unknown-field/placeholder deletion inside composed projections.

The separate isolated-hook diagnostics use Ajv as the scorer and adapt historical imports/tool lookup to today's dependencies without changing the repair implementation. They score 0 → 1,163 → 1,360 exact recoveries, with zero wrong Ajv-accepted values and all 460 valid inputs preserving identity/value. Those are diagnostic coverage numbers, not the real execution scores above. Actual historical runs use each revision's own imports and locked dependencies, and verify that the pre-feature checkout has no repair plugin. The original tool validator remains authoritative; focused integration tests check bounds and invalid discriminator/placeholder rejection. Per-case pipeline results are saved in `pipeline-results.json`; isolated results in `results.json` under the printed temporary cache path.

Sources:

- [GitHub REST API description](https://github.com/github/rest-api-description/tree/755ee33b4a81d51f6f07a902cce26cbec3b822f2), MIT, `descriptions/api.github.com/api.github.com.json`.
- [Cloudflare API schemas](https://github.com/cloudflare/api-schemas/tree/880ff24a8d487f05651f6dc24f482b9845127c7f), BSD-3-Clause, `openapi.json`.

The source hashes and immutable download URLs are embedded in the script. The script preserves schema constraints and does not add an implementation-specific success heuristic.

`benchmark-tool-repair.results.json` records the measured aggregates, every improved operation's count, unchanged valid-input exclusions, and the proposed source hash. Its current revision identifies the base checkout with the proposed source applied; the source hash identifies the measured implementation.
