import type { LocalProject } from "@/shell/state/layout"
import { pathKey } from "@/workspaces/path-key"
import type { HomeSessionRecord } from "./records"

export type HomeSessionGroup = {
  id: string
  title: string
  sessions: HomeSessionRecord[]
  project?: LocalProject
}

// Records arrive sorted by session time, so first-seen order puts the most
// recently active project first, and each group keeps that recency order.
export function groupHomeSessionsByProject(records: HomeSessionRecord[]): HomeSessionGroup[] {
  return [...Map.groupBy(records, (record) => pathKey(record.project.worktree)).entries()].map(([id, sessions]) => ({
    id,
    title: sessions[0].projectName,
    project: sessions[0].project,
    sessions,
  }))
}
