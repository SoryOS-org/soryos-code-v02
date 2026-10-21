import { describe, expect, test } from "bun:test"
import type { Tab } from "@/shell/tabs/tabs"
import { groupTabsByProject, type TabGroup } from "./tab-groups"

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

    const { groups, ungrouped } = groupTabsByProject([sessionTab("a1"), draftTab("d"), sessionTab("b2"), sessionTab("c1")], group)

    expect(groups.map((item: TabGroup) => item.id)).toEqual(["1", "2"])
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
