import { describe, expect, test } from "bun:test"
import type { Tab } from "@/shell/tabs/tabs"
import { groupTabsByProject, reorderGroupedStrip, tabGroupVariant, type StripItem } from "./tab-groups"

const sessionTab = (id: string, server = "local"): Tab => ({
  type: "session",
  server: server as Tab["server"],
  sessionId: `ses_${id}`,
})

const draftTab = (id: string): Tab => ({ type: "draft", draftID: id, server: "local" as Tab["server"], directory: "/d" })

describe("groupTabsByProject", () => {
  test("keeps first-occurrence group order and within-group order", () => {
    const group = (tab: Tab) =>
      tab.type === "session" && tab.sessionId.endsWith("1")
        ? { id: "a", title: "Project A" }
        : tab.type === "session"
          ? { id: "b", title: "Project B" }
          : undefined

    const { groups, ungrouped } = groupTabsByProject(
      [sessionTab("x1"), sessionTab("y2"), draftTab("d3"), sessionTab("z1"), sessionTab("w2")],
      group,
    )

    expect(groups.map((item) => item.id)).toEqual(["a", "b"])
    expect(groups[0].tabs.filter((tab) => tab.type === "session").map((tab) => tab.sessionId)).toEqual([
      "ses_x1",
      "ses_z1",
    ])
    expect(groups[1].tabs.filter((tab) => tab.type === "session").map((tab) => tab.sessionId)).toEqual([
      "ses_y2",
      "ses_w2",
    ])
    expect(ungrouped.map((tab) => tab.type)).toEqual(["draft"])
  })

  test("merges tabs of the same project across the strip and trails unresolvable tabs", () => {
    const group = (tab: Tab) =>
      tab.type === "session" ? { id: tab.sessionId.slice(-1)!, title: `Project ${tab.sessionId.slice(-1)}` } : undefined

    const { groups, ungrouped } = groupTabsByProject(
      [sessionTab("a1"), draftTab("d"), sessionTab("b2"), sessionTab("c1")],
      group,
    )

    expect(groups.map((item) => item.id)).toEqual(["1", "2"])
    expect(groups[1].title).toBe("Project 2")
    expect(ungrouped.map((tab) => tab.type)).toEqual(["draft"])
  })

  test("keys groups per server so the same directory on two servers stays separate", () => {
    const group = (tab: Tab) =>
      tab.type === "session" ? { id: `${tab.server}\0${tab.sessionId.slice(-1)}`, title: tab.server } : undefined

    const { groups } = groupTabsByProject([sessionTab("a1", "local"), sessionTab("b1", "remote")], group)

    expect(groups).toHaveLength(2)
  })
})

describe("tabGroupVariant", () => {
  test("an explicit project color wins and the id hashes stably onto the palette", () => {
    expect(tabGroupVariant("id", "orange")).toBe("orange")
    expect(tabGroupVariant("id")).toBe(tabGroupVariant("id"))
    expect(tabGroupVariant("id")).not.toBe("gray")

    const variants = new Set(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"].map((id) => tabGroupVariant(id)))

    expect(variants.size).toBeGreaterThan(1)
  })
})

describe("reorderGroupedStrip", () => {
  // a3 stays collapsed out of the rendered sequence but still belongs to group "a".
  const keys = ["a1", "a2", "a3", "b1"]
  const membership = new Map([
    ["a1", "a"],
    ["a2", "a"],
    ["a3", "a"],
    ["b1", "b"],
  ])
  const sequence: StripItem[] = [
    { kind: "group", id: "a" },
    { kind: "tab", key: "a1", group: "a" },
    { kind: "tab", key: "a2", group: "a" },
    { kind: "group", id: "b" },
    { kind: "tab", key: "b1", group: "b" },
  ]
  const input = (from: number, to: number, items: StripItem[] = sequence, order: string[] = keys) => ({
    keys: order,
    membership,
    sequence: items,
    from,
    to,
  })

  test("a header drag moves the whole group, collapsed members included", () => {
    expect(reorderGroupedStrip(input(3, 0))).toEqual(["b1", "a1", "a2", "a3"])
  })

  test("a tab drag reorders it within its own group", () => {
    expect(reorderGroupedStrip(input(2, 1))).toEqual(["a2", "a1", "a3", "b1"])
  })

  test("a tab dropped inside another group is rejected", () => {
    expect(reorderGroupedStrip(input(1, 4))).toBeUndefined()
  })

  test("a tab dragged within the ungrouped tail reorders it", () => {
    const tail: StripItem[] = [
      ...sequence,
      { kind: "tab", key: "u1", group: undefined },
      { kind: "tab", key: "u2", group: undefined },
    ]

    expect(reorderGroupedStrip(input(6, 5, tail, [...keys, "u1", "u2"]))).toEqual(["a1", "a2", "a3", "b1", "u2", "u1"])
  })

  test("a no-op drag returns the order unchanged", () => {
    expect(reorderGroupedStrip(input(1, 1))).toBe(keys)
  })

  test("a tab dropped at a foreign group boundary it cannot honor is rejected", () => {
    // a2 lands between group b's header and its member: no same-group
    // neighbor on either side, so the drag snaps back.
    expect(reorderGroupedStrip(input(2, 3))).toBeUndefined()
  })

  test("a tab dragged to the first and last slot of its own group reorders it", () => {
    expect(reorderGroupedStrip(input(1, 2))).toEqual(["a2", "a1", "a3", "b1"])
    expect(reorderGroupedStrip(input(2, 1))).toEqual(["a2", "a1", "a3", "b1"])
  })

  test("a header dropped inside another group's segment without changing header order is a no-op", () => {
    expect(reorderGroupedStrip(input(3, 1))).toEqual(keys)
  })
})
