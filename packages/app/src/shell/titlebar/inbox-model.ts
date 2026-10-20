import { isSessionNotFoundError, type SessionInfo } from "@opencode/client/promise"
import { useQueries, useQueryClient } from "@tanstack/solid-query"
import { createStore } from "solid-js/store"
import { createEffect, createMemo, createSignal, onCleanup, startTransition } from "solid-js"
import { useGlobal } from "@/runtime/server/runtime"
import { ServerConnection, useServers } from "@/runtime/server/registry"
import { useLanguage } from "@/runtime/i18n/language"
import { projectSettingsKey, useSettings } from "@/settings/model"
import { useLayout } from "@/shell/state/layout"
import { useTabs } from "@/shell/tabs/tabs"
import { sessionBusy, sessionRequests } from "@/shell/layout/project-avatar-state"
import { pathKey } from "@/workspaces/path-key"
import { notifySessionTabsRemoved } from "./session-events"
import { loadHomeSessionIndex } from "@/home/sessions/index"
import { archiveHomeSession } from "@/home/sessions/archive"
import { sessionFormRequest, sessionPermissionRequest, sessionTreeIDs } from "@/session/requests/session-request-tree"
import { errorMessage } from "@/shell/layout/helpers"
import { showToast } from "@/shell/notifications/toast"

// Keep the immutable result opaque so Solid Query does not recursively unwrap every session.
const selectSessions = (sessions: SessionInfo[]) => () => sessions

// Branch lookups each run git on the server, so load them a few at a time.
const BRANCH_BATCH = 4

// The Home index excludes archived sessions, so the inbox loads the newest archived ones separately.
const ARCHIVED_LIMIT = 50

export type InboxStatus = "approval" | "input" | "working" | "failed" | "done" | "ready"

export type InboxEntry = {
  key: string
  conn: ServerConnection.Any
  server: ServerConnection.Key
  ctx: ReturnType<ReturnType<typeof useGlobal>["ensureServerCtx"]>
  session: SessionInfo
  status: InboxStatus
}

/**
 * Root sessions across every visible server with the state a person acts on: waiting for an answer, working,
 * finished and unread, or read. Shared by the sidebar inbox and the new session start screen.
 */
