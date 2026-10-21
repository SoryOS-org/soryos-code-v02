import { createEffect, createMemo, createResource, For, Index, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { DragDropProvider, PointerSensor } from "@dnd-kit/solid"
import { isSortable, useSortable } from "@dnd-kit/solid/sortable"
import { Accessibility, AutoScroller, Feedback, PointerActivationConstraints } from "@dnd-kit/dom"
import { RestrictToHorizontalAxis, RestrictToVerticalAxis } from "@dnd-kit/abstract/modifiers"
import { RestrictToElement } from "@dnd-kit/dom/modifiers"
import { arrayMove } from "@dnd-kit/helpers"
import { Schema } from "effect"
import { tabHref, tabKey, type SessionTab, type Tab } from "@/shell/tabs/tabs"
import { ServerConnection } from "@/runtime/server/registry"
import { DraftTabItem, TabNavItem } from "@/shell/titlebar/tab-nav"
import { useGlobal, useServerCtx, type ServerCtx } from "@/runtime/server/runtime"
import { useLanguage } from "@/runtime/i18n/language"
import { useCommand } from "@/shell/commands/command"
import { useTabs } from "@/shell/tabs/tabs"
import { useSessionTabAvatarState } from "@/shell/layout/project-avatar-state"
import { createTabComposerState } from "@/composer/persistence"
import { base64Encode } from "@opencode/util/encode"
import { showToast } from "@/shell/notifications/toast"
import { Persist, persisted } from "@/runtime/persistence/storage"
import { Persistence } from "@/runtime/persistence/schema"
import { Icon } from "@opencode/ui/icon"
import {
  displayName,
  getProjectAvatarSource,
  ProjectAvatar,
  type ProjectAvatarVariant,
} from "@opencode/ui/project-avatar"
import { Tooltip } from "@opencode/ui/tooltip"
import { useSettings } from "@/settings/model"
import { pathKey } from "@/workspaces/path-key"
import { adjacentTabKey, mergeVisibleTabOrder } from "./tab-order"
import { groupTabsByProject, reorderGroupedStrip, tabGroupVariant, type StripItem, type TabGroup } from "./tab-groups"
import type { SessionInfo } from "@opencode/client/promise"

export const TabGroupsViewSchema = Persistence.struct({
  collapsed: Persistence.record(Persistence.fallback(Schema.Boolean, () => false)),
})

function SessionTabSlot(props: {
  tab: SessionTab
  id: string
  index: number
  active: boolean
  orientation: "horizontal" | "vertical"
  session: SessionInfo | undefined
  preparing: boolean
  unread: boolean
  loading: boolean
  fallbackTitle?: string
  accent?: ProjectAvatarVariant
  showProjectAvatar?: boolean
  onRename: (title: string) => Promise<void>
  onNavigate: (element: HTMLDivElement) => void
  onClose: () => void
}) {
  const sortable = useSortable({
    get id() {
      return props.id
    },
    get index() {
      return props.index
    },
  })

  let ref!: HTMLDivElement

  return (
    <div
      ref={sortable.ref}
      data-titlebar-tab-slot
      data-tab-key={props.id}
      data-active={props.active}
      data-orientation={props.orientation}
      class="relative flex"
      classList={{
        "w-56 min-w-7 max-w-56 flex-shrink": props.orientation === "horizontal",
        "w-full shrink-0": props.orientation === "vertical",
      }}
    >
      <TabNavItem
        ref={(el) => {
          ref = el
        }}
        href={tabHref(props.tab)}
        server={props.tab.server}
        session={props.session}
        preparing={props.preparing}
        unread={props.unread}
        loading={props.loading}
        fallbackTitle={props.fallbackTitle}
        onRename={props.onRename}
        onNavigate={() => props.onNavigate(ref)}
        onClose={props.onClose}
        active={props.active}
        dragging={sortable.isDragSource()}
        orientation={props.orientation}
        accent={props.accent}
        showProjectAvatar={props.showProjectAvatar}
      />
    </div>
  )
}

function SessionTabEntry(props: {
  tab: SessionTab
  id: string
  index: number
  active: boolean
  orientation: "horizontal" | "vertical"
  serverCtx: ServerCtx | undefined
  accent?: ProjectAvatarVariant
  showProjectAvatar?: boolean
  onVisibleChange: (visible: boolean) => void
  onUnreadChange: (unread: boolean) => void
  onNavigate: (element: HTMLDivElement) => void
  onClose: () => void
}) {
  const tabs = useTabs()
  const language = useLanguage()
  const sdk = createMemo(() => props.serverCtx?.sdk ?? null)
  const pending = createMemo(() => tabs.pendingSession(props.tab.server, props.tab.sessionId))
  const cachedSession = createMemo(() => props.serverCtx?.data.session.get(props.tab.sessionId))
  const persisted = createMemo(() => tabs.info[props.id])

  const status = useSessionTabAvatarState(
    () => props.tab.server,
    () => props.tab.sessionId,
    () => true,
  )

  // A busy session shows its progress indicator instead of the unread dot.
  const unread = createMemo(() => status.unread() && !status.loading())

  const [loadedSession] = createResource(
    () => {
      if (pending()) return null
      const ctx = props.serverCtx

      return ctx ? { id: props.tab.sessionId, ctx } : null
    },
    ({ id, ctx }) =>
      ctx.data.session
        .sync(id)
        .then(() => ctx.data.session.get(id))
        .catch(() => undefined),
  )

  const session = createMemo(() => (pending() ? undefined : (cachedSession() ?? loadedSession())))
  const missingSession = createMemo(() => !pending() && !!props.serverCtx && !loadedSession.loading && !session())
  const visible = createMemo(() => !!pending() || !!session() || missingSession() || !!persisted()?.title)

  const rename = async (title: string) => {
    const value = session()
    const ctx = props.serverCtx

    if (!value || !ctx) return

    ctx.data.session.remember({ ...value, title })

    try {
      await ctx.sdk.api.session.update({ sessionID: value.id, title })
    } catch (err) {
      const current = session()
      const currentCtx = props.serverCtx

      if (current && currentCtx) currentCtx.data.session.remember({ ...current, title: value.title })
      showToast({
        title: language.t("common.requestFailed"),
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  createEffect(() => props.onVisibleChange(visible()))
  createEffect(() => props.onUnreadChange(unread()))

  createEffect(() => {
    const ctx = props.serverCtx
    const value = session()

    if (!ctx || !value || props.active || ctx.sdk.connection.status() !== "connected") return

    const timer = window.setTimeout(
      () =>
        void Promise.allSettled([
          ctx.data.session.sync(value.id, { children: true }),
          // The selected timeline loads the transcript; inactive tabs need attention, metadata, and the inbox,
          // whose waiting work keeps the tab busy.
          ctx.data.session.permission.sync(value.id),
          ctx.data.session.form.sync(value.id),
          ctx.data.session.pending.sync(value.id),
        ]),
      300 + props.index * 50,
    )

    onCleanup(() => window.clearTimeout(timer))
  })

  createEffect(() => {
    const value = session()

    if (!value) return
    tabs.rememberSessionInfo(
      props.tab,
      value,
      props.serverCtx?.data.session.message.list(value.id).some((message) => message.type === "user") ?? false,
    )
    const current = sdk()

    if (!current) return
    createTabComposerState(tabs, props.tab, current.scope, {
      dir: base64Encode(value.location.directory),
      id: value.id,
    })
  })

  return (
    <Show when={visible()}>
      <SessionTabSlot
        tab={props.tab}
        id={props.id}
        index={props.index}
        active={props.active}
        orientation={props.orientation}
        session={session()}
        preparing={!!pending()}
        unread={unread()}
        loading={status.loading()}
        fallbackTitle={
          pending()
            ? language.t("session.tab.session")
            : (persisted()?.title ?? (missingSession() ? language.t("session.tab.unknown") : undefined))
        }
        accent={props.accent}
        showProjectAvatar={props.showProjectAvatar}
        onRename={rename}
        onNavigate={props.onNavigate}
        onClose={props.onClose}
      />
    </Show>
  )
}

function DraftTabSlot(props: {
  tab: Extract<Tab, { type: "draft" }>
  id: string
  index: number
  active: boolean
  orientation: "horizontal" | "vertical"
  title: string
  accent?: ProjectAvatarVariant
  onNavigate: (element: HTMLDivElement) => void
  onClose: () => void
}) {
  const sortable = useSortable({
    get id() {
      return props.id
    },
    get index() {
      return props.index
    },
  })

  let ref!: HTMLDivElement

  return (
    <div
      ref={sortable.ref}
      data-titlebar-tab-slot
      data-tab-key={props.id}
      data-active={props.active}
      data-orientation={props.orientation}
      class="relative flex"
      classList={{
        "w-56 min-w-7 max-w-56 flex-shrink": props.orientation === "horizontal",
        "w-full shrink-0": props.orientation === "vertical",
      }}
    >
      <DraftTabItem
        ref={(el) => {
          ref = el
        }}
        href={tabHref(props.tab)}
        title={props.title}
        onNavigate={() => props.onNavigate(ref)}
        onClose={props.onClose}
        active={props.active}
        dragging={sortable.isDragSource()}
        orientation={props.orientation}
        accent={props.accent}
      />
    </div>
  )
}

export function TitlebarTabStrip(props: {
  orientation?: "horizontal" | "vertical"
  tabs: Tab[]
  currentTab: Tab | undefined
  onNavigate: (tab: Tab, el?: HTMLDivElement) => void
  onClose: (tab: Tab) => void
  onReorder: (keys: string[]) => void
}) {
  const global = useGlobal()
  const language = useLanguage()
  const command = useCommand()
  const settings = useSettings()
  const tabs = useTabs()
  const vertical = () => props.orientation === "vertical"
  let listRef!: HTMLDivElement
  const [visibility, setVisibility] = createStore<Record<string, boolean>>({})
  const [unread, setUnread] = createStore<Record<string, boolean>>({})

  const grouped = () => settings.appearance.tabGroups() === "project"

  const [storedGroups, setStoredGroups] = persisted(
    Persist.window("tabs.groups"),
    TabGroupsViewSchema,
    { collapsed: {} },
  )
  const isGroupCollapsed = (id: string) => storedGroups.collapsed[id] ?? false
  const toggleGroupCollapsed = (id: string) =>
    setStoredGroups("collapsed", id, !(storedGroups.collapsed[id] ?? false))

  const groupOf = (tab: Tab) => {
    const conn = global.servers.list().find((item) => ServerConnection.key(item) === tab.server)
    const ctx = conn ? global.ensureServerCtx(conn) : undefined

    if (!ctx) return
    const session = tab.type === "session" ? ctx.data.session.get(tab.sessionId) : undefined
    const directory =
      tab.type === "draft"
        ? (tab.worktree ?? tab.directory)
        : (session?.location.directory ?? tabs.info[tabKey(tab)]?.directory)

    if (!directory) return
    const project =
      (session ? ctx.projects.forSession(session) : undefined) ??
      ctx.projects
        .list()
        .find(
          (item) =>
            pathKey(item.worktree) === pathKey(directory) ||
            item.sandboxes?.some((sandbox) => pathKey(sandbox) === pathKey(directory)),
        )
    // Groups key by the project, not the session directory, so worktree and
    // sandbox tabs land in the same group as the main worktree.
    const id = `${tab.server}\0${pathKey(project?.worktree ?? directory)}`

    return {
      id,
      title: displayName(project ?? { worktree: directory }),
      project,
      variant: tabGroupVariant(id, project?.icon?.color),
    }
  }

  // A stable partition of the persisted order: derived groups never reorder
  // tabs, so turning grouping off restores the user's own arrangement.
  const groupedTabs = createMemo(() => (grouped() ? groupTabsByProject(props.tabs, groupOf) : undefined))
  const orderedTabs = createMemo(() => {
    const result = groupedTabs()

    if (!result) return props.tabs
    return [
      ...result.groups.flatMap((group) => (isGroupCollapsed(group.id) ? [] : group.tabs)),
      ...result.ungrouped,
    ]
  })

  // Mirrors the rendered order below — every group header, each expanded
  // group's visible members, then the ungrouped tail — so sortable indexes
  // and drag results stay in sync with the DOM. Session tabs enter one frame
  // after their slot mounts (the entry reports visibility through an
  // effect, as the ungrouped indexes below have always done); the window
  // self-heals and only a drag started in that frame could see it.
  const groupedSequence = createMemo(() => {
    const result = groupedTabs()

    if (!result) return
    const items: StripItem[] = []
    const index = new Map<string, number>()

    for (const group of result.groups) {
      index.set(`group:${group.id}`, items.length)
      items.push({ kind: "group", id: group.id })

      if (!isGroupCollapsed(group.id)) {
        for (const tab of group.tabs) {
          const key = tabKey(tab)

          if (tab.type !== "draft" && !visibility[key]) continue
          index.set(key, items.length)
          items.push({ kind: "tab", key, group: group.id })
        }
      }
    }

    for (const tab of result.ungrouped) {
      const key = tabKey(tab)

      if (tab.type !== "draft" && !visibility[key]) continue
      index.set(key, items.length)
      items.push({ kind: "tab", key, group: undefined })
    }

    return { items, index }
  })

  const visibleTabs = createMemo(() => orderedTabs().filter((tab) => tab.type === "draft" || visibility[tabKey(tab)]))
  const visibleTabIds = () => visibleTabs().map(tabKey)

  command.register("titlebar-tab-cycle", () => [
    {
      id: `tab.prev`,
      category: "tab",
      title: "",
      keybind: `mod+option+ArrowLeft,ctrl+shift+tab`,
      hidden: true,
      onSelect: () => selectAdjacentTab(-1),
    },
    {
      id: `tab.next`,
      category: "tab",
      title: "",
      keybind: `mod+option+ArrowRight,ctrl+tab`,
      hidden: true,
      onSelect: () => selectAdjacentTab(1),
    },
    {
      id: "session.previous",
      category: language.t("command.category.session"),
      title: language.t("command.session.previous"),
      keybind: "alt+arrowup",
      onSelect: () => selectAdjacentTab(-1),
    },
    {
      id: "session.next",
      category: language.t("command.category.session"),
      title: language.t("command.session.next"),
      keybind: "alt+arrowdown",
      onSelect: () => selectAdjacentTab(1),
    },
    {
      id: "session.previous.unseen",
      category: language.t("command.category.session"),
      title: language.t("command.session.previous.unseen"),
      keybind: "shift+alt+arrowup",
      onSelect: () => selectAdjacentTab(-1, (key) => !!unread[key]),
    },
    {
      id: "session.next.unseen",
      category: language.t("command.category.session"),
      title: language.t("command.session.next.unseen"),
      keybind: "shift+alt+arrowdown",
      onSelect: () => selectAdjacentTab(1, (key) => !!unread[key]),
    },
  ])

  const renderTab = (tab: Tab, variant?: ProjectAvatarVariant) => {
    const id = tabKey(tab)
    let ref!: HTMLDivElement
    const visibleIndex = () => visibleTabs().findIndex((item) => tabKey(item) === id)
    const sortableIndex = () => groupedSequence()?.index.get(id) ?? visibleIndex()
    useTabShortcut(visibleIndex, () => props.onNavigate(tab, ref))

    const serverCtx = useServerCtx(() => {
      if (tab.type !== "session") return

      return global.servers.list().find((item) => ServerConnection.key(item) === tab.server)
    })

    if (tab.type === "session") {
      return (
        <SessionTabEntry
          tab={tab}
          id={id}
          index={sortableIndex()}
          active={props.currentTab === tab}
          orientation={vertical() ? "vertical" : "horizontal"}
          serverCtx={serverCtx()}
          accent={vertical() ? undefined : variant}
          showProjectAvatar={!vertical() || variant === undefined}
          onVisibleChange={(visible) => setVisibility(id, visible)}
          onUnreadChange={(value) => setUnread(id, value)}
          onNavigate={(element) => {
            ref = element
            props.onNavigate(tab, element)
          }}
          onClose={() => props.onClose(tab)}
        />
      )
    }

    return (
      <DraftTabSlot
        tab={tab}
        id={id}
        index={sortableIndex()}
        active={props.currentTab === tab}
        orientation={vertical() ? "vertical" : "horizontal"}
        title={language.t("session.tab.session")}
        accent={vertical() ? undefined : variant}
        onNavigate={(element) => {
          ref = element
          props.onNavigate(tab, element)
        }}
        onClose={() => props.onClose(tab)}
      />
    )
  }

  function selectAdjacentTab(offset: -1 | 1, include?: (key: string) => boolean) {
    const current = props.currentTab
    const key = adjacentTabKey(visibleTabIds(), current ? tabKey(current) : undefined, offset, include)
    const next = props.tabs.find((tab) => tabKey(tab) === key)

    if (next) props.onNavigate(next)
  }

  return (
    <div
      data-slot={vertical() ? "vertical-tabs" : "titlebar-tabs"}
      data-orientation={vertical() ? "vertical" : "horizontal"}
      class="relative min-w-0"
      classList={{ "min-h-0 overflow-hidden": vertical() }}
    >
      <div
        data-slot={vertical() ? "vertical-tabs-scroll" : "titlebar-tabs-scroll"}
        class="flex min-w-0 no-scrollbar [app-region:no-drag]"
        classList={{
          "flex-row items-center gap-1.5 overflow-x-auto": !vertical(),
          "max-h-full flex-col overflow-y-auto overflow-x-hidden": vertical(),
        }}
      >
        <DragDropProvider
          sensors={[
            PointerSensor.configure({
              activationConstraints: (event) =>
                event.pointerType === "touch"
                  ? [new PointerActivationConstraints.Distance({ value: 8 })]
                  : [new PointerActivationConstraints.Distance({ value: 4 })],
              preventActivation: (event) =>
                event.target instanceof Element &&
                !!event.target.closest('[data-slot="tab-close"], [contenteditable="true"]'),
            }),
          ]}
          modifiers={[
            vertical() ? RestrictToVerticalAxis : RestrictToHorizontalAxis,
            RestrictToElement.configure({ element: () => listRef }),
          ]}
          plugins={(defaults) => [
            ...defaults.filter((plugin) => plugin !== Accessibility),
            AutoScroller.configure({ acceleration: 8, threshold: vertical() ? { x: 0, y: 0.05 } : { x: 0.05, y: 0 } }),
            Feedback.configure({ dropAnimation: null }),
          ]}
          onDragStart={(event) => {
            const source = event.operation.source

            if (!source) return
            const tab = props.tabs.find((item) => tabKey(item) === source.id.toString())

            if (!tab) return

            if (vertical()) return
            const tabEl = source.element?.querySelector<HTMLDivElement>("[data-titlebar-tab]")
            props.onNavigate(tab, tabEl ?? undefined)
          }}
          onDragEnd={(event) => {
            const source = event.operation.source

            if (event.canceled || !isSortable(source)) return

            const { initialIndex, index } = source

            if (initialIndex === index) return

            const sequence = groupedSequence()

            if (sequence) {
              const membership = new Map<string, string>()
              const result = groupedTabs()

              for (const group of result?.groups ?? []) {
                for (const tab of group.tabs) membership.set(tabKey(tab), group.id)
              }

              const keys = reorderGroupedStrip({
                keys: props.tabs.map(tabKey),
                membership,
                sequence: sequence.items,
                from: initialIndex,
                to: index,
              })

              if (keys) props.onReorder(keys)

              return
            }

            const current = visibleTabIds()

            props.onReorder(
              mergeVisibleTabOrder(
                props.tabs.map(tabKey),
                current,
                arrayMove(current, source.initialIndex, source.index),
              ),
            )
          }}
        >
          <div
            data-titlebar-tab-list
            data-orientation={vertical() ? "vertical" : "horizontal"}
            class="flex w-full min-w-0"
            classList={{ "flex-row items-center": !vertical(), "flex-col items-stretch": vertical() }}
            ref={listRef}
          >
            <Show
              when={groupedTabs()}
              fallback={
                <For each={orderedTabs()}>
                  {(tab) => renderTab(tab)}
                </For>
              }
            >
              {(result) => (
                <>
                  {/* Index keeps group subtrees mounted when the grouped arrays
                      are rebuilt, so session syncs cannot recreate tab slots. */}
                  <Index each={result().groups}>
                    {(group) => (
                      <>
                        <TabGroupHeaderSlot
                          group={group()}
                          index={groupedSequence()?.index.get(`group:${group().id}`) ?? 0}
                          collapsed={isGroupCollapsed(group().id)}
                          vertical={vertical()}
                          onToggle={() => toggleGroupCollapsed(group().id)}
                        />
                        <Show when={!isGroupCollapsed(group().id)}>
                          <div
                            class="flex"
                            classList={{
                              "gap-1.5": !vertical(),
                              "w-full flex-col ps-4.5": vertical(),
                            }}
                          >
                            <For each={group().tabs}>
                              {(tab) => renderTab(tab, group().variant)}
                            </For>
                          </div>
                        </Show>
                      </>
                    )}
                  </Index>
                  <For each={result().ungrouped}>
                    {(tab) => renderTab(tab)}
                  </For>
                </>
              )}
            </Show>
          </div>
        </DragDropProvider>
      </div>
      <Show when={!vertical()}>
        <div
          data-slot="titlebar-tabs-fade-left"
          aria-hidden="true"
          class="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-[linear-gradient(to_right,var(--v2-background-bg-deep),transparent)]"
        />
        <div
          data-slot="titlebar-tabs-fade-right"
          aria-hidden="true"
          class="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-[linear-gradient(to_left,var(--v2-background-bg-deep),transparent)]"
        />
      </Show>
    </div>
  )
}

function TabGroupHeaderSlot(props: {
  group: TabGroup
  index: number
  collapsed: boolean
  vertical: boolean
  onToggle: () => void
}) {
  const sortable = useSortable({
    get id() {
      return `group:${props.group.id}`
    },
    get index() {
      return props.index
    },
  })

  return (
    <div
      ref={sortable.ref}
      data-tab-group-slot
      class="flex"
      classList={{ "w-full shrink-0": props.vertical, "shrink-0": !props.vertical }}
    >
      <TabGroupHeader
        group={props.group}
        collapsed={props.collapsed}
        vertical={props.vertical}
        dragging={sortable.isDragSource()}
        onToggle={props.onToggle}
      />
    </div>
  )
}

function TabGroupHeader(props: {
  group: TabGroup
  collapsed: boolean
  vertical: boolean
  dragging?: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      data-component="titlebar-tab-group"
      data-collapsed={props.collapsed || undefined}
      aria-expanded={!props.collapsed}
      aria-label={props.group.title}
      class={`
        flex min-w-0 shrink-0 items-center gap-1 rounded-[6px] border-0 bg-transparent text-start
        [font-weight:440] transition-[background-color] duration-[120ms] ease-in-out
        hover:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none
      `}
      classList={{
        // Horizontal groups show a one-character badge — the project mark in
        // the group's color — with the full name on hover; member tabs carry
        // the same color as an accent strip.
        "h-7 px-1.5": !props.vertical,
        // Vertical groups stay quiet and compact; sidebar space is precious.
        "h-5 w-full ps-1.5 pe-1 text-[11px] leading-4 text-v2-text-text-muted": props.vertical,
        "opacity-60": !!props.dragging,
      }}
      onClick={props.onToggle}
    >
      <span class="flex w-3.5 shrink-0 justify-center">
        <Icon
          name="chevron-down"
          size="small"
          aria-hidden="true"
          class="text-v2-icon-icon-muted transition-transform duration-150 ease-in-out"
          style={{ transform: `rotate(${props.collapsed ? -90 : 0}deg)` }}
        />
      </span>
      <span aria-hidden="true" class="flex shrink-0">
        <Show
          when={props.vertical}
          fallback={
            // The badge's name lives on hover. The tooltip wraps only the
            // avatar mark, with a span trigger so it stays valid inside the
            // button; wrapping the button itself would suppress the tooltip
            // through its expanded disclosure state.
            <Tooltip placement="bottom" value={props.group.title} triggerAs="span" class="flex">
              <ProjectAvatar
                fallback={props.group.project ? displayName(props.group.project) : props.group.title}
                src={getProjectAvatarSource(props.group.project?.id, props.group.project?.icon)}
                variant={props.group.variant ?? "gray"}
              />
            </Tooltip>
          }
        >
          <ProjectAvatar
            fallback={props.group.project ? displayName(props.group.project) : props.group.title}
            src={getProjectAvatarSource(props.group.project?.id, props.group.project?.icon)}
            variant={props.group.variant ?? "gray"}
          />
        </Show>
      </span>
      <Show when={props.vertical}>
        <span class="min-w-0 truncate">{props.group.title}</span>
      </Show>
    </button>
  )
}

function useTabShortcut(index: () => number, onSelect: () => void) {
  const command = useCommand()

  command.register(() => {
    const number = index() + 1

    if (number < 1 || number > 9) return []

    return [
      {
        id: `tab.${number}`,
        category: "tab",
        title: "",
        keybind: `mod+${number}`,
        hidden: true,
        onSelect,
      },
    ]
  })
}
