import { describe, expect, test } from "bun:test"
import type { SessionInfo } from "@opencode/client/promise"
import type { LocalProject } from "@/shell/state/layout"
import { pathKey } from "@/workspaces/path-key"
import { groupHomeSessionsByProject } from "./grouping"
import { buildHomeSessionRecords } from "./records"

const session = (id: string, directory: string, updated: number) =>
  ({
    id,
    title: id,
    location: { directory },
    time: { created: updated, updated },
  }) as SessionInfo

describe("groupHomeSessionsByProject", () => {
  test("orders groups by most recent session and keeps recency order inside each", () => {
    const records = buildHomeSessionRecords({
      sessions: () => [session("a-new", "/repo/a", 3), session("b-new", "/repo/b", 2), session("a-old", "/repo/a", 1)],
      projectDirectories: () => undefined,
      projects: () => [],
    })

    const groups = groupHomeSessionsByProject(records)

    expect(groups.map((group) => group.id)).toEqual([pathKey("/repo/a"), pathKey("/repo/b")])
    expect(groups.map((group) => group.title)).toEqual(["a", "b"])
    expect(groups[0].sessions.map((record) => record.session.id)).toEqual(["a-new", "a-old"])
    expect(groups[1].sessions.map((record) => record.session.id)).toEqual(["b-new"])
  })

  test("groups sandbox sessions under their parent project", () => {
    const project = {
      id: "project-a",
      worktree: "/repo/a",
      sandboxes: ["/repo/a/.sandbox"],
      expanded: true,
    } as LocalProject

    const records = buildHomeSessionRecords({
      sessions: () => [session("sandbox", "/repo/a/.sandbox", 2), session("main", "/repo/a", 1)],
      projectDirectories: () => undefined,
      projects: () => [project],
    })

    const groups = groupHomeSessionsByProject(records)

    expect(groups).toHaveLength(1)
    expect(groups[0].id).toBe(pathKey("/repo/a"))
    expect(groups[0].project?.worktree).toBe("/repo/a")
    expect(groups[0].sessions.map((record) => record.session.id)).toEqual(["sandbox", "main"])
  })
})
