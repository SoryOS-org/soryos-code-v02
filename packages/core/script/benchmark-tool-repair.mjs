import { createHash } from "node:crypto"
import { mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"
import { Effect } from "effect"

const directory = fileURLToPath(new URL("../", import.meta.url))
const cache = join(
  tmpdir(),
  `opencode-argument-repair-${createHash("sha256").update(directory).digest("hex").slice(0, 12)}`,
)
await mkdir(cache, { recursive: true })
await Bun.write(`${cache}/package.json`, JSON.stringify({ private: true, dependencies: { ajv: "8.17.1" } }))
const install = Bun.spawnSync(["bun", "install", "--ignore-scripts", "--cwd", cache])
if (install.exitCode !== 0) throw new Error(install.stderr.toString())
const { default: Ajv } = await import(`${cache}/node_modules/ajv/dist/ajv.js`)
const validator = new Ajv({ strict: false, validateFormats: false, allErrors: true })
const sources = [
  {
    name: "github",
    url: "https://raw.githubusercontent.com/github/rest-api-description/755ee33b4a81d51f6f07a902cce26cbec3b822f2/descriptions/api.github.com/api.github.com.json",
    sha256: "3177ad6a86ca04c57a9bef3fc24e28a339efb8eb040c6f950af3d3ed2fee7fa3",
  },
  {
    name: "cloudflare",
    url: "https://raw.githubusercontent.com/cloudflare/api-schemas/880ff24a8d487f05651f6dc24f482b9845127c7f/openapi.json",
    sha256: "f38352849426c3c46c7ea69a77b886f54d319f879696adcee35fc3ebd36f9439",
  },
]
const examples = []
const schemas = []
const indices = new Map()
const excluded = []

function resolve(value, root, trail = []) {
  if (Array.isArray(value)) return value.map((item) => resolve(item, root, trail))
  if (!value || typeof value !== "object") return value
  if (typeof value.$ref === "string") {
    if (!value.$ref.startsWith("#/") || trail.includes(value.$ref)) throw new Error(`unresolved ${value.$ref}`)
    const target = value.$ref
      .slice(2)
      .split("/")
      .reduce((node, key) => node[key.replaceAll("~1", "/").replaceAll("~0", "~")], root)
    if (!target) throw new Error(`missing ${value.$ref}`)
    const { $ref, ...rest } = value
    return { ...resolve(target, root, [...trail, $ref]), ...resolve(rest, root, trail) }
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolve(item, root, trail)]))
}

for (const source of sources) {
  const file = Bun.file(`${cache}/${source.name}.json`)
  if (!(await file.exists())) {
    const response = await fetch(source.url)
    if (!response.ok) throw new Error(`${source.url}: ${response.status}`)
    await Bun.write(file, await response.text())
  }
  const text = await Bun.file(`${cache}/${source.name}.json`).text()
  if (createHash("sha256").update(text).digest("hex") !== source.sha256)
    throw new Error(`Source hash mismatch: ${source.name}`)
  const spec = JSON.parse(text)
  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (!["post", "put", "patch", "delete"].includes(method)) continue
      const media = operation?.requestBody?.content?.["application/json"]
      if (!media?.schema) continue
      const supplied = {
        ...(media.examples ?? {}),
        ...(media.example === undefined ? {} : { direct: { value: media.example } }),
      }
      for (const [name, example] of Object.entries(supplied)) {
        const value = example?.value
        const id = `${source.name}:${operation.operationId ?? `${method} ${path}`}:${name}`
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          excluded.push({ id, reason: "non-object example" })
          continue
        }
        let schema
        let validate
        try {
          schema = resolve(media.schema, spec)
          validate = validator.compile(schema)
        } catch (error) {
          excluded.push({ id, reason: String(error) })
          continue
        }
        if (!validate(value)) {
          excluded.push({ id, reason: "example fails original schema", errors: validate.errors })
          continue
        }
        const key = JSON.stringify(schema)
        if (!indices.has(key)) {
          indices.set(key, schemas.length)
          schemas.push(schema)
        }
        examples.push({
          id,
          source: source.name,
          operation: operation.operationId ?? `${method} ${path}`,
          schema: indices.get(key),
          value,
        })
      }
    }
  }
}
await Bun.write(`${cache}/corpus.json`, JSON.stringify({ sources, schemas, examples, excluded }))

