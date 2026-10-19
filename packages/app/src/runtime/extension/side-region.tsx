import { For, Show, createEffect, createMemo, createSignal, on, onCleanup, untrack, type JSX } from "solid-js"
import { createMediaQuery } from "@solid-primitives/media"
import { createEventListener } from "@solid-primitives/event-listener"
import { DragDropProvider, PointerSensor } from "@dnd-kit/solid"
import { isSortable } from "@dnd-kit/solid/sortable"
import { Accessibility, AutoScroller, Feedback, PointerActivationConstraints } from "@dnd-kit/dom"
import { RestrictToHorizontalAxis } from "@dnd-kit/abstract/modifiers"
import { RestrictToElement } from "@dnd-kit/dom/modifiers"
import { Tabs } from "@opencode/ui/tabs"
import { IconButton } from "@opencode/ui/icon-button"
import { Icon } from "@opencode/ui/icon"
import { ResizeHandle } from "@opencode/ui/resize-handle"
import { Mark } from "@opencode/ui/logo"
import { Keybind } from "@opencode/ui/keybind"
import { Tooltip } from "@opencode/ui/tooltip"
import { Menu } from "@opencode/ui/menu"
import {
  type MountedSession,
  type SessionScreen,
  type PanelSidebar,
  type SessionPanelMenuItem,
} from "@opencode/gui-extensions/sdk"
import { useCommand } from "@/shell/commands/command"
import { useLanguage } from "@/runtime/i18n/language"
import { useLayout } from "@/shell/state/layout"
import { useSessionLayout } from "@/session/session-layout"
import type { Sizing } from "@/session/helpers"
import { PanelTrigger } from "./panel-trigger"
import { createSessionPanelMenu } from "./panel-menu"
import { RegionContent, type Region } from "./panels"
import { ExtensionSlot } from "./render"
import { createTabStripScroll } from "./tab-strip-scroll"

const FILE_TREE_WIDTH_MIN = 240

