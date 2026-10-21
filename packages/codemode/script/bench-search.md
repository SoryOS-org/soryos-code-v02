# Tool search retrieval benchmark

Code Mode search should put useful tools near the beginning of its first page. This benchmark measures ranking, independently of tool execution or an agent's eventual task completion. It imports the actual `tool-runtime.ts`, including catalog preparation, search input/output validation, exact-path handling, and pagination.

## Reproduce

From `packages/codemode`, with the workspace's Bun dependencies installed:

```sh
uv run --with pyarrow==24.0.0 python script/prepare-search-benchmark.py --output /tmp/opencode-search-data
bun script/bench-search.ts --data /tmp/opencode-search-data/benchmark.json --split heldout --output /tmp/search-result.json
```

Alternatively, run the preparation script with a Python environment containing `pyarrow`. No account, API key, agent execution, network access after preparation, or embedding model is required. Preparation downloads public pinned ToolRet artifacts; the corpus is not vendored.

Use `--split development` for the development partition, or omit `--split` for all 371 tasks. `--track natural` uses the original unchanged user task instead of the frozen search query. Output contains per-task ranked IDs and per-source metrics, so regressions remain visible.

To compare another revision, pass `--runtime /path/to/checkout/packages/codemode/src/tool-runtime.ts`. Give that checkout access to the same installed `effect` dependency. For example, on Linux from `packages/codemode`:

```sh
git worktree add --detach /tmp/opencode-search-before a2cb1c4e7f
ln -s "$PWD/node_modules" /tmp/opencode-search-before/packages/codemode/node_modules
bun script/bench-search.ts --data /tmp/opencode-search-data/benchmark.json --split heldout --runtime /tmp/opencode-search-before/packages/codemode/src/tool-runtime.ts --output /tmp/search-before.json
```

The same procedure reproduces the historical quality check with parent `cbdd1f66da3a50e02d40a3198a6bc270d651327b` and PR merge `7f51fbd8787b192aa96fc7e522e5f4585a783aa5`.

## Data and protocol