function variants(value, path = []) {
  const mutations = []
  if (typeof value === "number" && Number.isFinite(value))
    mutations.push({ kind: "number-string", path, value: String(value) })
  if (typeof value === "boolean") mutations.push({ kind: "boolean-string", path, value: String(value) })
  if (value && typeof value === "object") {
    if (Object.keys(value).length) mutations.push({ kind: "container-string", path, value: JSON.stringify(value) })
    if (Array.isArray(value) && value.length === 1) mutations.push({ kind: "singleton-array", path, value: value[0] })
    for (const [key, item] of Object.entries(value))
      mutations.push(...variants(item, [...path, Array.isArray(value) ? Number(key) : key]))
  }
  return mutations
}

function replace(value, path, replacement) {
  if (!path.length) return replacement
  const result = structuredClone(value)
  let parent = result
  for (const key of path.slice(0, -1)) parent = parent[key]
  parent[path.at(-1)] = replacement
  return result
}

const cases = examples.flatMap((example) => {
  const schema = schemas[example.schema]
  const validate = validator.compile(schema)
  return [
    { ...example, kind: "valid", input: example.value, validate },
    ...variants(example.value).flatMap((mutation) => {
      const input = replace(example.value, mutation.path, mutation.value)
      return validate(input)
        ? []
        : [
            {
              ...example,
              id: `${example.id}:${mutation.kind}:${mutation.path.join(".")}`,
              kind: mutation.kind,
              input,
              validate,
            },
          ]
    }),
  ]
})
const revisions = {
  historical: "437cdc03a92d5cf7624b87854806108235b2b946",
  baseline: "79fd806343db0de150f23b09e4b9199434d6779c",
}
const sourcePath = "packages/core/src/plugin/tool-input-repair.ts"
const labels = process.argv.slice(2).filter((argument) => argument !== "--hooks-only")
const versions = labels.length ? labels : ["parent", "historical", "baseline", "current"]
if (versions.some((version) => !["parent", "historical", "baseline", "current"].includes(version)))
  throw new Error("Expected versions: parent historical baseline current")
