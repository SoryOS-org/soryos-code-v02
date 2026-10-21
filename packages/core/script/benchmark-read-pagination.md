# Text pagination benchmark

This benchmark measures the production `ReadToolFileSystem.read` API with the real local filesystem environment. It checks output against independently generated expected pages, then records elapsed time, aggregate process CPU time, and process peak RSS. It accepts arbitrary checkout paths, so implementations need not share an algorithm, index structure, or cache design.

## Reproduce

Run from the repository root with Bun and Git installed:

```sh
bun packages/core/script/benchmark-read-pagination.ts prepare /tmp/read-pagination-fixtures
READ_BENCH_SAMPLES=7 bun packages/core/script/benchmark-read-pagination.ts run \
  /tmp/read-pagination-fixtures /tmp/read-pagination-results.json \
  /path/to/baseline /path/to/candidate
```

Install each checkout's own dependencies first with `bun install --frozen-lockfile --ignore-scripts`. The runner dynamically imports production modules from each checkout, so the historical worktrees do not need a copy of the script. The historical/current Effect process import path is the only compatibility routing. No production sources are copied or rewritten.

For the inspiring improvement, [#42972](https://github.com/anomalyco/opencode/pull/42972):

```sh
git worktree add --detach /tmp/read-before-pr eb3c4c82feb32b330c9fbd326a195a9b94ad1432
git worktree add --detach /tmp/read-after-pr ea1ff90e42b5a36108d4c17c1743620c35ebfaa8
(cd /tmp/read-before-pr && bun install --frozen-lockfile --ignore-scripts)
(cd /tmp/read-after-pr && bun install --frozen-lockfile --ignore-scripts)
READ_BENCH_SAMPLES=3 bun packages/core/script/benchmark-read-pagination.ts run \
  /tmp/read-pagination-fixtures /tmp/read-pagination-quality.json \
  /tmp/read-before-pr /tmp/read-after-pr
```

Use `READ_BENCH_SCENARIOS=small-whole,small-page,source-shallow,source-deep,log-deep,log-eof` to select the six timing scenarios. Omit it to check all 14 scenarios. The original pre-PR implementation takes about 15 seconds per deep log read on the measured machine.

## Workload and measurement

- Small source: 1,000 TypeScript declarations, whole file and 125 lines at offset 500.
- Large source: 200,000 TypeScript declarations, 125 lines at offsets 1 and 180,000.
- Application log: 1,000,000 timestamped request records, 125 lines at offset 950,000 and an EOF page from offset 999,980.
- Unicode/CRLF: 12,000 lines with multibyte characters, reading across chunks and to EOF without a final newline.
- Long lines: a 700,000-character line, both selecting and skipping it.
- Errors and boundaries: out-of-range offset, and NUL bytes before, within, and after the requested page.

Fixture bytes, page requests, and expected results were fixed before changing production code. The expected-output generator uses the fixture's logical lines; it does not call the production reader. Whole-file/text-page output and typed errors are asserted. Historical out-of-range errors lack the subsequently added total-line count, so the cross-version scorer compares error type and offset; current unit tests and a separate differential audit verify current full error fields.

Each sample runs in a fresh worker. Small-file samples average 100 sequential reads; other samples measure one read. The runner alternates checkout order between samples. Timings exclude imports, fixture generation, and result assertions. RSS is the absolute process-lifetime peak, including the runtime/imports; it is not a retained-heap measurement. Inputs are read from the normal warm filesystem cache; this is not a cold-disk-throughput benchmark. CPU includes all process threads and can exceed elapsed time. There are no CI wall-clock thresholds.

The JSON output includes every sample, Bun/platform/CPU metadata, checkout commits, reader source hashes, and fixture manifest hash. A manifest hash includes absolute fixture paths, so it changes when the fixture directory changes even if file contents match.

## Quality check: the inspiring PR improves this benchmark

Measured on Linux x86-64, Intel Xeon Gold 6442Y, Bun 1.4.2. Medians of three fresh-process samples, using the actual historical parent and PR checkouts with their own locked dependencies:

| Scenario       | Pre-PR elapsed |   PR elapsed | Pre-PR peak RSS | PR peak RSS |
| -------------- | -------------: | -----------: | --------------: | ----------: |
| Small whole    |       0.722 ms |     0.752 ms |       111.2 MiB |   110.7 MiB |
| Small page     |       1.065 ms |     1.088 ms |       129.7 MiB |   129.7 MiB |
| Source shallow |      10.923 ms |    15.180 ms |        94.1 MiB |   103.3 MiB |
| Source deep    |     659.328 ms |   193.217 ms |       422.8 MiB |   134.3 MiB |
| Log deep       |  15,355.310 ms |   963.314 ms |      1373.6 MiB |   161.8 MiB |
| Log EOF        |  16,339.257 ms | 1,000.694 ms |      1648.7 MiB |   183.9 MiB |

The PR improves deep source reads 3.41x and deep log reads 15.94x. The unchanged small cases and worse shallow case are included rather than selecting only favorable results. All 14 expected-output/error scenarios passed both versions.

## Implementations explored

1. Native newline search, keeping the augmented rope: deep-log median 131.03 ms, peak RSS 147.1 MiB. This avoids byte-by-byte JavaScript scanning but retains every skipped chunk.
2. Native search with incremental prefix skipping: deep-log median 126.24 ms, peak RSS 112.2 MiB. This also removes the retained prefix and tree construction.
3. Prefix skipping with 1 MiB subsequent reads: deep-log median 102.68 ms, peak RSS 120.4 MiB. Rejected because a page crossing the initial chunk by a few bytes would cause four times the existing read size, and memory usage increased. The final implementation preserves 256 KiB reads.

Each exploratory variant used the same frozen inputs and scorer. The final paired baseline/candidate measurements are reported separately below. The change bounds retention of **skipped prefixes**; selecting a very long line still buffers that line until it can be paginated, as before. It does not add a persistent cache or change output, binary checks, read budgets, or chunk sizes.

## Final comparison

Latest baseline: `a2cb1c4e7f7dfff5de7a17b96a12e78b6799ebcb`. Medians of seven paired, alternating-order fresh-process samples:

| Scenario        | Before ms | After ms | Before CPU ms | After CPU ms | Peak RSS MiB, before → after |
| --------------- | --------: | -------: | ------------: | -----------: | ---------------------------: |
| Small whole     |     0.875 |    0.855 |         1.430 |        1.408 |                104.1 → 104.2 |
| Small page      |     1.765 |    0.907 |         2.695 |        1.611 |                122.4 → 104.4 |
| Source shallow  |    20.089 |    9.426 |        59.878 |       19.252 |                  93.1 → 84.2 |
| Source deep     |   157.448 |   33.871 |       238.371 |       71.509 |                 121.8 → 97.1 |
| Log deep        |   888.777 |  127.852 |      1019.241 |      237.492 |                156.1 → 112.8 |
| Log EOF         |   921.082 |  127.777 |      1102.783 |      248.377 |                176.2 → 112.6 |
| Unicode CRLF    |    28.917 |   17.262 |        77.937 |       38.810 |                 105.2 → 86.8 |
| Unicode EOF     |    28.671 |    9.400 |        81.778 |       19.033 |                 108.7 → 86.4 |
| Long line       |    55.832 |   14.155 |       130.984 |       36.736 |                 127.0 → 87.1 |
| Skip long line  |    39.826 |    8.662 |        95.416 |       14.643 |                 118.9 → 83.7 |
| Out of range    |    25.930 |   10.841 |        67.416 |       13.424 |                  98.3 → 88.0 |
| NUL before page |    22.229 |    7.294 |        67.397 |        9.174 |                  96.6 → 83.7 |
| NUL in page     |    23.823 |   12.245 |        65.840 |       22.862 |                  94.5 → 88.1 |
| NUL after page  |    21.224 |   16.370 |        65.096 |       43.030 |                  96.1 → 88.7 |

Deep-log elapsed time improves 6.95x, CPU 4.29x, and peak RSS 27.7%; EOF peak RSS improves 36.1%. The whole-small-file path is unchanged and shows little difference in this run. All 196 result assertions passed. This unrestricted run encountered unrelated shared-host load (load average reached 161 on 96 logical CPUs); every sample, including the slower early samples, is retained. A second complete run under identical CPU affinity for both versions checks sensitivity to scheduling.

## Additional validation after freezing the candidate

The following five cases were added after freezing production code, independently of the initial fixture suite. No production changes were made in response to their results. Three cases read actual checkout files; two stress newline density. Reproduce them using the same baseline checkout as the source of file bytes:

```sh
bun packages/core/script/benchmark-read-pagination-heldout.ts \
  /path/to/baseline /tmp/read-pagination-heldout
READ_BENCH_SAMPLES=3 bun packages/core/script/benchmark-read-pagination.ts run \
  /tmp/read-pagination-heldout /tmp/read-pagination-heldout-results.json \
  /path/to/baseline /path/to/candidate
```

Three-sample medians:

| Scenario                               | Before ms | After ms | Before CPU ms | After CPU ms | Peak RSS MiB, before → after |
| -------------------------------------- | --------: | -------: | ------------: | -----------: | ---------------------------: |
| Actual bun.lock                        |    35.153 |   11.491 |        84.180 |       30.245 |                 111.6 → 86.4 |
| Actual model snapshot, one 5.9 MB line |   291.840 |  120.943 |       455.969 |      154.003 |                230.4 → 199.7 |
| Actual TUI recording                   |    49.684 |   10.201 |       109.393 |       23.818 |                 125.4 → 85.8 |
| One million blank lines                |    39.291 |   45.280 |       101.408 |       95.233 |                 121.4 → 96.1 |
| One million single-character lines     |    48.770 |   38.089 |       107.203 |       81.831 |                 113.6 → 92.0 |

The blank-line stress case is a tradeoff: elapsed time rises 15.2% (about 6 ms), while CPU falls 6.1% and peak RSS falls 20.8%. The implementation is not uniformly faster on every line distribution. All 30 output assertions passed. A separate deterministic differential audit compares complete output/error fields against current production on 50 boundary/Unicode/NUL/long-line fixtures and 896 page requests; all 896 match.

## Scheduling sensitivity

The complete seven-sample main suite and three-sample additional suite were repeated with both checkouts and every worker restricted to CPUs 38 and 41, two different physical cores whose sibling pairs showed about 5% combined activity in a one-second probe before the run. Affinity does not reserve CPUs or eliminate other users' workloads. All 226 assertions passed again; no samples were removed from either run.

```sh
READ_BENCH_CPUSET=38,41 READ_BENCH_SAMPLES=7 taskset -c 38,41 \
  bun packages/core/script/benchmark-read-pagination.ts run \
  /tmp/read-pagination-fixtures /tmp/read-pagination-affinity.json \
  /path/to/baseline /path/to/candidate
```

Choose CPUs permitted on your machine; `READ_BENCH_CPUSET` records the setting, while `taskset` actually applies it. Repeat with the additional fixture directory and `READ_BENCH_SAMPLES=3` for the remaining cases. The full result set is in the CSV; selected comparisons include the cases that changed direction:

| Scenario                           | Before ms | After ms | Before CPU ms | After CPU ms |
| ---------------------------------- | --------: | -------: | ------------: | -----------: |
| Small whole                        |     1.070 |    1.357 |         1.507 |        1.811 |
| Small page                         |     2.794 |    1.468 |         3.645 |        1.979 |
| Source shallow                     |    54.866 |   20.881 |        76.075 |       25.669 |
| Source deep                        |   327.376 |   58.330 |       343.315 |       79.096 |
| Log deep                           |  1474.781 |  180.121 |      1343.008 |      251.255 |
| Log EOF                            |  1173.178 |  164.254 |      1265.358 |      246.581 |
| Actual bun.lock                    |    38.503 |   12.179 |        63.926 |       19.046 |
| Actual model snapshot              |   306.347 |   95.572 |       372.209 |      112.015 |
| Actual TUI recording               |    51.817 |   11.571 |        82.355 |       17.113 |
| One million blank lines            |    51.885 |   36.518 |        79.338 |       58.835 |
| One million single-character lines |    56.653 |   38.342 |        80.178 |       56.164 |

The substantial deep-read gains persist: 8.19x elapsed and 5.35x CPU improvement for the deep log, with peak RSS falling 28.1% (147.5 → 106.0 MiB). Short cases are less stable: the unchanged small-whole path measures 0.287 ms slower under affinity, while blank lines change from slower to faster. These results do not establish a uniform gain or a consistent short-case regression. Both runs and all original measurements are published rather than selecting the more favorable run.

## Validation

- `bun run check`: lint and all 34 workspace typecheck tasks passed.
- `bun run script/test.ts test/tool-read-filesystem.test.ts --rerun-each 10` in `packages/core`: 300 tests passed, 500 assertions.
- The benchmark is separate from CI tests; correctness tests do not assert elapsed-time thresholds.

Raw measured values, including the quality check, explored alternatives, both final runs, and additional validation, are in `benchmark-read-pagination.csv`. The initial `native` pilot overlapped another scorer's CPU work; it is retained, and the uncontended `native-clean` repeat supplies the exploratory number reported above. `quality-smoke`, `quality-errors`, and `streaming-correctness` are preliminary correctness runs, not the repeated timing comparisons. Exploratory timings are not substituted for the final paired measurements.