export function createSessionInbox(input: { archived?: boolean } = {}) {
  const global = useGlobal()
  const servers = useServers()
  const settings = useSettings()
  const layout = useLayout()
  const tabs = useTabs()
  const language = useLanguage()
  const queryClient = useQueryClient()

  const [now, setNow] = createSignal(Date.now())
  const timer = setInterval(() => setNow(Date.now()), 1_000)
  onCleanup(() => clearInterval(timer))

  const connections = createMemo(() => servers.visible.map((conn) => ({ conn, ctx: global.ensureServerCtx(conn) })))

  // The inbox stays mounted and rarely refetches the index, so drop sessions the server no longer has.
  const forget = (conn: ServerConnection.Any, sessionID: string) => {
    queryClient.setQueryData<SessionInfo[]>(["home-sessions", conn], (current) =>
      current?.filter((session) => session.id !== sessionID),
    )
    queryClient.setQueryData<SessionInfo[]>(["inbox-archived-sessions", conn], (current) =>
      current?.filter((session) => session.id !== sessionID),
    )
  }

  createEffect(() => {
    connections().forEach((item) => {
      onCleanup(item.ctx.data.on("session.deleted", (event) => forget(item.conn, event.data.sessionID)))
    })
  })

  // Shares the Home query cache so renames and deletions there refresh the inbox too.
  const queries = useQueries(() => ({
    queries: connections().map((item) => ({
      queryKey: ["home-sessions", item.conn] as const,
      enabled: item.ctx.sdk.connection.status() === "connected",
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        loadHomeSessionIndex((list, options) => item.ctx.sdk.api.session.list(list, options), signal),
      retry: false,
      staleTime: 30_000,
      refetchOnMount: true,
      refetchOnReconnect: true,
      select: selectSessions,
    })),
  }))

  const archivedQueries = useQueries(() => ({
    queries: connections().map((item) => ({
      queryKey: ["inbox-archived-sessions", item.conn] as const,
      enabled: !!input.archived && item.ctx.sdk.connection.status() === "connected",
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        item.ctx.sdk.api.session
          .list({ limit: ARCHIVED_LIMIT, order: "desc", parentID: null, archived: true }, { signal })
          .then((response) => response.data),
      retry: false,
      staleTime: 30_000,
      refetchOnMount: true,
      refetchOnReconnect: true,
      select: selectSessions,
    })),
  }))

  const entries = createMemo(() =>
    connections()
      .flatMap((item, index) => {
        const data = item.ctx.data
        const notification = item.ctx.notification.session
        const server = ServerConnection.key(item.conn)

        // A root session counts as working while any session in its family is busy.
        const busyRoots = new Set(
          [...data.session.list().map((session) => session.id), ...data.session.active()]
            .filter((id) => sessionBusy(data, id))
            .map((id) => data.session.root(id)),
        )

        const status = (session: SessionInfo): InboxStatus => {
          const project = projectSettingsKey(item.ctx.sdk.scope, session.projectID)
          const requests = sessionRequests(data, session.id, true, settings.permissions.autoApproves(project))

          if (requests.permission) return "approval"

          if (requests.form) return "input"

          if (busyRoots.has(session.id)) return "working"

          if (!notification.unread(session.id, session)) return "ready"

          return session.outcome === "failed" ? "failed" : "done"
        }

        // Locally known sessions come last so live archive and unarchive events win over cached indexes.
        const sessions = new Map(
          [
            ...(queries[index]?.data?.() ?? []),
            ...(input.archived ? (archivedQueries[index]?.data?.() ?? []) : []),
            ...data.session.list(),
          ].map((session) => [session.id, session] as const),
        )

        return data.session.apply([...sessions.values()].filter((session) => !session.parentID)).map(
          (session): InboxEntry => ({
            key: `${server}\0${session.id}`,
            conn: item.conn,
            server,
            ctx: item.ctx,
            session,
            status: status(session),
          }),
        )
      })
      .toSorted((a, b) => b.session.time.updated - a.session.time.updated),
  )

  // Pending permissions and questions only load for sessions the client has opened. A running session may be waiting
  // on one, so load them for every working root; events keep them current from then on.
  createEffect(() => {
    entries().forEach((entry) => {
      if (entry.status !== "working") return
      void entry.ctx.data.session.permission.sync(entry.session.id).catch(() => undefined)
      void entry.ctx.data.session.form.sync(entry.session.id).catch(() => undefined)
    })
  })

  // Rows are keyed by stable strings so live session updates do not remount them.
  const byKey = createMemo(() => new Map(entries().map((entry) => [entry.key, entry])))

  const selected = (entry: InboxEntry) => {
    const route = layout.route()

    if (route.type !== "session" || route.server !== entry.server) return false

    return route.sessionId === entry.session.id || entry.ctx.data.session.root(route.sessionId) === entry.session.id
  }

  // Git info is not stored on the session, so load it for the rows a view shows and mark each location settled once
  // its load ends.
  const [vcs, setVcs] = createStore({ settled: {} as Record<string, true> })
  const queued = new Set<string>()
  const queue: InboxEntry[] = []
  const drain = { running: false }

  const run = async () => {
    if (drain.running) return
    drain.running = true

    while (queue.length) {
      await Promise.all(
        queue.splice(0, BRANCH_BATCH).map((entry) =>
          entry.ctx.data.location.vcs
            .sync(entry.session.location)
            .catch(() => undefined)
            .then(() => setVcs("settled", locationKey(entry), true)),
        ),
      )
    }

    drain.running = false
  }

  const loadBranches = (list: InboxEntry[]) => {
    list.forEach((entry) => {
      const key = locationKey(entry)

      if (queued.has(key)) return
      queued.add(key)
      queue.push(entry)
    })
    void run()
  }

  const open = (entry: InboxEntry) => {
    const directory = entry.ctx.projects.forSession(entry.session)?.worktree ?? entry.session.location.directory
    void entry.ctx.data.session.message.sync(entry.session.id).catch((error: unknown) => {
      if (isSessionNotFoundError(error)) forget(entry.conn, entry.session.id)
    })
    void startTransition(() => {
      tabs.select(tabs.addSessionTab({ server: entry.server, sessionId: entry.session.id }))
      entry.ctx.data.session.remember(entry.session)
      entry.ctx.projects.touch(directory)
    })
  }

  // Move the session between the cached indexes so it changes section before either refetches.
  const move = (entry: InboxEntry, archivedAt: number | undefined) => {
    const session = { ...entry.session, time: { ...entry.session.time, archived: archivedAt } }

    forget(entry.conn, entry.session.id)
    queryClient.setQueryData<SessionInfo[]>(
      [archivedAt === undefined ? "home-sessions" : "inbox-archived-sessions", entry.conn],
      (current) => current && [session, ...current],
    )
  }

  const requestFailed = (cause: unknown) =>
    showToast({
      title: language.t("common.requestFailed"),
      description: errorMessage(cause, language.t("common.requestFailed")),
    })

  // The pending request anywhere in the session's family, for views that answer it inline.
  const family = (entry: InboxEntry) =>
    [...new Set([entry.session.id, ...entry.ctx.data.session.family(entry.session.id)])].flatMap((id) => {
      const info = entry.ctx.data.session.get(id)

      return info ? [info] : []
    })

  return {
    now,
    entries,
    /** The first index load is still running on some connected server. */
    loading: () => queries.some((query) => query.isPending && query.fetchStatus !== "idle"),
    byKey,
    selected,
    open,
    loadBranches,
    branchLoading: (entry: InboxEntry) =>
      !vcs.settled[locationKey(entry)] && !entry.ctx.data.location.vcs.info(entry.session.location),
    branch: (entry: InboxEntry) =>
      entry.ctx.data.location.vcs.info(entry.session.location)?.branch.current ?? undefined,
    inWorktree: inboxInWorktree,
    permission: (entry: InboxEntry) =>
      sessionPermissionRequest(family(entry), entry.ctx.data.session.permission.list, entry.session.id),
    form: (entry: InboxEntry) => sessionFormRequest(family(entry), entry.ctx.data.session.form.list, entry.session.id),
    decide: (entry: InboxEntry, decision: "once" | "always" | "reject") => {
      const request = sessionPermissionRequest(family(entry), entry.ctx.data.session.permission.list, entry.session.id)

      if (!request) return
      void entry.ctx.sdk.api.permission
        .reply({ sessionID: request.sessionID, requestID: request.id, decision })
        .catch(requestFailed)
    },
    markViewed: (entry: InboxEntry) => entry.ctx.notification.session.markViewed(entry.session.id),
    archive: (entry: InboxEntry) =>
      archiveHomeSession({
        server: entry.server,
        session: entry.session,
        archive: (sessionID) => entry.ctx.sdk.api.session.update({ sessionID, archived: true }),
        remove: () => move(entry, Date.now()),
        onError: requestFailed,
      }),
    unarchive: (entry: InboxEntry) =>
      entry.ctx.sdk.api.session
        .update({ sessionID: entry.session.id, archived: false })
        .then(() => move(entry, undefined))
        .catch(requestFailed),
    remove: (entry: InboxEntry) => {
      const ids = sessionTreeIDs(entry.ctx.data.session.list(), entry.session.id)

      return entry.ctx.data.session
        .remove(entry.session.id)
        .then(() => {
          forget(entry.conn, entry.session.id)
          notifySessionTabsRemoved({ server: entry.server, directory: entry.session.location.directory, sessionIDs: ids })
        })
        .catch((cause) =>
          showToast({
            title: language.t("session.delete.failed.title"),
            description: errorMessage(cause, language.t("session.delete.failed.title")),
          }),
        )
    },
  }
}

export type SessionInbox = ReturnType<typeof createSessionInbox>

export function inboxArchived(entry: InboxEntry) {
  return typeof entry.session.time.archived === "number"
}

export function inboxBusy(status: InboxStatus) {
  return status === "working" || status === "approval" || status === "input"
}

function locationKey(entry: InboxEntry) {
  return `${entry.server}\0${pathKey(entry.session.location.directory)}`
}

export function inboxInWorktree(entry: InboxEntry) {
  const root = entry.ctx.projects.forSession(entry.session)?.worktree

  return !!root && pathKey(root) !== pathKey(entry.session.location.directory)
}