/** The side region: the tab strip with its "+" menu, the selected panel, and the inner sidebar. */
export function SideRegion(props: {
  view: MountedSession
  screen: SessionScreen
  region: Region
  sidebar: PanelSidebar
  fileTree: boolean
  present?: boolean
  size: Sizing
}) {
  const layout = useLayout()
  const language = useLanguage()
  const { tabs, view, params } = useSessionLayout()

  const isDesktop = createMediaQuery("(min-width: 768px)")
  const tabsOpen = createMemo(() => isDesktop() && view().side.opened())
  const tabsVisible = createMemo(() => tabsOpen() || !!props.present)
  const fileOpen = createMemo(() => isDesktop() && props.fileTree)
  const open = createMemo(() => tabsOpen() || fileOpen())
  const visible = createMemo(() => tabsVisible() || fileOpen())
  const fileTreeWidth = createMemo(() => Math.max(FILE_TREE_WIDTH_MIN, layout.fileTree.width()))

  const panelWidth = createMemo(() => {
    if (!visible()) return "0px"

    if (tabsVisible()) return "auto"

    return `${fileTreeWidth()}px`
  })

  const treeWidth = createMemo(() => (fileOpen() ? `${fileTreeWidth()}px` : "0px"))

  const menu = createSessionPanelMenu()
  const primary = createMemo(() => menu().find((item) => item.primary))
  const launchers = createMemo(() => menu().filter((item) => !item.primary && !item.opened))

  // Opening the side region with no tabs starts a new tab, once per opening and session. Keyed by the session, not the
  // item, whose object changes with every routed session.
  const starting = createMemo(() =>
    tabsOpen() && layout.ready() && props.region.empty() && primary() ? props.view.key : undefined,
  )

  createEffect(on(starting, (key) => key && untrack(primary)?.run()))

  // Without a new tab item, "+" opens a host-owned new tab view listing the launchers. It shows while the session and
  // the region's selection are the ones it opened over, so a tab that opens and selects itself replaces it.
  const [adding, setAdding] = createSignal<{ session: string; over: string | undefined }>()

  const newTab = createMemo(() => {
    const value = adding()

    return !!value && value.session === props.view.key && value.over === props.region.active()
  })

  // Once replaced, the view is gone: returning to the tab or session it opened over does not show it again.
  createEffect(on(newTab, (shown) => !shown && setAdding(undefined), { defer: true }))

  let root: HTMLElement | undefined
  let tabList: HTMLDivElement | undefined
  let selectionEvent: Event | undefined

  createEffect(() => {
    if (open()) return
    const active = document.activeElement

    if (!(active instanceof HTMLElement)) return

    if (!root?.contains(active)) return
    active.blur()
  })

  return (
    <Show when={isDesktop() && !!params.id}>
      <aside
        ref={root}
        id="review-panel"
        tabIndex={-1}
        aria-label={language.t("session.panel.reviewAndFiles")}
        aria-hidden={!open()}
        inert={!open()}
        class="relative h-full shrink-0 min-w-0 flex overflow-hidden bg-v2-background-bg-base rounded-[10px] shadow-[var(--v2-elevation-raised)] outline-none"
        classList={{
          "pointer-events-none": !open(),
          "flex-1": tabsVisible(),
        }}
        style={{ width: panelWidth() }}
      >
        <Show when={visible()}>
          <div
            data-slot="session-review-content"
            class="h-full flex shrink-0 contain-strict"
            style={{ width: "var(--session-side-content-width, 100%)" }}
          >
            <Show when={tabsVisible()}>
              <div class="relative min-w-0 h-full flex-1 overflow-hidden bg-v2-background-bg-base">
                <div class="size-full min-w-0 h-full bg-v2-background-bg-base">
                  <DragDropProvider
                    sensors={[
                      PointerSensor.configure({
                        activationConstraints: [new PointerActivationConstraints.Distance({ value: 4 })],
                        preventActivation: (event) =>
                          event.target instanceof Element &&
                          (!!event.target.closest('[data-slot="tabs-trigger-close-button"]') ||
                            !!event.target.closest(".session-review-v2-open-in-app-slot")),
                      }),
                    ]}
                    modifiers={[
                      RestrictToHorizontalAxis,
                      RestrictToElement.configure({ element: () => tabList ?? null }),
                    ]}
                    plugins={(defaults) => [
                      ...defaults.filter((plugin) => plugin !== Accessibility),
                      AutoScroller.configure({ acceleration: 8, threshold: { x: 0.05, y: 0 } }),
                      Feedback.configure({ dropAnimation: null }),
                    ]}
                    onDragEnd={(event) => {
                      const source = event.operation.source

                      if (event.canceled || !isSortable(source) || source.initialIndex === source.index) return
                      tabs().move(source.id.toString(), source.index)
                    }}
                  >
                    <Tabs
                      value={newTab() ? "new" : (props.region.active() ?? "empty")}
                      onChange={(value) => {
                        if (value === "new") return

                        // Kobalte selects the first tab while triggers register, including while the
                        // "+" menu's click is still dispatching. Persist input events on a tab only; the
                        // region owns fallback selection.
                        if (
                          selectionEvent &&
                          selectionEvent.eventPhase !== Event.NONE &&
                          selectionEvent.target instanceof Element &&
                          selectionEvent.target.closest('[role="tab"]')
                        ) {
                          setAdding(undefined)
                          props.region.select(value)
                        }
                      }}
                    >
                      <div class="session-review-v2-tabs-bar sticky top-0 shrink-0 flex items-center">
                        <Tabs.List
                          ref={(el: HTMLDivElement) => {
                            tabList = el
                            createEventListener(
                              el,
                              ["pointerdown", "click", "keydown"],
                              (event) => (selectionEvent = event),
                              { capture: true },
                            )
                            onCleanup(createTabStripScroll({ el, lead: props.region.lead }))
                          }}
                        >
                          <For each={props.region.keys()}>
                            {(key) => (
                              <Show when={props.region.entry(key)}>
                                {(entry) => (
                                  <PanelTrigger
                                    value={key}
                                    extension={entry().extension}
                                    tab={entry().tab}
                                    session={props.view}
                                    index={tabs().all().indexOf(key)}
                                    active={props.region.active() === key}
                                    preview={tabs().preview() === key}
                                    onClose={props.region.close}
                                    onPromote={(value) => void tabs().open(value)}
                                  />
                                )}
                              </Show>
                            )}
                          </For>
                          <Show when={newTab()}>
                            <Tabs.Trigger
                              value="new"
                              class="group"
                              onMiddleClick={() => setAdding(undefined)}
                              closeButton={
                                <IconButton
                                  size="small"
                                  variant="ghost-muted"
                                  onPointerDown={(event) => {
                                    event.preventDefault()
                                    event.stopPropagation()
                                  }}
                                  onClick={(event) => {
                                    event.preventDefault()
                                    event.stopPropagation()
                                    setAdding(undefined)
                                  }}
                                  icon={<Icon name="xmark-small" />}
                                  aria-label={language.t("common.closeTab")}
                                />
                              }
                              hideCloseButton
                            >
                              {language.t("session.tab.new")}
                            </Tabs.Trigger>
                          </Show>
                          <div class="h-full shrink-0 sticky end-0 z-10 flex items-center justify-center bg-v2-background-bg-base">
                            <Show
                              when={
                                primary() ?? (launchers().length === 0 && menu().length === 1 ? menu()[0] : undefined)
                              }
                              fallback={
                                <Show
                                  when={launchers().length > 0}
                                  fallback={
                                    <Show when={menu().length > 1}>
                                      <AddMenu items={menu()} />
                                    </Show>
                                  }
                                >
                                  <Tooltip
                                    value={language.t("session.tab.add")}
                                    placement="bottom"
                                    class="flex items-center"
                                  >
                                    <IconButton
                                      icon={<Icon name="plus" />}
                                      variant="ghost-muted"
                                      size="large"
                                      onClick={() =>
                                        setAdding({ session: props.view.key, over: props.region.active() })
                                      }
                                      aria-label={language.t("session.tab.add")}
                                    />
                                  </Tooltip>
                                </Show>
                              }
                            >
                              {(item) => <AddButton item={item()} />}
                            </Show>
                          </div>
                        </Tabs.List>
                        <div
                          data-slot="session-side-panel-actions"
                          class="session-review-v2-open-in-app-slot h-[var(--tabs-bar-height)] shrink-0 flex items-center gap-2 pe-3"
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <ExtensionSlot
                            at="session.panel.end"
                            input={{
                              get session() {
                                return props.view
                              },
                              get screen() {
                                return props.screen
                              },
                            }}
                          />
                          <Show when={tabsVisible()}>
                            <div class="size-7 shrink-0" aria-hidden />
                          </Show>
                        </div>
                      </div>

                      <Show when={newTab()}>
                        <Tabs.Content value="new" class="flex flex-col h-full overflow-hidden contain-strict">
                          <Launchers items={launchers()} />
                        </Tabs.Content>
                      </Show>
                      <Show when={!newTab() && props.region.active() === undefined}>
                        <Tabs.Content value="empty" class="flex flex-col h-full overflow-hidden contain-strict">
                          {/* With a new tab item, the new tab it opens is on its way. */}
                          <Show when={!primary()}>
                            <Show
                              when={launchers().length > 0}
                              fallback={
                                <div class="relative pt-2 flex-1 min-h-0 overflow-hidden">
                                  <div class="h-full px-6 pb-42 -mt-4 flex flex-col items-center justify-center text-center gap-6">
                                    <Mark class="w-14 opacity-10" />
                                    <div class="text-14-regular text-text-weak max-w-56">
                                      {language.t("session.files.selectToOpen")}
                                    </div>
                                  </div>
                                </div>
                              }
                            >
                              <Launchers items={launchers()} />
                            </Show>
                          </Show>
                        </Tabs.Content>
                      </Show>
                      {/* Kept mounted under the new tab view, so terminals and editors keep their state. */}
                      <div class="contents" classList={{ hidden: newTab() }} inert={newTab() || undefined}>
                        <RegionContent
                          region={props.region}
                          view={props.view}
                          screen={props.screen}
                          frame={{
                            shown: () => tabsOpen() && !newTab(),
                            present: tabsVisible,
                            placement: () => "side",
                            reserve: () => false,
                            animate: () => !props.size.active(),
                            sidebar: props.sidebar,
                          }}
                        />
                      </div>
                    </Tabs>
                  </DragDropProvider>
                </div>
              </div>
            </Show>

            <Show when={fileOpen()}>
              <div
                id="file-tree-panel"
                class="relative min-w-0 h-full shrink-0 overflow-hidden"
                style={{ width: treeWidth() }}
              >
                <div
                  class="h-full flex flex-col overflow-hidden group/filetree"
                  classList={{ "border-l border-border-weaker-base": tabsOpen() }}
                >
                  <ExtensionSlot
                    at="session.panel.sidebar"
                    input={{
                      get session() {
                        return props.view
                      },
                      get screen() {
                        return props.screen
                      },
                    }}
                  />
                </div>
                <div onPointerDown={() => props.size.start()}>
                  <ResizeHandle
                    direction="horizontal"
                    edge="start"
                    size={fileTreeWidth()}
                    min={FILE_TREE_WIDTH_MIN}
                    max={480}
                    onResize={(width) => {
                      props.size.touch()
                      layout.fileTree.resize(width)
                    }}
                  />
                </div>
              </div>
            </Show>
          </div>
        </Show>
      </aside>
    </Show>
  )
}

