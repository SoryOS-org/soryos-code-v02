import { parseArgs } from "node:util"
import { pathToFileURL } from "node:url"
import { resolve } from "node:path"
import { Effect } from "effect"

const { values } = parseArgs({
  options: {
    data: { type: "string" },
    runtime: { type: "string", default: resolve(import.meta.dir, "../src/tool-runtime.ts") },
    split: { type: "string", default: "all" },
    track: { type: "string", default: "search" },
    output: { type: "string" },
  },
})
if (!values.data) throw new Error("Pass --data <prepared benchmark.json>")

type Benchmark = {
  corpus: Array<{ id: string; path: string; description: string; properties: Record<string, unknown> }>
  queries: Array<{ id: string; query: string; search: string; source: string; split: string; relevant: Array<string> }>
}

const benchmark: Benchmark = await Bun.file(values.data).json()
const runtime = await import(pathToFileURL(resolve(values.runtime)).href)
const prepared = runtime.prepare(
  Object.fromEntries(
    benchmark.corpus.map((entry) => [
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
const ids = new Map(benchmark.corpus.map((entry) => [runtime.toolExpression(entry.path), entry.id]))
const queries = benchmark.queries.filter((query) => values.split === "all" || query.split === values.split)
const results: Array<{
  id: string
  source: string
  split: string
  ranked: Array<string>
  recall10: number
  mrr10: number
  ndcg10: number
}> = []
for (const query of queries) {
  const response = (await Effect.runPromise(
    bridge.search([{ query: values.track === "natural" ? query.query : query.search, limit: 10 }]),
  )) as {
    items: Array<{ path: string }>
  }
  const ranked = response.items.map((item) => {
    const id = ids.get(item.path)
    if (!id) throw new Error(`Unknown returned path: ${item.path}`)
    return id
  })
  const relevant = new Set(query.relevant)
  const hits = ranked.map((id) => Number(relevant.has(id)))
  const first = hits.indexOf(1)
  const ideal = query.relevant.slice(0, 10).reduce((total, _, index) => total + 1 / Math.log2(index + 2), 0)
  results.push({
    id: query.id,
    source: query.source,
    split: query.split,
    ranked,
    recall10: hits.reduce((total, hit) => total + hit, 0) / relevant.size,
    mrr10: first < 0 ? 0 : 1 / (first + 1),
    ndcg10: hits.reduce((total, hit, index) => total + hit / Math.log2(index + 2), 0) / ideal,
  })
}
const summarize = (rows: typeof results) => ({
  count: rows.length,
  recall10: rows.reduce((total, row) => total + row.recall10, 0) / rows.length,
  mrr10: rows.reduce((total, row) => total + row.mrr10, 0) / rows.length,
  ndcg10: rows.reduce((total, row) => total + row.ndcg10, 0) / rows.length,
})
const output = {
  split: values.split,
  track: values.track,
  summary: summarize(results),
  sources: Object.fromEntries(
    [...new Set(results.map((row) => row.source))].map((source) => [
      source,
      summarize(results.filter((row) => row.source === source)),
    ]),
  ),
  results,
}
if (values.output) await Bun.write(values.output, JSON.stringify(output, null, 2))
console.log(JSON.stringify({ ...output, results: undefined }, null, 2))
