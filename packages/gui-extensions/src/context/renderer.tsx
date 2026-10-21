import { lazy, onCleanup, onMount, Show, Suspense } from "solid-js"
import { createStore } from "solid-js/store"
import { Tooltip } from "@opencode/ui/tooltip"
import { Command, onIdle, Panel, Slot, usePanel, type PanelTab, type Setup, type SlotMap } from "../sdk"
import type definition from "./index"
import { SessionContextButton, SessionContextUsage } from "./indicator"

const setup: Setup<typeof definition> = (ctx) => {
  const [draft, setDraft] = createStore<{ header?: SlotMap["new-session.header"] }>({})
  const SessionContextTab = lazy(() => import("./tab"))
  // Compile the tab while the app idles, so the first open renders at once.
  onCleanup(onIdle(() => void SessionContextTab.preload()))

  // One tab object for every session, so neither strip updates nor a session switch remount its trigger; the label
  // reads the routed session from its state.
  const tab: PanelTab = {
    id: "main",
    get title() {
      return ctx.t("tab.title")
    },
    draggable: false,
    closable: "compact",
    first: true,
    fallback: true,
    label: (state) => (
      <div class="flex items-center gap-2">
        <SessionContextUsage session={state.session} variant="indicator" />
        <div>{ctx.t("tab.title")}</div>
      </div>
    ),
  }

  ctx.add(
    Command,
    (): Command => ({
      id: "toggle",
      title: ctx.t("usage.toggle"),
      group: ctx.t("command.category.view"),
      section: "session",
      enabled: !!ctx.sessions.current() || !!draft.header,
      run() {
        const session = ctx.sessions.current()

        if (!session) return draft.header?.start(`${ctx.id}.toggle`)
        ctx.layout.toggle(`${ctx.id}:main`, session)
      },
    }),
  )
  ctx.add(Slot, {
    at: "new-session.header",
    order: 10,
    render(input) {
      onMount(() => setDraft("header", input))
      onCleanup(() => setDraft("header", undefined))

      return (
        <Tooltip placement="bottom" value={ctx.t("usage.toggle")}>
          <SessionContextButton
            opened={false}
            disabled={input.opening}
            onToggle={() => void input.start(`${ctx.id}.toggle`)}
          />
        </Tooltip>
      )
    },
  })

  ctx.add(Slot, {
    at: "session.header",
    order: 10,
    render: (input) => <SessionContextUsage session={input.session} placement="bottom" />,
  })

  ctx.add(
    Panel,
    (): Panel => ({
      id: "main",
      region: "side",
      // Stored before extensions as "context", then under the extension's earlier id `usage`.
      legacy: { context: "main", "usage:context": "main" },
      mobile: { title: ctx.t("mobile.title"), order: 40, kind: "menu", icon: "status" },
      list: (input) => (input.open.includes("main") ? [tab] : []),
      render: (props) => {
        const panel = usePanel()

        return (
          <Show
            when={panel.placement() !== "mobile"}
            fallback={
              <Suspense>
                <SessionContextTab session={props.session} />
              </Suspense>
            }
          >
            <div class="relative pt-2 flex-1 min-h-0 overflow-hidden">
              <Suspense>
                <SessionContextTab session={props.session} />
              </Suspense>
            </div>
          </Show>
        )
      },
    }),
  )
}

export default setup
