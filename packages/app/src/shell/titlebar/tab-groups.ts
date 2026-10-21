import type { LocalProject } from "@/shell/state/layout"
import type { Tab } from "@/shell/tabs/tabs"

export type TabGroup = {
  id: string
  title: string
  project?: LocalProject
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