function AddButton(props: { item: SessionPanelMenuItem }): JSX.Element {
  const command = useCommand()
  const keybind = createMemo(() => (props.item.keybind ? command.keybindParts(props.item.keybind) : []))

  return (
    <Tooltip
      value={
        <>
          {props.item.title}
          <Show when={keybind().length > 0}>
            <Keybind keys={keybind()} variant="neutral" />
          </Show>
        </>
      }
      placement="bottom"
      class="flex items-center"
    >
      <IconButton
        icon={<Icon name="plus" />}
        variant="ghost-muted"
        size="large"
        onClick={() => props.item.run()}
        aria-label={props.item.title}
      />
    </Tooltip>
  )
}

function AddMenu(props: { items: readonly SessionPanelMenuItem[] }): JSX.Element {
  const language = useLanguage()
  const command = useCommand()
  // A chosen item runs once the closing menu has returned focus to "+", and the tab strip has passed it on to the
  // selected tab. Releasing that focus first lets the item move it where its tab needs it, e.g. into a new terminal,
  // without the strip taking it back for the tab it remembers.
  let chosen: SessionPanelMenuItem | undefined

  return (
    <Tooltip value={language.t("session.tab.add")} placement="bottom" class="flex items-center">
      <Menu appearance="standard" modal={false} placement="bottom-start" gutter={4}>
        <Menu.Trigger
          as={IconButton}
          icon={<Icon name="plus" />}
          variant="ghost-muted"
          size="large"
          aria-label={language.t("session.tab.add")}
          // The tablist redirects focus entering it to the selected
          // tab, which counts as focus-outside and closes the menu.
          onPointerDown={(event: PointerEvent) => event.preventDefault()}
        />
        <Menu.Portal>
          <Menu.Content
            onCloseAutoFocus={() => {
              const item = chosen

              if (!item) return
              chosen = undefined
              setTimeout(() => {
                if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
                item.run()
              })
            }}
          >
            <For each={props.items}>
              {(item) => {
                const keybind = createMemo(() => (item.keybind ? command.keybindParts(item.keybind) : []))

                return (
                  <Menu.Item
                    class="!gap-6"
                    onSelect={() => (chosen = item)}
                    shortcut={
                      <Show when={keybind().length > 0}>
                        <Keybind keys={keybind()} variant="neutral" />
                      </Show>
                    }
                  >
                    <div class="flex items-center gap-2">
                      <Show when={item.icon}>{(icon) => <Icon name={icon()} size="small" />}</Show>
                      <span>{item.title}</span>
                    </div>
                  </Menu.Item>
                )
              }}
            </For>
          </Menu.Content>
        </Menu.Portal>
      </Menu>
    </Tooltip>
  )
}