if (versions.includes("parent")) {
  const parent = "219ecada681992eed914c61ac4fb321dd887fbef"
  const internal = Bun.spawnSync(["git", "show", `${parent}:packages/core/src/plugin/internal.ts`], { cwd: directory })
  const missing = Bun.spawnSync(["git", "cat-file", "-e", `${parent}:${sourcePath}`], { cwd: directory })
  if (internal.exitCode !== 0 || missing.exitCode === 0 || internal.stdout.toString().includes("ToolInputRepair"))
    throw new Error("Historical parent does not match the verified absence of argument repair")
}
const reports = []
for (const version of versions) {
  const source = revisions[version]
    ? Bun.spawnSync(["git", "show", `${revisions[version]}:${sourcePath}`], { cwd: directory }).stdout.toString()
    : await Bun.file(`${directory}/src/plugin/tool-input-repair.ts`).text()
  if (version !== "parent" && !source.includes("export const Plugin"))
    throw new Error(`Missing source revision: ${version}`)
  const adapted = source
    .replace(/^export \* as ToolInputRepairPlugin.*\n/m, "")
    .replace('from "effect"', `from "${directory}/node_modules/effect/dist/index.js"`)
    .replace('from "@opencode/plugin/effect/plugin"', `from "${directory}/../plugin/src/effect/plugin.ts"`)
    .replace('from "../tool/runtime.js"', `from "${directory}/src/tool/runtime.ts"`)
  const compiled = new Bun.Transpiler({ loader: "ts" }).transformSync(adapted)
  const imported = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`)
  const records = []
  for (const row of cases) {
    const input = structuredClone(row.input)
    const event = {
      tool: "test",
      input,
      sessionID: "ses_repair",
      agent: "build",
      messageID: "msg_repair",
      id: "call_repair",
    }
    const tool = {
      id: "test",
      name: "test",
      description: "Benchmark",
      input: schemas[row.schema],
      execute: () => Effect.succeed({ content: "unused" }),
    }
    if (version !== "parent")
      await Effect.runPromise(
        imported.Plugin.effect({
          tool: {
            list: () => Effect.succeed([tool]),
            transform: (callback) => Effect.sync(() => callback({ get: () => tool })),
            hook: (_name, callback) => callback(event).pipe(Effect.as({ dispose: Effect.void })),
          },
        }),
      )
    const accepted = row.validate(event.input)
    const exact = isDeepStrictEqual(event.input, row.value)
    const unchanged = isDeepStrictEqual(event.input, row.input)
    records.push({
      id: row.id,
      source: row.source,
      operation: row.operation,
      kind: row.kind,
      accepted,
      exact,
      unchanged,
      identity: event.input === input,
    })
  }
  const totals = Object.fromEntries(
    Object.entries(Object.groupBy(records, (row) => row.source)).map(([name, rows]) => {
      const malformed = rows.filter((row) => row.kind !== "valid")
      const operations = Object.values(Object.groupBy(malformed, (row) => row.operation))
      return [
        name,
        {
          malformed: malformed.length,
          recovered: malformed.filter((row) => row.accepted && row.exact).length,
          wrongAccepted: rows.filter((row) => row.accepted && !row.exact).length,
          changedInvalid: rows.filter((row) => !row.accepted && !row.unchanged).length,
          valid: rows.length - malformed.length,
          validChanged: rows.filter((row) => row.kind === "valid" && (!row.unchanged || !row.identity)).length,
          operationMean:
            operations.reduce(
              (sum, group) => sum + group.filter((row) => row.accepted && row.exact).length / group.length,
              0,
            ) / operations.length,
        },
      ]
    }),
  )
  const report = {
    version,
    revision:
      version === "parent" ? "219ecada681992eed914c61ac4fb321dd887fbef" : (revisions[version] ?? "working tree"),
    sourceHash: version === "parent" ? null : createHash("sha256").update(source).digest("hex"),
    totals,
    records,
  }
  reports.push(report)
  console.log(JSON.stringify({ version, totals }, null, 2))
}
await Bun.write(
  `${cache}/results.json`,
  JSON.stringify({ sources, examples: examples.length, cases: cases.length, excluded, reports }, null, 2),
)
console.log(`Isolated hook diagnostics: ${cache}/results.json`)
if (reports.some((report) => Object.values(report.totals).some((total) => total.wrongAccepted || total.validChanged)))
  process.exitCode = 1

if (!process.argv.includes("--hooks-only")) {
  const corpusPath = `${cache}/pipeline-corpus.json`
  await Bun.write(
    corpusPath,
    JSON.stringify({ cases: cases.map((row) => ({ ...row, schema: schemas[row.schema], expected: row.value })) }),
  )
  const fixture = await Bun.file(new URL("./benchmark-tool-repair.fixture.txt", import.meta.url)).text()
  const pipelines = []
  for (const version of versions) {
    const revision = version === "parent" ? "219ecada681992eed914c61ac4fb321dd887fbef" : revisions[version]
    const checkout = revision ? `${cache}/checkout-${revision}` : join(directory, "../..")
    if (revision && !(await Bun.file(`${checkout}/.git`).exists())) {
      const added = Bun.spawnSync(["git", "worktree", "add", "--detach", checkout, revision], { cwd: directory })
      if (added.exitCode !== 0) throw new Error(added.stderr.toString())
    }
    if (revision) {
      const installed = Bun.spawnSync(["bun", "install", "--ignore-scripts", "--frozen-lockfile"], { cwd: checkout })
      if (installed.exitCode !== 0) throw new Error(installed.stderr.toString())
    }
    const test = `${checkout}/packages/core/test/plugin/argument-repair-benchmark.test.ts`
    if (await Bun.file(test).exists()) throw new Error(`Refusing to overwrite ${test}`)
    await Bun.write(test, fixture)
    try {
      const result = Bun.spawnSync(["bun", "test", "--timeout", "120000", test], {
        cwd: `${checkout}/packages/core`,
        env: {
          ...process.env,
          OPENCODE_REPAIR_CORPUS: corpusPath,
          OPENCODE_REPAIR_OUTPUT: `${cache}/pipeline-${version}.json`,
        },
      })
      console.log(result.stdout.toString(), result.stderr.toString())
      if (result.exitCode !== 0) throw new Error(`Pipeline test failed: ${version}`)
      pipelines.push({ version, ...(await Bun.file(`${cache}/pipeline-${version}.json`).json()) })
    } finally {
      await rm(test)
    }
  }
  const baseline = pipelines.find((report) => report.version === "baseline")
  const current = pipelines.find((report) => report.version === "current")
  if (baseline && current) {
    const regressions = current.records.filter((row, index) => {
      const before = baseline.records[index]
      return (
        (before.exact && before.success && (!row.exact || !row.success)) ||
        (row.invoked && !row.exact && !(before.invoked && !before.exact)) ||
        (row.kind === "valid" && (row.invoked !== before.invoked || row.exact !== before.exact))
      )
    })
    if (regressions.length) throw new Error(`Pipeline regressions: ${JSON.stringify(regressions)}`)
  }
  await Bun.write(
    `${cache}/pipeline-results.json`,
    JSON.stringify({ sources, cases: cases.length, pipelines }, null, 2),
  )
  console.log(`Actual registry/validator pipeline evidence: ${cache}/pipeline-results.json`)
}