[ToolRet](https://github.com/mangopy/tool-retrieval-benchmark) supplies previously published tasks and relevance labels, independently of OpenCode and this implementation. The full web-tool corpus contains 37,292 tools. This benchmark samples up to 20 tasks per web source by ascending SHA256(task ID), giving 371 tasks across all 19 web sources. SHA256(source) modulo 3 assigns entire sources to development (71 tasks, four sources) or heldout (300 tasks, 15 sources). These choices were frozen before comparing alternative implementations. Every relevant tool is present in the corpus. One empty original task is retained.

Pinned data revisions:

- `mangopy/ToolRet-Tools`: `e06c38c75612b6536bd959e08cdd345894aba6a7`
- `mangopy/ToolRet-Queries`: `b8c76ad3349ff17497b6bdb28bb5b8f61a0f6445`

The adapter preserves tool names, descriptions, parameter names, and parameter descriptions. Dataset IDs become unique namespaces to prevent same-name tool collisions. Parameter values are never executed; their scalar types do not affect ranking. The 37k-tool global catalog is deliberately broad and is larger than many individual MCP servers.

The primary track uses the frozen strings in `fixtures/tool-search-queries.json`. The local ChatGPT account's `gpt-6.1-sol`, medium reasoning, generated one query per task in batches of 30. It saw only task text and current Code Mode search guidance: no relevance labels, target-aware ToolRet instructions, tool catalog, or evaluation feedback. Generation made no tool calls. All 371 outputs were frozen before scoring, with no selection or retry based on retrieval results. The prompt asked for exactly one concise keyword query for the task's central tool capability, preserving the original language. This is a query-formulation simulation, not an end-to-end agent evaluation.

MRR@10 is the primary ranking metric. Recall@10 and NDCG@10 are controls; all relevance labels are binary. Multiple tools may be relevant. Multi-tool task recall is intentionally not the same as task completion. The scorer never knows which ranking algorithm it is evaluating.

`fixtures/tool-search-evidence.json` records unrounded aggregate metrics, every heldout source's before/after scores, confidence intervals, and all twelve resource samples. Bootstrap intervals use 5,000 paired resamples with seed 20261021, either resampling tasks or resampling source-mean differences.

## Historical quality check

[OpenCode #50275](https://github.com/anomalyco/opencode/pull/50275) added whole-word tool-path matches to improve discovery ranking. On all 371 frozen search queries:

| Revision                  |   MRR@10 | Recall@10 |  NDCG@10 |
| ------------------------- | -------: | --------: | -------: |
| Parent `cbdd1f66da`       | 0.205993 |  0.274913 | 0.191732 |
| Inspiring PR `7f51fbd878` | 0.241167 |  0.275324 | 0.211398 |

Paired task bootstrap 95% confidence interval for the MRR difference: +0.01725 to +0.05404. Recall is effectively unchanged; the demonstrated historical gain is ordering, not broader coverage. Heldout MRR improves from 0.224403 to 0.255026, while heldout recall decreases slightly from 0.304976 to 0.301762.

An earlier, unchanged-natural-task track failed this historical check: on heldout tasks MRR decreases from 0.062452 to 0.056151, and recall from 0.093889 to 0.082889. The development natural track also regresses. Those results are retained; they motivated a separately frozen track representing actual keyword search calls. They are not evidence for the inspiring PR.

## Implementation comparison

All alternatives were compared only on the 71 development tasks. The selection was frozen before evaluating the candidate on heldout sources. BM25 uses standard `k1=1.2`, `b=0.75`, weighted path/description/search-text term counts, and a small partial-substring fallback to preserve existing matching behavior.

| Development alternative              |   MRR@10 | Recall@10 |  NDCG@10 |
| ------------------------------------ | -------: | --------: | -------: |
| Latest fixed weights                 | 0.182607 |  0.163615 | 0.121275 |
| IDF-weighted existing matches        | 0.208518 |  0.203521 | 0.148256 |
| Query-term coverage first            | 0.202940 |  0.209390 | 0.141119 |
| BM25 without substring support       | 0.235949 |  0.183568 | 0.156015 |
| Selected BM25 with substring support | 0.235480 |  0.183568 | 0.155454 |

Final heldout results, 300 tasks from 15 unseen source domains:

| Revision            |   MRR@10 | Recall@10 |  NDCG@10 |
| ------------------- | -------: | --------: | -------: |
| Latest `a2cb1c4e7f` | 0.255026 |  0.301762 | 0.232727 |
| Candidate           | 0.342927 |  0.384143 | 0.307761 |

MRR improves 34.5% relatively. The paired task bootstrap 95% interval for its absolute change is +0.05684 to +0.12054; resampling entire source domains gives +0.04351 to +0.13252. Seventy-six tasks improve and 23 regress. Thirteen of fifteen heldout sources improve in MRR; TMDB and RotBench regress. All per-source/per-task results should be considered rather than only the aggregate. No claim is made that this improves every query or end-to-end agent success.

## Independent Cloudflare catalog check

A second, untouched evaluation uses all 3,514 unique operation summaries from Cloudflare's public API specification as short queries, over its complete 3,767-operation catalog. Queries are vendor-authored, not generated by a model. Tools sharing a summary are all labeled relevant. Tool names use OpenCode's operation-name conversion and descriptions come from the specification. This deliberately measures name/description retrieval only: schemas and parameter metadata are omitted. No candidate was tuned on this catalog.

```sh
bun script/prepare-cloudflare-search.ts --output /tmp/cloudflare-search.json
bun script/bench-search.ts --data /tmp/cloudflare-search.json --output /tmp/cloudflare-result.json
```

The preparer pins [cloudflare/api-schemas](https://github.com/cloudflare/api-schemas) revision `880ff24a8d487f05651f6dc24f482b9845127c7f` (BSD-3-Clause). The downloaded specification SHA256 is `f38352849426c3c46c7ea69a77b886f54d319f879696adcee35fc3ebd36f9439`; the preparer records the content hash in its output.

| Revision              |   MRR@10 | Recall@10 |  NDCG@10 |
| --------------------- | -------: | --------: | -------: |
| Inspiring PR parent   | 0.698335 |  0.876707 | 0.741239 |
| Inspiring PR / latest | 0.776270 |  0.915600 | 0.809523 |
| Candidate             | 0.870424 |  0.977352 | 0.896038 |

The inspiring PR passes this independent quality check as well. The candidate improves latest MRR by 12.1% relatively, on a catalog size closer to the original motivating Cloudflare evaluation. API summaries have high lexical overlap with their descriptions; this measures endpoint lookup, not arbitrary user requests.

## Resource tradeoff

Search caches weighted word counts per catalog entry. This costs memory and makes the first search slower; subsequent searches avoid repeated text processing. Empty queries retain alphabetical browsing without building the word cache.

```sh
bun script/bench-search-resources.ts --data /tmp/opencode-search-data/benchmark.json --size 3000
bun script/bench-search-resources.ts --data /tmp/opencode-search-data/benchmark.json --size 37292
```

The resource script accepts the same `--runtime` baseline override. It selects catalog entries and 40 distinct queries by fixed ID hashes. Cold time includes lazy search-index preparation. After a warm-up pass, it times the same varied queries and measures retained JS heap after GC relative to the prepared tool tree. It does not time repeatedly searching one cached query.

Medians of three fresh processes per configuration, alternating baseline/candidate order, Bun 1.4.2 on Linux, pinned to CPUs 38 and 41:

| Catalog      | Metric                 |    Latest |  Candidate |
| ------------ | ---------------------- | --------: | ---------: |
| 3,000 tools  | First search           |   31.6 ms |    56.1 ms |
| 3,000 tools  | Median warm query      |   6.98 ms |    5.00 ms |
| 3,000 tools  | Retained heap increase |  3.90 MiB |  10.81 MiB |
| 37,292 tools | First search           |  362.5 ms |   611.8 ms |
| 37,292 tools | Median warm query      |  106.5 ms |    85.2 ms |
| 37,292 tools | Retained heap increase | 39.46 MiB | 126.28 MiB |

Peak process RSS is approximately 195→202 MiB at 3k and 480→752 MiB at 37k, including the benchmark fixture and transient allocations. The retained-cache premium is about 6.9 MiB at 3k and 86.8 MiB at 37k. The host is shared, so timings are descriptive rather than a general performance claim. A first run overlapping package checks was retained separately and excluded from this table; the complete suite was rerun after checks finished. Retrieval quality, with these costs disclosed, is the proposed improvement.
