import { getProjectAvatarVariant, PROJECT_AVATAR_VARIANTS, type ProjectAvatarVariant } from "@opencode/ui/project-avatar"
import type { LocalProject } from "@/shell/state/layout"
import type { Tab } from "@/shell/tabs/tabs"

export type TabGroup = {
  id: string
  title: string
  project?: LocalProject
  variant?: ProjectAvatarVariant
  tabs: Tab[]
}

// Stable partition of the strip order: groups appear in first-occurrence
// order, each keeps its members' relative order, and tabs the resolver cannot
// place trail every group so loading tabs never block the grouped view.
export function groupTabsByProject(tabs: Tab[], group: (tab: Tab) => Omit<TabGroup, "tabs"> | undefined) {
  const keyed = Map.groupBy(
    tabs.map((tab) => ({ tab, info: group(tab) })),
    (item) => item.info?.id,
  )

  return {
    groups: [...keyed.entries()].flatMap(([, items]) =>
      items[0].info ? [{ ...items[0].info, tabs: items.map((item) => item.tab) }] : [],
    ),
    ungrouped: (keyed.get(undefined) ?? []).map((item) => item.tab),
  }
}

const VARIANT_PALETTE = PROJECT_AVATAR_VARIANTS.filter((variant) => variant !== "gray")

// An explicit project color wins; otherwise the group id hashes onto the
// non-gray avatar palette so sibling projects contrast and stay stable.
export function tabGroupVariant(id: string, color?: string): ProjectAvatarVariant {
  if (color) {
    const variant = getProjectAvatarVariant(color)

    if (variant !== "gray") return variant
  }

  // Java's String.hashCode multiplier: spreads short group ids well.
  let hash = 0
  for (let index = 0; index < id.length; index++) hash = (hash * 31 + id.charCodeAt(index)) | 0

  return VARIANT_PALETTE[Math.abs(hash) % VARIANT_PALETTE.length]!
}

/** One entry per rendered strip item: a group header, or a tab and the group it renders under. */
export type StripItem = { kind: "group"; id: string } | { kind: "tab"; key: string; group: string | undefined }

/**
 * Reorders the persisted strip order after a grouped drag. Group headers
 * move their whole project, collapsed members included; tabs move only
 * within their own group, because membership is derived from the session's
 * project. Returns undefined when a tab was dropped into another group, so
 * the drag snaps back instead of splitting a project. `membership` maps each
 * tab key to its group id; keys without an entry are the ungrouped tail.
 */
export function reorderGroupedStrip(input: {
  keys: string[]
  membership: Map<string, string>
  sequence: StripItem[]
  from: number
  to: number
}): string[] | undefined {
  const source = input.sequence[input.from]

  if (!source || input.from === input.to) return input.keys

  if (source.kind === "group") {
    const order = [...input.sequence]
    const [moved] = order.splice(input.from, 1)
    order.splice(input.to, 0, moved)
    const groupOrder = order.flatMap((item) => (item.kind === "group" ? [item.id] : []))

    return [
      ...groupOrder.flatMap((id) => input.keys.filter((key) => input.membership.get(key) === id)),
      ...input.keys.filter((key) => !input.membership.has(key)),
    ]
  }

  // A tab only moves where the derived grouping renders it: inside a
  // segment of its own group's tabs, or beside a same-group neighbor.
  const candidate = [...input.sequence]
  const [moved] = candidate.splice(input.from, 1)
  candidate.splice(input.to, 0, moved)

  let start = input.to
  while (start > 0 && candidate[start - 1]?.kind === "tab") start--
  let end = input.to
  while (end < candidate.length - 1 && candidate[end + 1]?.kind === "tab") end++

  const segment = candidate
    .slice(start, end + 1)
    .filter((item): item is Extract<StripItem, { kind: "tab" }> => item.kind === "tab")

  const neighbor = (offset: -1 | 1) => {
    const item = candidate[input.to + offset]

    return item?.kind === "tab" ? item : undefined
  }
  const previous = neighbor(-1)
  const next = neighbor(1)

  if (segment.some((item) => item.key !== source.key && item.group !== source.group)) {
    if (previous?.group !== source.group && next?.group !== source.group) return
  }

  const keys = input.keys.filter((key) => key !== source.key)

  if (next) {
    keys.splice(keys.indexOf(next.key), 0, source.key)

    return keys
  }

  if (previous) {
    keys.splice(keys.indexOf(previous.key) + 1, 0, source.key)

    return keys
  }

  return input.keys
}
