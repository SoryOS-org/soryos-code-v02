import { useDialog } from "@opencode/ui/context/dialog"
import { createSignal, onCleanup, Show, startTransition } from "solid-js"
import { useGlobal } from "@/runtime/server/runtime"
import { useLanguage } from "@/runtime/i18n/language"
import { ServerConnection, useServers } from "@/runtime/server/registry"
import { useTabs } from "@/shell/tabs/tabs"
import { createKnownServerSessions, createServerSessionEntries, type CommandPaletteEntry } from "./palette"
import { CommandPaletteView } from "./dialog"

const RECENT_LIMIT = 10

const RECENT_WAIT = 200

export function DialogSessionSearch() {
  const dialog = useDialog()
  const global = useGlobal()
  const language = useLanguage()
  const tabs = useTabs()
  const registry = useServers()

  const servers = registry.visible.filter(
    (conn) => global.servers.health[ServerConnection.key(conn)]?.healthy !== false,
  )

  const loaders = servers.map((conn) => {
    const ctx = global.ensureServerCtx(conn)

    const load = createServerSessionEntries({
      server: ServerConnection.key(conn),
      known: createKnownServerSessions(ctx),
      projects: ctx.projects.list,
      load: (search, signal) =>
        ctx.sdk.api.session.list({ parentID: null, search, archived: false, limit: 50 }, { signal }),
      get: (sessionID, signal) => ctx.sdk.api.session.get({ sessionID }, { signal }),
      untitled: () => language.t("command.session.new"),
      category: () => language.t("command.category.session"),
      recentCategory: () => language.t("palette.group.recentSessions"),
      recentLimit: RECENT_LIMIT,
    })

    const tag = registry.tag(conn)

    const format = (entries: CommandPaletteEntry[]) =>
      servers.length < 2 || !tag
        ? entries
        : entries.map((entry) => ({
            ...entry,
            description: language.t("palette.session.location", { project: entry.description ?? "", server: tag }),
          }))

    return {
      items: (query: string) => format(load.items(query)),
      search: (query: string) => load.search(query).then(format),
    }
  })

  const ranked = (query: string) => {
    const entries = loaders
      .flatMap((loader) => loader.items(query))
      .toSorted((a, b) => (b.updated ?? 0) - (a.updated ?? 0))

    return query ? entries : entries.slice(0, RECENT_LIMIT)
  }

  // The cached index can be stale, so rank recent sessions once each server's list arrives (or the wait runs out),
  // and keep that order while the dialog is open instead of reshuffling as fresher times come in.
  const [recent, setRecent] = createSignal<CommandPaletteEntry[]>()
  const wait = setTimeout(() => setRecent((current) => current ?? ranked("")), RECENT_WAIT)
  onCleanup(() => clearTimeout(wait))
  void Promise.all(loaders.map((loader) => loader.search("").catch(() => []))).then(() =>
    setRecent((current) => current ?? ranked("")),
  )

  const items = (query: string) => (query ? ranked(query) : (recent() ?? []))

  const sessions = async (query: string) => {
    if (!query) return []

    return (await Promise.all(loaders.map((loader) => loader.search(query))))
      .flat()
      .toSorted((a, b) => (b.updated ?? 0) - (a.updated ?? 0))
  }

  const select = (item: CommandPaletteEntry | undefined) => {
    if (!item?.sessionID || !item.server) return
    const sessionId = item.sessionID
    const server = item.server
    const directory = item.project?.worktree ?? item.directory
    const conn = servers.find((conn) => ServerConnection.key(conn) === server)
    dialog.close()

    if (conn && directory) global.ensureServerCtx(conn).projects.touch(directory)
    void startTransition(() => tabs.select(tabs.addSessionTab({ server, sessionId })))
  }

  return (
    <Show when={recent()}>
      <CommandPaletteView
        placeholder={language.t("home.sessions.search.placeholder")}
        items={items}
        sources={[sessions]}
        highlight={() => {}}
        select={select}
        close={() => dialog.close()}
      />
    </Show>
  )
}
