import { createEffect, createMemo, startTransition } from "solid-js"
import { useGlobal } from "@/runtime/server/runtime"
import { ServerConnection, useServers } from "@/runtime/server/registry"
import type { Project } from "@/runtime/server/types"
import { useCommand } from "@/shell/commands/command"
import { useTabs } from "@/shell/tabs/tabs"
import { createSessionInbox, inboxArchived, type InboxEntry } from "@/shell/titlebar/inbox-model"
import { pathKey } from "@/workspaces/path-key"

const EARLIER_LIMIT = 8

const PROJECT_LIMIT = 10

export type StartProject = {
  key: string
  project: Project
  waiting: number
  running: number
  entries: InboxEntry[]
}

export type StartServer = {
  key: ServerConnection.Key
  conn: ServerConnection.Any
  projects: StartProject[]
}

/**
 * Home: sessions on every connected server, sorted by what they need from you, and each server's recent projects.
 * Needs you holds sessions the agent cannot continue without you: an approval, a question, or a failed run.
 */
export function createStartModel() {
  const global = useGlobal()
  const servers = useServers()
  const tabs = useTabs()
  const command = useCommand()
  const inbox = createSessionInbox()

  const live = createMemo(() => inbox.entries().filter((entry) => !inboxArchived(entry)))
  const byIdle = (a: InboxEntry, b: InboxEntry) => (b.session.time.idle ?? 0) - (a.session.time.idle ?? 0)

  const groups = createMemo(() => {
    const list = live()

    return {
      needs: [
        ...list.filter((entry) => entry.status === "approval" || entry.status === "input"),
        ...list.filter((entry) => entry.status === "failed").toSorted(byIdle),
      ],
      done: list.filter((entry) => entry.status === "done").toSorted(byIdle),
      working: list.filter((entry) => entry.status === "working"),
      earlier: list.filter((entry) => entry.status === "ready").slice(0, EARLIER_LIMIT),
    }
  })

  const projectOf = (entry: InboxEntry) =>
    entry.ctx.projects.forSession(entry.session)?.worktree ?? entry.session.location.directory

  // This computer first, then other servers in the order they were added.
  const ordered = createMemo(() =>
    servers.visible.toSorted((a, b) => Number(servers.current(b)) - Number(servers.current(a))),
  )

  // Each server's projects, most recently active first. Projects are added on the server, so Home only lists them.
  const projectServers = createMemo(() =>
    ordered()
      .map((conn): StartServer => {
        const key = ServerConnection.key(conn)

        return {
          key,
          conn,
          projects: global
            .ensureServerCtx(conn)
            .projects.unique()
            .map((project): StartProject => {
              const entries = live().filter(
                (entry) => entry.server === key && pathKey(projectOf(entry)) === pathKey(project.worktree),
              )

              return {
                key: `${key}\0${pathKey(project.worktree)}`,
                project,
                waiting: entries.filter((entry) => entry.status === "approval" || entry.status === "input").length,
                running: entries.filter((entry) => entry.status === "working").length,
                entries,
              }
            })
            .toSorted((a, b) => activity(b) - activity(a))
            .slice(0, PROJECT_LIMIT),
        }
      })
      .filter((server) => server.projects.length > 0),
  )

  // A server that does not answer contributes no sessions; say so instead of showing a shorter list.
  const unreachable = createMemo(() =>
    ordered().filter((conn) => {
      const health = global.servers.health[ServerConnection.key(conn)]

      return !!health && !health.checking && !health.healthy
    }),
  )

  // The account this computer's server runs as is the best name the app has for the person.
  const health = () => {
    const conn = ordered()[0]

    return conn ? global.servers.health[ServerConnection.key(conn)] : undefined
  }

  const name = createMemo(() => {
    const account = health()?.username

    return account ? account.charAt(0).toUpperCase() + account.slice(1) : undefined
  })

  // The client only refreshes `time.idle` for loaded sessions when a run ends, so load every working one.
  createEffect(() => {
    groups().working.forEach((entry) => {
      if (entry.ctx.data.session.get(entry.session.id)) return
      void entry.ctx.data.session.sync(entry.session.id).catch(() => undefined)
    })
  })

  return {
    inbox,
    groups,
    projectServers,
    unreachable,
    name,
    /** The greeting waits for the first health check, so the name never pops in after it. */
    greeted: () => !!health() && !health()?.checking,
    loading: inbox.loading,
    newSession: () => command.trigger("tab.new"),
    openProject: (server: StartServer, item: StartProject) => {
      global.ensureServerCtx(server.conn).projects.touch(item.project.worktree)
      void startTransition(() => {
        void tabs.newDraft({ server: server.key, directory: item.project.worktree })
      })
    },
    markAllViewed: () => groups().done.forEach(inbox.markViewed),
  }
}

export type StartModel = ReturnType<typeof createStartModel>

function activity(item: StartProject) {
  return Math.max(item.project.time.active, ...item.entries.map((entry) => entry.session.time.updated))
}
