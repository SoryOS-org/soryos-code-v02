import path from "node:path"
import fs from "node:fs/promises"

const [root, directory] = process.argv.slice(2)
if (!root || !directory) throw new Error("Usage: benchmark-read-pagination-heldout.ts CHECKOUT FIXTURE_DIRECTORY")
await fs.mkdir(directory, { recursive: true })
const scenarios = []
for (const [name, content, position] of [
  ["real-lockfile", await Bun.file(path.join(root, "bun.lock")).text(), 0.9],
  ["real-model-snapshot", await Bun.file(path.join(root, "packages/core/src/models-dev/snapshot.txt")).text(), 0],
  ["real-tui-recording", await Bun.file(path.join(root, "packages/console/app/public/tui.json")).text(), 0.9],
  ["dense-blank-lines", "\n".repeat(1_000_000), 0.95],
  ["dense-short-lines", "x\n".repeat(1_000_000), 0.95],
] as const) {
  const file = path.join(directory, `${name}.txt`)
  await Bun.write(file, content)
  const lines = content.split("\n")
  if (lines.at(-1) === "") lines.pop()
  const offset = Math.max(1, Math.floor(lines.length * position))
  const selected = lines.slice(offset - 1, offset + 4).map((line) => {
    const text = line.endsWith("\r") ? line.slice(0, -1) : line
    return text.length > 2000 ? text.slice(0, 2000) + "... (line truncated to 2000 chars)" : text
  })
  const truncated = offset - 1 + selected.length < lines.length
  scenarios.push({
    name,
    file,
    page: { offset, limit: 5 },
    expected: {
      type: "text-page",
      content: selected.join("\n"),
      offset,
      truncated,
      ...(truncated ? { next: offset + selected.length } : {}),
    },
  })
}
await Bun.write(path.join(directory, "manifest.json"), JSON.stringify(scenarios, null, 2))
console.log(JSON.stringify({ directory, scenarios: scenarios.length }))
