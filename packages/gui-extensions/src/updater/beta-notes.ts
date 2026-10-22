import { Option, Schema } from "effect"

const REPOSITORY = "https://github.com/anomalyco/opencode"

/** The dialog lists at most this many changes and links the rest. */
const SHOWN = 10

const Note = Schema.Struct({
  type: Schema.Literals(["feat", "fix", "perf"]),
  scope: Schema.optional(Schema.String),
  summary: Schema.String,
  pr: Schema.optional(Schema.Number),
  sha: Schema.String,
})

/** What a beta build embeds (packages/desktop/scripts/beta-notes.ts), newest first. */
const Embedded = Schema.Struct({
  /** The build's commit. */
  sha: Schema.String,
  /** The short shas of the build's newest commits, merges included. */
  commits: Schema.Array(Schema.String),
  /** The feat, fix and perf commits among them. */
  notes: Schema.Array(Note),
})

export type EmbeddedNotes = typeof Embedded.Type

/** Decodes the notes a beta build embeds as JSON. Other builds embed none. */
export const decodeEmbeddedNotes = Schema.decodeUnknownOption(Schema.fromJsonString(Embedded))

export type BetaNote = {
  readonly sha: string
  readonly summary: string
  readonly scope?: string
  readonly pr?: { readonly number: number; readonly url: string }
}

export type BetaNotes = {
  /** New features, newest first. */
  readonly added: readonly BetaNote[]
  /** Fixes and performance improvements, newest first. */
  readonly fixed: readonly BetaNote[]
  /** How many changes the header counts: every one since the previous build, or the listed ones when that is unknown. */
  readonly total: number
  /** The GitHub compare page of the whole range, when some changes are not listed. */
  readonly more?: string
}

/**
 * The changes since the build at `previous`: the notes of the commits newer than it, features first, then fixes, at
 * most 10 in all and at least half of them features when there are enough. When `previous` is older than the embedded
 * history (or was force-pushed away), the newest notes stand in, with the rest linked. None without a previous commit,
 * or without a change.
 */
export function sliceBetaNotes(embedded: EmbeddedNotes, previous: string | undefined): Option.Option<BetaNotes> {
  if (!previous || previous === embedded.sha) return Option.none()

  const cut = embedded.commits.findIndex((commit) => previous.startsWith(commit))
  const position = new Map(embedded.commits.map((commit, index) => [commit, index]))
  const notes = cut === -1 ? embedded.notes : embedded.notes.filter((note) => (position.get(note.sha) ?? cut) < cut)

  if (notes.length === 0) return Option.none()

  const features = notes.filter((note) => note.type === "feat")
  const fixes = notes.filter((note) => note.type !== "feat")
  // Features get at least half of the list when there are more fixes than fit, fixes whatever features leave.
  const added = features.slice(0, Math.max(SHOWN / 2, SHOWN - fixes.length))
  const fixed = fixes.slice(0, SHOWN - added.length)
  const listed = added.length + fixed.length

  return Option.some({
    added: added.map(item),
    fixed: fixed.map(item),
    total: cut === -1 ? listed : notes.length,
    more: cut === -1 || listed < notes.length ? `${REPOSITORY}/compare/${previous}...${embedded.sha}` : undefined,
  })
}

/** The beta run number of a version such as `0.0.0-beta-21180`, or the version itself. */
export function betaBuild(version: string) {
  return version.match(/^v?0\.0\.0-(?:beta|next)-(\d+(?:\.\d+)?)$/)?.[1] ?? version
}

function item(note: typeof Note.Type): BetaNote {
  const summary = note.summary.trim().replace(/\.$/, "")

  return {
    sha: note.sha,
    summary: summary.charAt(0).toUpperCase() + summary.slice(1),
    scope: note.scope,
    pr: note.pr === undefined ? undefined : { number: note.pr, url: `${REPOSITORY}/pull/${note.pr}` },
  }
}
