// The user-facing changes compiled into a beta build: the build's commit, the newest commits of its history, and the
// feat, fix and perf commits among them. electron.vite.config.ts embeds them in the renderer as
// import.meta.env.OPENCODE_BETA_NOTES; the updater's "What's new in beta" dialog lists the ones after the commit of the
// build the user saw last.
// Usage: bun scripts/beta-notes.ts [head]
export * as BetaNotes from "./beta-notes"

import { execFileSync } from "node:child_process"

export type BetaNote = {
  type: "feat" | "fix" | "perf"
  scope?: string
  summary: string
  breaking?: true
  pr?: number
  sha: string
}

/** How many commits of history a build carries. A previous build further back shows the newest notes instead. */
const LIMIT = 200

/** Commits are identified by this many hex digits, enough to be unique in this repository. */
const SHORT = 12

const KEPT = new Set(["feat", "fix", "perf"])

const FIELD = "\x1f"

const RECORD = "\x1e"

/**
 * Reads the commit `head` resolves to (GITHUB_SHA in CI) and its newest commits, newest first: every commit's short
 * sha, merges included so a previous build at a merge is found, and the notes of the non-merge feat, fix and perf ones.
 */
export function embed(input: { head?: string; cwd?: string } = {}) {
  // electron-vite loads its config, which calls this, in Node, so this cannot use Bun's shell.
  const git = (...args: string[]) => execFileSync("git", args, { cwd: input.cwd, encoding: "utf8" })

  const sha = git("rev-parse", input.head ?? process.env.GITHUB_SHA ?? "HEAD").trim()

  const log = git("log", "--topo-order", `--max-count=${LIMIT}`, `--format=%H${FIELD}%P${FIELD}%s${RECORD}`, sha)

  const records = log
    .split(RECORD)
    .map((record) => record.trim().split(FIELD))
    .filter((fields) => fields.length === 3 && fields[0])

  return {
    sha,
    commits: records.map(([commit]) => commit!.slice(0, SHORT)),
    notes: records.flatMap(([commit, parents, subject]): BetaNote[] => {
      // A merge commit repeats the commits it merges.
      if (parents!.trim().split(/\s+/).length > 1) return []

      const note = parseSubject(subject!)

      return note ? [{ ...note, sha: commit!.slice(0, SHORT) }] : []
    }),
  }
}

/** Parses a conventional commit header `type(scope)!: summary (#123)`; anything else is not a note. */
export function parseSubject(subject: string) {
  const match = subject.trim().match(/^(\w+)(?:\(([^)]*)\))?(!)?:\s*(.+)$/)
  const type = match?.[1]?.toLowerCase()

  if (!match || !type || !isKept(type)) return undefined

  const pr = match[4]!.match(/\s*\(#(\d+)\)\s*$/)
  const summary = (pr ? match[4]!.slice(0, pr.index) : match[4]!).trim()

  if (!summary) return undefined

  const note: Omit<BetaNote, "sha"> = { type, summary }
  const scope = match[2]?.trim()

  if (scope) note.scope = scope

  if (match[3]) note.breaking = true

  if (pr) note.pr = Number(pr[1])

  return note
}

function isKept(type: string): type is BetaNote["type"] {
  return KEPT.has(type)
}

if (import.meta.main) console.log(JSON.stringify(embed({ head: process.argv[2] }), null, 2))
