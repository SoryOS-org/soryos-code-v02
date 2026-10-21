import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"

type Page = { offset?: number; limit?: number }
type Scenario = { name: string; file: string; page: Page; expected: Record<string, unknown> }

const [mode, directory, ...arguments_] = process.argv.slice(2)
if (!mode || !directory)
  throw new Error("Usage: benchmark-read-pagination.ts prepare DIR | worker DIR ROOT SCENARIO | run DIR OUTPUT ROOT...")

if (mode === "prepare") {
  await fs.mkdir(directory, { recursive: true })
  const scenarios: Scenario[] = []
  const add = async (name: string, content: string, pages: Array<{ name: string; page: Page }>) => {
    const file = path.join(directory, name)
    await Bun.write(file, content)
    const lines = content.split("\n")
    if (lines.at(-1) === "") lines.pop()
    for (const entry of pages) {
      const offset = entry.page.offset || 1
      const limit = Math.min(entry.page.limit || 2000, 2000)
      const selected = lines.slice(offset - 1, offset - 1 + limit).map((line) => {
        const text = line.endsWith("\r") ? line.slice(0, -1) : line
        return text.length > 2000 ? text.slice(0, 2000) + "... (line truncated to 2000 chars)" : text
      })
      const whole = Buffer.byteLength(content) <= 50 * 1024 && Object.keys(entry.page).length === 0
      const truncated = offset - 1 + selected.length < lines.length
      const expected = whole
        ? { type: "file", content, encoding: "utf8" }
        : offset > lines.length && offset !== 1
          ? { error: "ReadTool.OffsetOutOfRangeError", offset }
          : {
              type: "text-page",
              content: selected.join("\n"),
              offset,
              truncated,
              ...(truncated ? { next: offset + selected.length } : {}),
            }
      scenarios.push({ name: entry.name, file, page: entry.page, expected })
    }
  }
  await add(
    "small.ts",
    Array.from({ length: 1000 }, (_, index) => `export const item${index} = ${index}`).join("\n") + "\n",
    [
      { name: "small-whole", page: {} },
      { name: "small-page", page: { offset: 500, limit: 125 } },
    ],
  )
  await add(
    "source.ts",
    Array.from(
      { length: 200_000 },
      (_, index) => `export const item${index} = { value: ${index}, enabled: true }`,
    ).join("\n") + "\n",
    [
      { name: "source-shallow", page: { offset: 1, limit: 125 } },
      { name: "source-deep", page: { offset: 180_000, limit: 125 } },
    ],
  )
  await add(
    "application.log",
    Array.from(
      { length: 1_000_000 },
      (_, index) => `2026-01-01T00:00:00Z INFO request=${String(index).padStart(7, "0")} status=200 elapsed=12ms`,
    ).join("\n") + "\n",
    [
      { name: "log-deep", page: { offset: 950_000, limit: 125 } },
      { name: "log-eof", page: { offset: 999_980, limit: 125 } },
    ],
  )
  await add(
    "utf8.txt",
    Array.from({ length: 12_000 }, (_, index) => `${index}: café 日本語 🙂 ${"x".repeat(index % 40)}`).join("\r\n"),
    [
      { name: "utf8-crlf", page: { offset: 6_000, limit: 125 } },
      { name: "utf8-no-final-newline", page: { offset: 11_990, limit: 125 } },
    ],
  )
  await add("long.txt", `prefix\n${"x".repeat(700_000)}\nsuffix\n`, [
    { name: "long-line", page: { offset: 2, limit: 1 } },
    { name: "skip-long-line", page: { offset: 3, limit: 1 } },
  ])
  await add("range.txt", "line\n".repeat(60_000), [{ name: "out-of-range", page: { offset: 60_001, limit: 1 } }])
  for (const [name, content, page, expected] of [
    [
      "binary-before",
      `\0${"line\n".repeat(60_000)}`,
      { offset: 59_999, limit: 1 },
      { error: "ReadTool.BinaryFileError" },
    ],
    [
      "binary-inside",
      `${"line\n".repeat(55_000)}a\0b\n${"line\n".repeat(5_000)}`,
      { offset: 55_001, limit: 1 },
      { error: "ReadTool.BinaryFileError" },
    ],
    [
      "binary-after",
      `hello\n${"line\n".repeat(60_000)}\0`,
      { offset: 1, limit: 1 },
      { type: "text-page", content: "hello", offset: 1, truncated: true, next: 2 },
    ],
  ] as const) {
    const file = path.join(directory, `${name}.txt`)
    await Bun.write(file, content)
    scenarios.push({ name, file, page, expected })
  }
  await Bun.write(path.join(directory, "manifest.json"), JSON.stringify(scenarios, null, 2))
  console.log(JSON.stringify({ scenarios: scenarios.length, directory }))
} else if (mode === "worker") {
  const [root, name] = arguments_
  const scenarios: Scenario[] = await Bun.file(path.join(directory, "manifest.json")).json()
  const scenario = scenarios.find((item) => item.name === name)!
  const require = createRequire(path.join(root, "packages/core/package.json"))
  const { Effect } = await import(require.resolve("effect"))
  const processModule = (await Bun.file(path.join(root, "packages/util/src/cross-spawn-spawner.ts")).text()).includes(
    "effect/unstable/process",
  )
    ? "effect/unstable/process"
    : "effect/process"
  const { ChildProcessSpawner } = await import(require.resolve(processModule))
  const { LayerNode } = await import(path.join(root, "packages/util/src/effect/layer-node.ts"))
  const { CrossSpawnSpawner } = await import(path.join(root, "packages/util/src/cross-spawn-spawner.ts"))
  const { Environment } = await import(path.join(root, "packages/core/src/environment/index.ts"))
  const { ReadToolFileSystem } = await import(path.join(root, "packages/core/src/tool/read-filesystem.ts"))
  const repetitions = name.startsWith("small") ? 100 : 1
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
      const files = Environment.makeFiles(Environment.makeLocalDriver(spawner))
      const cpu = process.cpuUsage()
      const started = performance.now()
      let value: Record<string, unknown> = {}
      for (let repeat = 0; repeat < repetitions; repeat++) {
        value = yield* ReadToolFileSystem.read(files, scenario.file, path.basename(scenario.file), scenario.page).pipe(
          Effect.match({
            onFailure: (error: { _tag: string; offset?: number }) => ({
              error: error._tag,
              ...(error.offset === undefined ? {} : { offset: error.offset }),
            }),
            onSuccess: (output: Record<string, unknown>) =>
              output.type === "file"
                ? { type: output.type, content: output.content, encoding: output.encoding }
                : {
                    type: output.type,
                    content: output.content,
                    offset: output.offset,
                    truncated: output.truncated,
                    ...(output.next === undefined ? {} : { next: output.next }),
                  },
          }),
        )
      }
      const wall = performance.now() - started
      const usage = process.cpuUsage(cpu)
      assert.deepEqual(value, scenario.expected, scenario.name)
      return {
        name,
        repetitions,
        wallMs: wall / repetitions,
        cpuMs: (usage.user + usage.system) / 1000 / repetitions,
        rssKiB: process.resourceUsage().maxRSS,
        correct: true,
      }
    }).pipe(Effect.provide(LayerNode.compile(CrossSpawnSpawner.node))),
  )
  console.log(JSON.stringify(result))
} else if (mode === "run") {
  const [output, ...roots] = arguments_
  const scenarios: Scenario[] = await Bun.file(path.join(directory, "manifest.json")).json()
  const selected = process.env.READ_BENCH_SCENARIOS?.split(",")
  const samples = Number(process.env.READ_BENCH_SAMPLES || 3)
  const revisions = await Promise.all(
    roots.map(async (root) => ({
      root,
      commit: Bun.spawnSync(["git", "-C", root, "rev-parse", "HEAD"]).stdout.toString().trim(),
      readerSha256: new Bun.CryptoHasher("sha256")
        .update(await Bun.file(path.join(root, "packages/core/src/tool/read-filesystem.ts")).arrayBuffer())
        .digest("hex"),
    })),
  )
  const manifestSha256 = new Bun.CryptoHasher("sha256")
    .update(await Bun.file(path.join(directory, "manifest.json")).arrayBuffer())
    .digest("hex")
  const results = []
  for (let sample = 0; sample < samples; sample++) {
    for (const scenario of scenarios.filter((item) => !selected || selected.includes(item.name))) {
      for (const root of sample % 2 === 0 ? roots : roots.toReversed()) {
        const child = Bun.spawn([process.execPath, import.meta.path, "worker", directory, root, scenario.name], {
          stdout: "pipe",
          stderr: "pipe",
        })
        const stdout = await new Response(child.stdout).text()
        const stderr = await new Response(child.stderr).text()
        assert.equal(await child.exited, 0, stderr)
        const result = { root, sample, ...JSON.parse(stdout) }
        results.push(result)
        console.log(JSON.stringify(result))
        await Bun.write(
          output,
          JSON.stringify(
            {
              date: new Date().toISOString(),
              bun: Bun.version,
              platform: process.platform,
              arch: process.arch,
              cpus: os.cpus()[0]?.model,
              affinity: process.env.READ_BENCH_CPUSET ?? "unrestricted",
              revisions,
              manifestSha256,
              results,
            },
            null,
            2,
          ),
        )
      }
    }
  }
} else throw new Error(`Unknown mode: ${mode}`)
