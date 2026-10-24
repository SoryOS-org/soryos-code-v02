import { Component, createEffect, createMemo, For, on, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useData } from "@/runtime/server/current"
import { useWorkspaceLocation } from "@/workspaces/location"
import { Button } from "@opencode/ui/button"
import { Dialog, DialogBody, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { useFilteredList } from "@opencode/ui/hooks"
import { Icon } from "@opencode/ui/icon"
import { ErrorDetails } from "@opencode/ui/error-details"
import { Switch } from "@opencode/ui/switch"
import { TextInput } from "@opencode/ui/text-input"
import { TruncatedText } from "@opencode/ui/truncated-text"
import { useLanguage } from "@/runtime/i18n/language"
import { useMcpToggle } from "@/providers/connect/mcp"
import { usePlatform } from "@/runtime/platform/platform"
import { showToast } from "@/shell/notifications/toast"
import "@/shell/search-list.css"

const statusLabels = {
  connected: "mcp.status.connected",
  failed: "mcp.status.failed",
  needs_auth: "mcp.status.needs_auth",
  disabled: "mcp.status.disabled",
} as const

/** The MCPs dialog for the current workspace. */
export const DialogSelectMcp: Component = () => {
  const sdk = useWorkspaceLocation()

  return <DialogMcp directory={sdk().directory} />
}

/** Lists the MCP servers of `directory`; `server` opens directly on that server's error. */
export const DialogMcp: Component<{ directory: string; server?: string }> = (props) => {
  const data = useData()
  const language = useLanguage()
  const platform = usePlatform()
  const directory = () => props.directory
  const toggle = useMcpToggle(directory)
  const [store, setStore] = createStore<{ detail?: string; copied: boolean }>({ detail: props.server, copied: false })
  const loaded = () => data.location.mcp.server.list({ directory: directory() })
  const servers = createMemo(() => loaded() ?? [])

  createEffect(() => void data.location.mcp.server.sync({ directory: directory() }).catch(() => undefined))

  const items = createMemo(() =>
    servers()
      .map((server) => ({ name: server.name, status: server.status.status }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  )

  const enabledCount = createMemo(() => items().filter((i) => i.status === "connected").length)

  // Like the TUI, a failed server's row opens its error; retrying and disabling happen there.
  const failure = createMemo(() => {
    const server = servers().find((item) => item.name === store.detail)

    return server?.status.status === "failed" ? { name: server.name, error: server.status.error } : undefined
  })

  const toggleServer = (name: string) => {
    const status = servers().find((server) => server.name === name)?.status.status

    if (!status || status === "pending" || toggle.isPending) return
    toggle.mutate(name)
  }

  const select = (name: string) => {
    if (servers().find((server) => server.name === name)?.status.status !== "failed") return toggleServer(name)
    setStore({ detail: name, copied: false })
    requestAnimationFrame(() => backRef?.focus())
  }

  const back = () => {
    setStore("detail", undefined)
    requestAnimationFrame(() => {
      searchRef?.focus()
      const active = list.active()

      if (active)
        resultsRef?.querySelector(`[data-option-key="${CSS.escape(active)}"]`)?.scrollIntoView({ block: "nearest" })
    })
  }

  const onDetailKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return
    event.preventDefault()
    event.stopPropagation()
    back()
  }

  // A successful retry or a removed server leaves nothing to show, so return to the list.
  createEffect(
    on(failure, (current) => {
      if (store.detail && loaded() && !current) back()
    }),
  )

  const copy = (current: { name: string; error: string }) => {
    const details = language.t("dialog.mcp.error.details", { name: current.name, error: current.error })

    return (platform.writeClipboardText?.(details) ?? navigator.clipboard.writeText(details))
      .then(() => setStore("copied", true))
      .catch((error) =>
        showToast({
          variant: "error",
          title: language.t("dialog.mcp.error.copyFailed"),
          description: error instanceof Error ? error.message : String(error),
        }),
      )
  }

  // A toggle changes the server's status, which makes the list reset its highlight to the first row; keep the user's place.
  let kept = ""

  const list = useFilteredList({
    items,
    key: (x) => x.name,
    filterKeys: ["name", "status"],
    sortBy: (a, b) => a.name.localeCompare(b.name),
    onSelect: (x) => {
      if (!x) return
      kept = x.name
      select(x.name)
    },
  })

  createEffect(
    on(
      list.flat,
      (items) => {
        if (kept && items.some((item) => item.name === kept)) list.setActive(kept)
      },
      { defer: true },
    ),
  )

  let resultsRef: HTMLDivElement | undefined
  let searchRef: HTMLInputElement | undefined
  let backRef: HTMLButtonElement | undefined

  const onKeyDown = (event: KeyboardEvent) => {
    list.onKeyDown(event)
    const active = list.active()

    if (!active) return

    if (kept) kept = active
    resultsRef?.querySelector(`[data-option-key="${CSS.escape(active)}"]`)?.scrollIntoView({ block: "nearest" })
  }

  return (
    <Dialog class="search-list-dialog mcp-dialog">
      <Show
        when={failure()}
        fallback={
          <>
            <DialogHeader>
              <DialogTitleGroup
                title={language.t("dialog.mcp.title")}
                description={language.t("dialog.mcp.description", { enabled: enabledCount(), total: items().length })}
              />
            </DialogHeader>
            <DialogBody class="search-list-body">
              <div class="search-list-search">
                <TextInput
                  type="search"
                  appearance="base"
                  class="!w-full"
                  leadingIcon={<Icon name="magnifying-glass" size="small" />}
                  value={list.filter()}
                  onInput={(event) => {
                    kept = ""
                    list.onInput(event.currentTarget.value)
                  }}
                  ref={searchRef}
                  onKeyDown={onKeyDown}
                  placeholder={language.t("common.search.placeholder")}
                  spellcheck={false}
                  autocorrect="off"
                  autocomplete="off"
                  autocapitalize="off"
                  autofocus
                  aria-label={language.t("common.search.placeholder")}
                  showClearButton={!!list.filter()}
                  clearIcon="circle-xmark"
                  clearLabel={language.t("common.clear")}
                  onClearClick={() => list.clear()}
                />
              </div>
              <div class="search-list-scroll" data-scrollable ref={(el) => (resultsRef = el)}>
                <Show
                  when={list.flat().length > 0}
                  fallback={
                    <div class="search-list-empty">
                      {language.t(items().length > 0 ? "dialog.mcp.search.empty" : "dialog.mcp.empty")}
                    </div>
                  }
                >
                  <div role="listbox" class="search-list-results">
                    <For each={list.flat()}>
                      {(item) => {
                        const server = () => servers().find((entry) => entry.name === item.name)
                        const status = () => server()?.status
                        // The switch would start sign-in anyway, so an auth-gated server shows that action instead.
                        const signIn = () => status()?.status === "needs_auth" && !!server()?.integrationID
                        const busy = () => toggle.isPending && toggle.variables === item.name

                        const detail = () => {
                          const current = status()

                          if (!current || current.status === "pending" || current.status === "failed" || signIn())
                            return

                          return language.t(statusLabels[current.status])
                        }

                        return (
                          <div
                            role="option"
                            aria-selected={list.active() === item.name}
                            data-option-key={item.name}
                            data-active={list.active() === item.name ? "" : undefined}
                            class="search-list-row"
                            onMouseMove={() => {
                              kept = item.name
                              list.setActive(item.name)
                            }}
                            onMouseLeave={() => {
                              kept = ""
                              list.setActive("")
                            }}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => select(item.name)}
                          >
                            <div class="search-list-row-text">
                              <TruncatedText text={item.name} class="search-list-title" />
                            </div>
                            <div class="search-list-trailing mcp-trailing" onClick={(event) => event.stopPropagation()}>
                              <Show
                                when={status()?.status === "failed"}
                                fallback={
                                  <Show
                                    when={signIn()}
                                    fallback={
                                      <Switch
                                        checked={status()?.status === "connected"}
                                        disabled={status()?.status === "pending" || busy()}
                                        onChange={() => toggleServer(item.name)}
                                      >
                                        <span class="sr-only">{item.name}</span>
                                        <span aria-hidden="true">{detail()}</span>
                                      </Switch>
                                    }
                                  >
                                    <Button
                                      size="small"
                                      variant="neutral"
                                      disabled={busy()}
                                      aria-busy={busy()}
                                      aria-label={language.t("dialog.mcp.signIn.open", { name: item.name })}
                                      onClick={() => toggleServer(item.name)}
                                    >
                                      {language.t(busy() ? "dialog.mcp.signingIn" : "dialog.mcp.signIn")}
                                    </Button>
                                  </Show>
                                }
                              >
                                <span class="text-v2-state-fg-danger">{language.t("mcp.status.failed")}</span>
                                <Button
                                  size="small"
                                  variant="neutral"
                                  aria-label={language.t("dialog.mcp.error.actionLabel", { name: item.name })}
                                  onClick={() => select(item.name)}
                                >
                                  {language.t("dialog.mcp.error.action")}
                                </Button>
                              </Show>
                            </div>
                          </div>
                        )
                      }}
                    </For>
                  </div>
                </Show>
              </div>
            </DialogBody>
          </>
        }
      >
        {(current) => (
          // Escape steps back to the list, like the TUI, instead of closing the dialog.
          <div class="contents" data-owns-escape onKeyDown={onDetailKeyDown}>
            <DialogHeader>
              <div class="mcp-error-heading">
                <button
                  ref={backRef}
                  type="button"
                  autofocus
                  class="flex size-5 shrink-0 items-center justify-center rounded-sm text-v2-icon-icon-muted hover:bg-v2-overlay-simple-overlay-hover focus-visible:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none"
                  onClick={back}
                  aria-label={language.t("common.goBack")}
                >
                  <Icon name="arrow-left" size="small" />
                </button>
                <DialogTitleGroup
                  title={
                    <span dir="auto" class="[overflow-wrap:anywhere]">
                      {current().name}
                    </span>
                  }
                  description={language.t("dialog.mcp.error.status")}
                />
              </div>
            </DialogHeader>
            <DialogBody class="search-list-body">
              <ErrorDetails error={current().error}>
                <Button
                  class="error-details-copy"
                  variant="ghost-muted"
                  icon={store.copied ? "check" : "copy"}
                  onClick={() => void copy(current())}
                >
                  {language.t(store.copied ? "common.copied" : "dialog.mcp.error.copy")}
                </Button>
                <Button
                  variant="ghost"
                  disabled={toggle.isPending}
                  onClick={() => toggle.mutate({ name: current().name, enabled: false })}
                >
                  {language.t("dialog.mcp.error.disable")}
                </Button>
                <Button variant="neutral" disabled={toggle.isPending} onClick={() => toggleServer(current().name)}>
                  {language.t("common.retry")}
                </Button>
              </ErrorDetails>
            </DialogBody>
          </div>
        )}
      </Show>
    </Dialog>
  )
}
