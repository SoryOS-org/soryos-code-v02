import { parseArgs } from "node:util"
import { createHash } from "node:crypto"
import { operationPath } from "../src/openapi/spec.js"

const { values } = parseArgs({ options: { output: { type: "string" } } })
if (!values.output) throw new Error("Pass --output <benchmark.json>")
const revision = "880ff24a8d487f05651f6dc24f482b9845127c7f"
const response = await fetch(`https://raw.githubusercontent.com/cloudflare/api-schemas/${revision}/openapi.json`)
if (!response.ok) throw new Error(`Cloudflare schema download failed: ${response.status}`)
const content = await response.text()
const sha256 = createHash("sha256").update(content).digest("hex")
const spec = JSON.parse(content) as {
  paths: Record<string, Record<string, { operationId?: string; summary?: string; description?: string }>>
}
const used = new Set<string>()
const namespaces = new Set<string>()
const queries = new Map<string, Set<string>>()
const corpus = []
for (const [path, item] of Object.entries(spec.paths)) {
  for (const [method, operation] of Object.entries(item)) {
    if (!["get", "post", "patch", "put", "delete", "head", "options", "trace"].includes(method)) continue
    const segments = operationPath(method, path, operation, used, namespaces)
    used.add(segments.join("."))
    for (const index of segments.slice(0, -1).keys()) namespaces.add(segments.slice(0, index + 1).join("."))
    const name = `cloudflare.${segments.join(".")}`
    corpus.push({
      id: name,
      path: name,
      description: operation.description ?? operation.summary ?? `${method.toUpperCase()} ${path}`,
      properties: {},
    })
    if (!operation.summary?.trim()) continue
    const relevant = queries.get(operation.summary) ?? new Set<string>()
    relevant.add(name)
    queries.set(operation.summary, relevant)
  }
}
await Bun.write(
  values.output,
  JSON.stringify({
    source: { repository: "cloudflare/api-schemas", revision, sha256 },
    corpus,
    queries: [...queries].map(([query, relevant]) => ({
      id: createHash("sha256").update(query).digest("hex"),
      query,
      search: query,
      source: "cloudflare-operation-summaries",
      split: "heldout",
      relevant: [...relevant],
    })),
  }),
)
console.log(JSON.stringify({ tools: corpus.length, queries: queries.size, revision, sha256, output: values.output }))
