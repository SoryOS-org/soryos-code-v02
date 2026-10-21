import { Popover } from "@kobalte/core/popover"
import type { PluginInfo } from "@opencode/client"
import { Button } from "@opencode/ui/button"
import { Dialog, DialogBody, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { ErrorDetails } from "@opencode/ui/error-details"
import { Icon } from "@opencode/ui/icon"
import { Switch } from "@opencode/ui/switch"
import { showToast } from "@opencode/ui/toast"
import { Tooltip } from "@opencode/ui/tooltip"
import { TruncatedText } from "@opencode/ui/truncated-text"
import { getDirectory } from "@opencode/util/path"
import { useMutation } from "@tanstack/solid-query"
import { children, createMemo, createResource, createSignal, For, Index, on, onCleanup, Show, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { createKeyed, useDrawer, useExtension, type MountedSession } from "../sdk"
import { configuredLsps } from "./configured-lsp"

const services = [
  { type: "mcp", icon: "mcp", label: "mcp" },
  { type: "plugins", icon: "cube", label: "plugins" },
  { type: "skills", icon: "graduation-cap", label: "skills" },
  { type: "lsp", icon: "code-slash", label: "lsp" },
] as const

type Service = (typeof services)[number]["type"]

type ServiceMenuProps = {
  session: MountedSession
  service: (typeof services)[number]
  directory: string
  shown: boolean
  open: boolean
  mobile?: boolean
  onOpenChange: (open: boolean) => void
}

export function SessionServerPanel(props: {
  session: MountedSession
  directory: string
  shown: boolean
  mobile?: boolean
}) {
  const ctx = useExtension()
  const name = () => (ctx.servers.list().length < 2 ? ctx.t("server") : props.session.server.name)
  // A new scope whenever the location or visibility changes closes the service popover.
  const scope = createMemo(on([() => props.directory, () => props.shown], () => ({})))
  const [submenu, setSubmenu] = createSignal<{ readonly scope: object; readonly service: Service }>()

  const open = () => {
    const current = submenu()

    return current?.scope === scope() ? current.service : undefined
  }

  return (
    <section class="session-summary-card" data-section="server">
      <h2 class="session-summary-row session-summary-heading">
        <span dir="auto" class="session-summary-label">
          {name()}
        </span>
      </h2>
      <Show when={props.directory} keyed>
        {(directory) => (
          <div class="session-summary-rows">
            <For each={services}>
              {(service) => (
                <ServiceMenu
                  session={props.session}
                  service={service}
                  directory={directory}
                  shown={props.shown}
                  open={open() === service.type}
                  mobile={props.mobile}
                  onOpenChange={(value) => setSubmenu(value ? { scope: scope(), service: service.type } : undefined)}
                />
              )}
            </For>
          </div>
        )}
      </Show>
    </section>
  )
}

function ServiceMenu(props: ServiceMenuProps) {
  if (props.service.type === "mcp") return <McpMenu {...props} />

  if (props.service.type === "lsp") return <LspMenu {...props} />

  return <ServiceCatalog {...props} />
}

function LspMenu(props: ServiceMenuProps) {
  const ctx = useExtension()
  const data = () => props.session.server.data

  const [load, { refetch }] = createResource(
    () => props.shown && data(),
    (current) => {
      const directory = props.directory

      current.location.config.invalidate({ directory })

      return current.location.config.sync({ directory })
    },
  )

  const names = createMemo(() => configuredLsps(data().location.config.list({ directory: props.directory }) ?? []))

  createKeyed(data, (current) =>
    onCleanup(
      current.on("config.updated", (event) => {
        if (event.location?.directory !== props.directory) return
        void refetch()
      }),
    ),
  )

  return (
    <ServicePopover
      {...props}
      loading={load.loading}
      ready={data().location.config.list({ directory: props.directory }) !== undefined}
      empty={names().length === 0}
      error={load.error}
      retry={refetch}
    >
      <Show
        when={names().length}
        fallback={
          <ServiceEmpty session={props.session} title={ctx.t("lsp.empty")} directory={props.directory} service="lsp" />
        }
      >
        <h3 class="session-service-title">{ctx.t("lsp.configured")}</h3>
        <For each={names()}>
          {(name) => (
            <div class="session-service-row">
              <span dir="auto" class="session-summary-label">
                {name}
              </span>
            </div>
          )}
        </For>
        <div class="session-service-footer">
          <ServiceConfigLink session={props.session} directory={props.directory} service="lsp" />
        </div>
      </Show>
    </ServicePopover>
  )
}

function McpMenu(props: ServiceMenuProps) {
  const ctx = useExtension()
  const data = () => props.session.server.data

  const toggle = useMcpToggle(props.session, () => props.directory)

  const [load, { refetch }] = createResource(
    () => props.shown && data(),
    async (current) => {
      const directory = props.directory

      current.location.mcp.server.invalidate({ directory })
      await current.location.mcp.server.sync({ directory })
    },
  )

  const servers = createMemo(() =>
    (data().location.mcp.server.list({ directory: props.directory }) ?? []).toSorted((a, b) =>
      a.name.localeCompare(b.name),
    ),
  )

  const showError = (name: string) =>
    ctx.dialogs.open((dialog) => (
      <McpErrorDialog session={props.session} directory={props.directory} name={name} onClose={dialog.close} />
    ))

  return (
    <ServicePopover
      {...props}
      loading={load.loading}
      ready={data().location.mcp.server.list({ directory: props.directory }) !== undefined}
      empty={servers().length === 0}
      error={load.error}
      retry={refetch}
    >
      <Show
        when={servers().length}
        fallback={
          <ServiceEmpty session={props.session} title={ctx.t("mcp.empty")} directory={props.directory} service="mcp" />
        }
      >
        <h3 class="session-service-title">{ctx.t("mcp.title")}</h3>
        <Index each={servers()}>
          {(server) => {
            const enabled = () => server().status.status !== "disabled"
            const pending = () => toggle.isPending || server().status.status === "pending"
            // Status stays beside its control rather than competing with a long server name.
            const failed = () => server().status.status === "failed"
            const signIn = () => server().status.status === "needs_auth" && !!server().integrationID
            const busy = () => toggle.isPending && toggle.variables?.name === server().name

            const label = () => {
              const status = server().status.status

              if (status === "pending") return ctx.t("connecting")

              if (status === "needs_auth") return ctx.t("needsAuth")

              return ctx.t(status === "connected" ? "mcp.connected" : "mcp.disabled")
            }

            const change = (value: boolean) => {
              if (pending()) return
              toggle.mutate({ name: server().name, enabled: value })
            }

            const follow = () => {
              if (failed()) return showError(server().name)
              change(server().status.status === "needs_auth" || !enabled())
            }

            return (
              <div class="session-mcp-row" data-disabled={pending() || undefined} onClick={follow}>
                <span class="session-mcp-name">
                  <span class="session-service-dot" data-status={server().status.status} aria-hidden="true" />
                  <TruncatedText text={server().name} class="session-summary-label" />
                </span>
                <span class="session-mcp-trailing" onClick={(event) => event.stopPropagation()}>
                  <Show
                    when={failed() || signIn()}
                    fallback={
                      <Switch
                        checked={enabled()}
                        readOnly={pending()}
                        aria-disabled={pending()}
                        aria-busy={busy()}
                        description={server().status.status === "pending" ? label() : undefined}
                        class="[&_[data-slot=switch-description]]:sr-only"
                        onChange={change}
                      >
                        <span class="sr-only">{server().name}</span>
                        <span aria-hidden="true">{label()}</span>
                      </Switch>
                    }
                  >
                    <Show when={failed()}>
                      <span class="session-mcp-failed">{ctx.t("failed")}</span>
                    </Show>
                    <Button
                      size="small"
                      variant="neutral"
                      disabled={signIn() && pending()}
                      aria-busy={busy()}
                      aria-label={ctx.t(failed() ? "mcp.error.actionLabel" : "mcp.signIn.open", {
                        name: server().name,
                      })}
                      onClick={follow}
                    >
                      <Show when={failed()} fallback={ctx.t(busy() ? "mcp.signingIn" : "mcp.signIn")}>
                        {ctx.t("mcp.error.action")}
                      </Show>
                    </Button>
                  </Show>
                </span>
              </div>
            )
          }}
        </Index>
        <div class="session-service-footer">
          <ServiceConfigLink session={props.session} directory={props.directory} service="mcp" />
          <button
            type="button"
            class="session-service-config"
            onClick={() => {
              props.onOpenChange(false)
              ctx.layout.command("mcp.toggle")
            }}
          >
            <Icon name="mcp" class="shrink-0 text-v2-icon-icon-muted" />
            <span class="min-w-0 truncate">{ctx.t("mcp.manage")}</span>
          </button>
        </div>
      </Show>
    </ServicePopover>
  )
}

function ServiceCatalog(props: ServiceMenuProps) {
  const ctx = useExtension()
  const data = () => props.session.server.data

  const [items, { refetch }] = createResource(
    () => props.shown && data(),
    async (current) => {
      const directory = props.directory

      if (props.service.type === "plugins") {
        const result = await props.session.server.client.plugin.list({ location: { directory } })

        return result.data
          .filter((plugin) => plugin.source.type !== "builtin")
          .map((plugin) => ({
            name: pluginLabel(plugin),
            status: plugin.state.status,
            error: plugin.state.status === "failed" ? plugin.state.error : undefined,
          }))
      }

      current.location.skill.invalidate({ directory })
      await current.location.skill.sync({ directory })

      return undefined
    },
  )

  const loaded = () => items.state === "ready" || items.state === "refreshing"

  const list = createMemo(() => {
    const entries =
      props.service.type === "plugins"
        ? loaded()
          ? (items.latest ?? [])
          : []
        : (data().location.skill.list({ directory: props.directory }) ?? []).map((skill) => ({
            name: skill.name,
            status: "active",
            error: undefined,
          }))

    return entries.toSorted((a, b) => a.name.localeCompare(b.name))
  })

  createKeyed(data, (current) =>
    onCleanup(
      current.on(props.service.type === "plugins" ? "plugin.updated" : "skill.updated", (event) => {
        if (event.location?.directory !== props.directory) return
        void refetch()
      }),
    ),
  )

  return (
    <ServicePopover
      {...props}
      loading={items.loading}
      ready={
        props.service.type === "plugins"
          ? loaded()
          : data().location.skill.list({ directory: props.directory }) !== undefined
      }
      empty={list().length === 0}
      error={items.error}
      retry={refetch}
    >
      <Show
        when={list().length}
        fallback={
          <ServiceEmpty
            session={props.session}
            title={ctx.t(props.service.type === "plugins" ? "plugins.empty" : "skills.empty")}
            directory={props.directory}
            service={props.service.type}
          />
        }
      >
        <h3 class="session-service-title">
          {ctx.t(props.service.type === "plugins" ? "plugins.configured" : "skills.configured")}
        </h3>
        <For each={list()}>
          {(item) => (
            <div class="session-service-row" title={item.error ?? item.name}>
              <span class="session-service-dot" data-status={item.status} aria-hidden="true" />
              <span dir="auto" class="session-summary-label">
                {item.name}
              </span>
              <Show when={item.status === "failed"}>
                <span class="session-service-status">{ctx.t("failed")}</span>
              </Show>
            </div>
          )}
        </For>
        <div class="session-service-footer">
          <ServiceConfigLink session={props.session} directory={props.directory} service={props.service.type} />
        </div>
      </Show>
    </ServicePopover>
  )
}

type ServiceBodyProps = {
  loading: boolean
  ready: boolean
  error: unknown
  retry: () => void
  children: JSX.Element
}

function ServicePopover(props: ServiceMenuProps & ServiceBodyProps & { empty: boolean }) {
  const ctx = useExtension()
  const locale = ctx.locale
  const drawer = useDrawer()

  const placement = createMemo(() =>
    props.mobile ? "top-end" : locale.direction() === "rtl" ? "right-start" : "left-start",
  )

  // How the trigger last opened the menu: a keyboard open moves focus to the first row, a pointer open does not.
  const opening = { pointer: false }

  // In a narrow-screen drawer the service list replaces the drawer's view instead of opening a popover over it.
  if (props.mobile && drawer) {
    const content = children(() => (
      <div
        class="session-summary-card session-service-drawer"
        data-service={props.service.type}
        aria-busy={props.loading}
      >
        <ServiceBody {...props} />
      </div>
    ))

    return (
      <button
        type="button"
        class="session-summary-row"
        onClick={(event) => {
          if (!props.loading) void props.retry()
          drawer.open({ title: ctx.t(props.service.label), content: content(), trigger: event.currentTarget })
        }}
      >
        <Icon name={props.service.icon} class="shrink-0 text-v2-icon-icon-muted" />
        <span class="session-summary-label">{ctx.t(props.service.label)}</span>
        <Icon name="chevron-right" class="session-summary-menu-indicator shrink-0 text-v2-icon-icon-muted" />
      </button>
    )
  }

  return (
    <Popover
      open={props.open}
      onOpenChange={(open) => {
        props.onOpenChange(open)

        if (open && !props.loading) void props.retry()
      }}
      placement={placement()}
      gutter={4}
      overflowPadding={16}
      modal={false}
    >
      <Popover.Trigger
        as="button"
        type="button"
        class="session-summary-row"
        onPointerDown={() => (opening.pointer = true)}
        onKeyDown={() => (opening.pointer = false)}
      >
        <Icon name={props.service.icon} class="shrink-0 text-v2-icon-icon-muted" />
        <span class="session-summary-label">{ctx.t(props.service.label)}</span>
        <Icon name="fill-triangle-down" class="session-summary-menu-indicator shrink-0 text-v2-icon-icon-muted" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          class="session-service-menu"
          data-service={props.service.type}
          data-empty={(props.ready && !props.error && props.empty) || undefined}
          aria-busy={props.loading}
          aria-label={ctx.t(props.service.label)}
          // A pointer open focuses the menu itself, as the browser site panel does, so its first row shows no ring.
          onOpenAutoFocus={(event: Event) => {
            if (!opening.pointer) return
            event.preventDefault()

            const content = event.currentTarget

            // Deferred like Kobalte's own autofocus: focusing now, before this nested layer registers, reads as focus
            // leaving the details panel and closes it.
            if (content instanceof HTMLElement) setTimeout(() => content.focus({ preventScroll: true }))
          }}
        >
          <ServiceBody {...props} />
        </Popover.Content>
      </Popover.Portal>
    </Popover>
  )
}

function ServiceBody(props: ServiceBodyProps) {
  const ctx = useExtension()

  return (
    <Show
      when={props.ready || !props.loading}
      fallback={
        <div class="session-service-message" role="status">
          {ctx.t("common.loading")}
        </div>
      }
    >
      <Show
        when={!props.error}
        fallback={
          <div class="session-service-message" role="alert">
            <p>{ctx.t("common.requestFailed")}</p>
            <button type="button" class="session-summary-row" onClick={() => props.retry()}>
              {ctx.t("retry")}
            </button>
          </div>
        }
      >
        {props.children}
      </Show>
    </Show>
  )
}

function ServiceConfigLink(props: { session: MountedSession; directory: string; service: Service }) {
  const ctx = useExtension()
  const desktop = ctx.desktop
  const system = ctx.system
  const local = () => props.session.server.local
  const [store, setStore] = createStore({ opening: false, copied: false })
  const label = () => ctx.t(local() ? "configure" : "copyConfigPath")
  // Clears the copied mark two seconds after the latest copy.
  let reset: ReturnType<typeof setTimeout> | undefined

  onCleanup(() => clearTimeout(reset))

  const activate = async () => {
    if (store.opening || (local() && !desktop)) return
    setStore({ opening: true, copied: false })
    const directory = props.directory
    await props.session.server.client.config
      .get({ location: { directory } })
      .then(async (entries) => {
        const documents = entries
          .filter((entry) => entry.type === "document")
          .filter((entry) => entry.path !== undefined && /\.jsonc?$/.test(entry.path))

        const path =
          documents.findLast((entry) => entry.info[props.service] !== undefined)?.path ?? documents.at(-1)?.path

        if (!local()) {
          if (!path) throw new Error(ctx.t("configFileMissing"))
          await system.copy(path)
          setStore("copied", true)
          clearTimeout(reset)
          reset = setTimeout(() => setStore("copied", false), 2000)

          return
        }

        if (path && (await desktop?.reveal(path))) return
        await desktop?.launch(path ? getDirectory(path) : directory)
      })
      .catch((error) =>
        showToast({
          variant: "error",
          title: ctx.t("common.requestFailed"),
          description: error instanceof Error ? error.message : String(error),
        }),
      )
      .finally(() => setStore("opening", false))
  }

  return (
    <>
      <span class="session-service-config-separator" role="separator" />
      <Show
        when={!local() || desktop}
        fallback={
          <span class="session-service-row">
            <Icon name="settings-gear" class="shrink-0 text-v2-icon-icon-muted" />
            {label()}
          </span>
        }
      >
        <Tooltip
          inactive={local()}
          value={ctx.t(store.copied ? "ui.message.copied" : "ui.message.copy")}
          placement="top"
          getAnchorRect={(anchor) => anchor?.querySelector("svg")?.getBoundingClientRect()}
          forceOpen={store.copied ? true : undefined}
          class="w-full"
        >
          <button
            type="button"
            class="session-service-config"
            disabled={store.opening}
            onMouseDown={(event) => {
              if (!local()) event.preventDefault()
            }}
            onClick={() => void activate()}
          >
            <Icon
              name={local() ? "settings-gear" : store.copied ? "check" : "outline-copy"}
              class="shrink-0 text-v2-icon-icon-muted"
            />
            <span class="session-summary-label">{label()}</span>
            <Show when={local()}>
              <Icon name="arrow-up-right" class="session-service-config-arrow shrink-0" />
            </Show>
          </button>
        </Tooltip>
      </Show>
    </>
  )
}

function ServiceEmpty(props: { session: MountedSession; title: string; directory: string; service: Service }) {
  return (
    <div class="session-service-empty">
      <strong>{props.title}</strong>
      <div class="session-service-footer">
        <ServiceConfigLink session={props.session} directory={props.directory} service={props.service} />
      </div>
    </div>
  )
}

function pluginLabel(plugin: PluginInfo) {
  if (plugin.id) return plugin.id

  if (plugin.source.type === "package") return plugin.source.target

  if (plugin.source.type === "local") return plugin.source.path

  return plugin.source.type
}

// Connects, disconnects, or starts sign-in for one of the session server's MCPs, like the app's MCP toggle.
function useMcpToggle(session: MountedSession, directory: () => string) {
  const ctx = useExtension()
  const system = ctx.system
  const data = () => session.server.data

  return useMutation(() => ({
    mutationFn: async (input: { name: string; enabled: boolean }) => {
      const client = session.server.client
      const source = data()
      const ref = { directory: directory() }
      const server = (await client.mcp.list({ location: ref })).data.find((item) => item.name === input.name)

      if (!server) return

      if (!input.enabled) {
        await client.mcp.disconnect({ server: input.name, location: ref })
      }

      if (input.enabled && server.status.status !== "needs_auth") {
        await client.mcp.connect({ server: input.name, location: ref })
      }

      source.location.mcp.server.invalidate(ref)
      await source.location.mcp.server.sync(ref)
      const current = source.location.mcp.server.list(ref)?.find((item) => item.name === input.name)

      if (input.enabled && current?.status.status === "needs_auth" && current.integrationID) {
        const integration = await client.integration.get({ integrationID: current.integrationID, location: ref })
        const method = integration.data?.methods.find((item) => item.type === "oauth" && !item.form?.length)

        if (!method || method.type !== "oauth") throw new Error(ctx.t("mcp.interactiveAuth", { name: input.name }))

        const attempt = await client.integration.oauth.connect({
          integrationID: current.integrationID,
          methodID: method.id,
          location: ref,
        })

        system.openExternal(attempt.data.url)
      }

      source.location.mcp.resource.invalidate(ref)
      await source.location.mcp.resource.sync(ref)
      // A successful HTTP response can still leave the MCP connection in a failed state.
      const status = current?.status

      if (status?.status === "failed") throw new Error(`${input.name}: ${status.error}`)
    },
    onError: (error) =>
      showToast({
        variant: "error",
        title: ctx.t("common.requestFailed"),
        description: error instanceof Error ? error.message : String(error),
      }),
  }))
}

// The MCPs dialog's error view, for a server the popover lists. It reads the server's own data, so it outlives the
// popover that opened it.
function McpErrorDialog(props: { session: MountedSession; directory: string; name: string; onClose: () => void }) {
  const ctx = useExtension()
  const toggle = useMcpToggle(props.session, () => props.directory)
  const [copied, setCopied] = createSignal(false)

  const failure = () => {
    const server = props.session.server.data.location.mcp.server
      .list({ directory: props.directory })
      ?.find((item) => item.name === props.name)

    return server?.status.status === "failed" ? { name: server.name, error: server.status.error } : undefined
  }

  // A successful retry, disabling, or a removed server leaves nothing to show.
  createKeyed(
    () => !!failure(),
    () => undefined,
    { otherwise: props.onClose },
  )

  return (
    <Show when={failure()}>
      {(current) => (
        <Dialog class="session-mcp-error">
          <DialogHeader>
            <DialogTitleGroup
              title={
                <span dir="auto" class="[overflow-wrap:anywhere]">
                  {current().name}
                </span>
              }
              description={ctx.t("mcp.error.status")}
            />
          </DialogHeader>
          <DialogBody class="session-mcp-error-body">
            <ErrorDetails error={current().error}>
              <Button
                class="error-details-copy"
                variant="ghost-muted"
                icon={copied() ? "check" : "copy"}
                onClick={() =>
                  void ctx.system
                    .copy(ctx.t("mcp.error.details", { name: current().name, error: current().error }))
                    .then(() => setCopied(true))
                    .catch((error) =>
                      showToast({
                        variant: "error",
                        title: ctx.t("mcp.error.copyFailed"),
                        description: error instanceof Error ? error.message : String(error),
                      }),
                    )
                }
              >
                {ctx.t(copied() ? "common.copied" : "mcp.error.copy")}
              </Button>
              <Button
                variant="ghost"
                disabled={toggle.isPending}
                onClick={() => toggle.mutate({ name: props.name, enabled: false })}
              >
                {ctx.t("mcp.error.disable")}
              </Button>
              <Button
                variant="neutral"
                disabled={toggle.isPending}
                onClick={() => toggle.mutate({ name: props.name, enabled: true })}
              >
                {ctx.t("common.retry")}
              </Button>
            </ErrorDetails>
          </DialogBody>
        </Dialog>
      )}
    </Show>
  )
}
