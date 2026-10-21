import { parseArgs } from "node:util"
import { createHash } from "node:crypto"
import { pathToFileURL } from "node:url"
import { resolve } from "node:path"
import { Effect } from "effect"

const { values } = parseArgs({
  options: {
    data: { type: "string" },
    size: { type: "string", default: "3000" },
    runtime: { type: "string", default: resolve(import.meta.dir, "../src/tool-runtime.ts") },
  },
})
if (!values.data) throw new Error("Pass --data <prepared benchmark.json>")
const size = Number(values.size)
if (!Number.isSafeInteger(size) || size <= 0) throw new Error("--size must be a positive integer")
const runtime = await import(pathToFileURL(resolve(values.runtime)).href)
const benchmark = (await Bun.file(values.data).json()) as {
  corpus: Array<{ id: string; path: string; description: string; properties: Record<string, unknown> }>
  queries: Array<{ id: string; search: string }>
}
const digest = (value: string) => createHash("sha256").update(value).digest("hex")
const corpus = benchmark.corpus
  .map((entry) => ({ entry, key: digest(entry.id) }))
  .sort((left, right) => left.key.localeCompare(right.key))
  .slice(0, size)
  .map(({ entry }) => entry)
const queries = benchmark.queries
  .map((entry) => ({ entry, key: digest(entry.id) }))
  .sort((left, right) => left.key.localeCompare(right.key))
  .slice(0, 40)
  .map(({ entry }) => entry.search)
const prepared = runtime.prepare(
  Object.fromEntries(
    corpus.map((entry) => [
      entry.path,
      {
        _tag: "CodeModeTool",
        description: entry.description,
        input: { type: "object", properties: entry.properties },
        output: undefined,
        execute: () => Effect.void,
      },
    ]),
  ),
)
const bridge = runtime.make(prepared, undefined)
Bun.gc(true)
const before = process.memoryUsage()
const started = performance.now()
await Effect.runPromise(bridge.search([{ query: queries[0], limit: 10 }]))
const cold = performance.now() - started
for (const query of queries) await Effect.runPromise(bridge.search([{ query, limit: 10 }]))
Bun.gc(true)
const after = process.memoryUsage()
const durations: Array<number> = []
for (const query of queries) {
  const start = performance.now()
  await Effect.runPromise(bridge.search([{ query, limit: 10 }]))
  durations.push(performance.now() - start)
}
durations.sort((left, right) => left - right)
console.log(
  JSON.stringify({
    size: corpus.length,
    queries: queries.length,
    cold,
    warmMedian: durations[Math.floor(durations.length / 2)],
    warmP95: durations[Math.floor(durations.length * 0.95)],
    heapDeltaMiB: (after.heapUsed - before.heapUsed) / 1048576,
    rssDeltaMiB: (after.rss - before.rss) / 1048576,
    peakRSSMiB: process.resourceUsage().maxRSS / 1024,
  }),
)