/** The + menu items as rows, in the empty side region and the new tab view. */
function Launchers(props: { items: readonly SessionPanelMenuItem[] }): JSX.Element {
  return (
    <div class="flex-1 min-h-0 overflow-y-auto px-6">
      <div class="mx-auto flex max-w-[560px] flex-col gap-3 pt-12">
        <For each={props.items}>{(item) => <LauncherRow item={item} />}</For>
      </div>
    </div>
  )
}

function LauncherRow(props: { item: SessionPanelMenuItem }): JSX.Element {
  const command = useCommand()
  const keybind = createMemo(() => (props.item.keybind ? command.keybindParts(props.item.keybind) : []))

  return (
    <button
      type="button"
      class="flex h-[41px] w-full items-center justify-between gap-4 rounded-[8px] border-[0.5px] border-v2-border-border-base bg-v2-background-bg-layer-01 px-3.5 text-start hover:bg-v2-background-bg-layer-02"
      // The new tab view stays until the tab the item opens selects itself, so nothing shows in between.
      onClick={() => props.item.run()}
    >
      <span class="flex min-w-0 items-center gap-2 text-[13px] font-[440] leading-[var(--line-height-compact)] tracking-[-0.04px]">
        <Show when={props.item.icon}>
          {(icon) => <Icon name={icon()} size="small" class="text-v2-icon-icon-muted" />}
        </Show>
        <span class="shrink-0 text-v2-text-text-base">{props.item.title}</span>
        <Show when={props.item.description}>
          {(description) => <span class="truncate text-v2-text-text-muted">{description()}</span>}
        </Show>
      </span>
      <Show when={keybind().length > 0}>
        <Keybind keys={keybind()} variant="neutral" />
      </Show>
    </button>
  )
}
