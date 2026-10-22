import { afterAll, expect, test } from "bun:test"
import { $ } from "bun"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { BetaNotes } from "./beta-notes"

test.each([
  [
    "feat(app): merge projects across servers in the location dialog",
    { type: "feat", scope: "app", summary: "merge projects across servers in the location dialog" },
  ],
  [
    "fix(desktop): disable animated wheel scrolling on linux (#57120)",
    { type: "fix", scope: "desktop", summary: "disable animated wheel scrolling on linux", pr: 57120 },
  ],
  ["perf: cache model list", { type: "perf", summary: "cache model list" }],
  [
    "Feat(core)!: drop legacy sessions",
    { type: "feat", scope: "core", summary: "drop legacy sessions", breaking: true },
  ],
  [
    "fix(app): keep (#1) in the middle of a summary",
    { type: "fix", scope: "app", summary: "keep (#1) in the middle of a summary" },
  ],
  ["chore(sdk): regenerate types", undefined],
  ["refactor(app): split dialog", undefined],
  ["docs: update guide", undefined],
  ["test(app): cover dialog", undefined],
  ["ci: cache bun", undefined],
  ["Merge branch 'dev' into beta", undefined],
  ["fix the thing without a type", undefined],
  ["fix(app): (#12)", undefined],
])("parses %p", (subject, expected) => {
  expect(BetaNotes.parseSubject(subject)).toEqual(expected)
})

const repos: string[] = []

afterAll(() => Promise.all(repos.map((dir) => rm(dir, { recursive: true, force: true }))))

async function repo(subjects: string[]) {
  const dir = await mkdtemp(path.join(tmpdir(), "beta-notes-"))
  repos.push(dir)

  await $`git init -q -b beta && git config user.email a@b.c && git config user.name Ada`.cwd(dir).quiet()

  // One fast-import writes every commit, where a commit per process is slow on Windows.
  const stream = subjects
    .map((subject, i) =>
      [
        "commit refs/heads/beta",
        `committer Ada <a@b.c> ${1_700_000_000 + i} +0000`,
        `data ${Buffer.byteLength(subject)}`,
        subject,
        "",
      ].join("\n"),
    )
    .join("")

  await $`git fast-import --quiet < ${new Response(stream)}`.cwd(dir).quiet()
  await $`git reset -q --hard beta`.cwd(dir).quiet()

  return { dir, shas: (await $`git rev-list --reverse HEAD`.cwd(dir).text()).trim().split("\n") }
}

test("embeds the build's commit, its history and the notes of its non-merge feat and fix commits", async () => {
  const git = await repo([
    "feat(app): old feature",
    "fix(app): first fix (#10)",
    "chore: bump",
    "feat(desktop): new dialog",
  ])

  await $`git checkout -q -b side HEAD~1 && git commit -q --allow-empty -m ${"fix(app): side fix"} && git checkout -q beta && git merge -q --no-ff side -m ${"fix(app): merge side"}`
    .cwd(git.dir)
    .quiet()

  const head = (await $`git rev-parse HEAD`.cwd(git.dir).text()).trim()
  const side = (await $`git rev-parse side`.cwd(git.dir).text()).trim()
  const short = (sha: string) => sha.slice(0, 12)
  const embedded = BetaNotes.embed({ head: "HEAD", cwd: git.dir })

  expect(embedded.sha).toBe(head)
  expect(embedded.commits).toHaveLength(6)
  expect(embedded.commits[0]).toBe(short(head))
  expect(embedded.notes).toEqual([
    { type: "fix", scope: "app", summary: "side fix", sha: short(side) },
    { type: "feat", scope: "desktop", summary: "new dialog", sha: short(git.shas[3]!) },
    { type: "fix", scope: "app", summary: "first fix", pr: 10, sha: short(git.shas[1]!) },
    { type: "feat", scope: "app", summary: "old feature", sha: short(git.shas[0]!) },
  ])
})

test("embeds at most the newest 200 commits", async () => {
  const git = await repo(Array.from({ length: 205 }, (_, i) => `fix(app): fix ${i}`))

  const embedded = BetaNotes.embed({ head: "HEAD", cwd: git.dir })

  expect(embedded.commits).toHaveLength(200)
  expect(embedded.notes[0]?.summary).toBe("fix 204")
  expect(embedded.notes.at(-1)?.summary).toBe("fix 5")
})
