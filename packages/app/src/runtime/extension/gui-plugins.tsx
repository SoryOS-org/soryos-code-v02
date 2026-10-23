import { Schema } from "effect"
import { createMemo, createResource, onCleanup } from "solid-js"
import { Command, createKeyed, type Definition, type Setup } from "@opencode/gui-extensions/sdk"
import type { Context as GuiPluginContext, Definition as GuiPluginDefinition } from "@opencode/plugin/gui"
import { useGlobal, type ServerCtx } from "@/runtime/server/runtime"
import { ServerConnection, useServers } from "@/runtime/server/registry"
import { usePlatform } from "@/runtime/platform/platform"
import { useLanguage } from "@/runtime/i18n/language"
import { showToast } from "@/shell/notifications/toast"
import { Dialog } from "@opencode/ui/dialog"
import { decodeGuiPlugin } from "./gui-plugin-module"

type Source = { server: ServerCtx }

export function GuiPluginLoader(props: { register: (definition: Definition) => () => void }) {
  const global = useGlobal()
  const servers = useServers()
  const platform = usePlatform()
  const language = useLanguage()

  const target = createMemo<Source | undefined>(
    () => {
      if (platform.platform !== "desktop") return

      const connection = servers.list.find(ServerConnection.builtin)

      if (!connection) return

      const server = global.ensureServerCtx(connection)

      if (server.sdk.connection.status() !== "connected") return

      return { server }
    },
    undefined,
    {
      equals: (left, right) => left?.server === right?.server,
    },
  )

  const registered = new Map<string, () => void>()
  const failures = new Set<string>()
  let generation = 0

  const reportFailure = (plugin: string, message: string) => {
    if (failures.has(plugin)) return

    failures.add(plugin)
    showToast({
      title: language.t("toast.guiPlugin.failed.title"),
      description: language.t("toast.guiPlugin.failed.description", { plugin, message }),
    })
  }

  const [inventory, { refetch }] = createResource(target, async (source) =>
    source.server.sdk.api.plugin
      .list()
      .then((result) => ({ source, plugins: result.data.filter((item) => item.features.gui === true && item.id) }))
      .catch((error) => {
        console.error("[gui-plugin] failed to list configured GUI plugins", error)
        reportFailure("plugins", error instanceof Error ? error.message : String(error))

        return undefined
      }),
  )

  // Keep subscriptions tied to the built-in server/location generation; inventory changes reconcile registrations.
  createKeyed(target, (source) => {
    const stopPlugin = source.server.sdk.event.on("plugin.updated", () => void refetch())
    const stopServer = source.server.sdk.event.on("server.connected", () => void refetch())

    onCleanup(() => {
      stopPlugin()
      stopServer()
    })
  })

  const currentInventory = () => inventory()
  createKeyed(currentInventory, (value) => {
    if (value) void reconcile(value)
  })

  onCleanup(() => {
    generation++
    registered.forEach((dispose) => dispose())
    registered.clear()
  })

  async function reconcile(value: NonNullable<ReturnType<typeof inventory>>) {
    const current = ++generation

    const definitions = await Promise.all(
      value.plugins.map(async (plugin) => {
        try {
          if (!plugin.id) return undefined

          const bundle = await value.source.server.sdk.api.plugin.gui({ id: plugin.id })

          const definition = await decodeGuiPlugin(bundle.data.source)

          return { pluginID: plugin.id, definition: toExtension(definition, bundle.data.options) }
        } catch (error) {
          console.error(`[gui-plugin] failed to load ${plugin.id}`, error)
          reportFailure(plugin.id ?? "unknown plugin", error instanceof Error ? error.message : String(error))

          return undefined
        }
      }),
    )

    if (current !== generation || target() !== value.source) return

    const loaded = definitions.filter(
      (item): item is { pluginID: string; definition: Definition } => item !== undefined,
    )

    const ids = new Set(value.plugins.flatMap((plugin) => (plugin.id ? [plugin.id] : [])))
    const definitionIDs = new Set<string>()
    const duplicateDefinitionIDs = new Set<string>()

    loaded.forEach((item) => {
      if (definitionIDs.has(item.definition.id)) {
        console.error(`[gui-plugin] duplicate GUI plugin id: ${item.definition.id}`)
        reportFailure(item.definition.id, "Another configured GUI plugin uses the same id")
        duplicateDefinitionIDs.add(item.definition.id)

        return
      }

      definitionIDs.add(item.definition.id)
    })

    registered.forEach((dispose, id) => {
      if (ids.has(id)) return

      dispose()
      registered.delete(id)
    })

    loaded.forEach((item) => {
      if (duplicateDefinitionIDs.has(item.definition.id)) return

      registered.get(item.pluginID)?.()
      registered.delete(item.pluginID)
      failures.delete(item.pluginID)

      try {
        registered.set(item.pluginID, props.register(item.definition))
        failures.delete(item.definition.id)
      } catch (error) {
        console.error(`[gui-plugin] failed to register ${item.definition.id}`, error)
        reportFailure(item.definition.id, error instanceof Error ? error.message : String(error))
      }
    })
  }

  function toExtension(plugin: GuiPluginDefinition, options: GuiPluginContext["options"]): Definition {
    const setup: Setup<Definition> = (context) => {
      const storage = new Map<string, ReturnType<GuiPluginContext["storage"]["global"]>>()
      const strings = new Map<string, ReturnType<GuiPluginContext["storage"]["globalString"]>>()

      const gui: GuiPluginContext = {
        id: plugin.id,
        options,
        t: context.t,
        storage: {
          global(key) {
            const existing = storage.get(key)

            if (existing) return existing

            const persisted = context.storage.store(key, {
              schema: Schema.Struct({ value: Schema.Json }),
              initial: { value: null },
            })

            const value = {
              value: () => persisted.value?.value,
              ready: persisted.ready,
              set: (next: Schema.Json) => persisted.set({ value: next }),
            }

            storage.set(key, value)

            return value
          },
          globalString(key, initial = "") {
            const existing = strings.get(key)

            if (existing) return existing

            const persisted = context.storage.store(key, {
              schema: Schema.Struct({ value: Schema.String }),
              initial: { value: initial },
            })

            const value = {
              value: () => persisted.value?.value,
              ready: persisted.ready,
              set: (next: string) => persisted.set({ value: next }),
            }

            strings.set(key, value)

            return value
          },
        },
        servers: {
          list: () =>
            context.servers.list().flatMap((id) => {
              const item = server(id)

              return item ? [item] : []
            }),
          get: server,
        },
        sessions: { open: context.sessions.open },
        ui: {
          command: (command) =>
            context.add(Command, {
              id: command.id,
              get title() {
                return command.title
              },
              get description() {
                return command.description
              },
              bind: command.bind,
              run: command.run,
            }),
          dialog: (render) =>
            context.dialogs.open((dialog) => <Dialog>{render({ close: dialog.close })}</Dialog>),
        },
      }

      try {
        const cleanup = plugin.setup(gui)

        if (cleanup) onCleanup(cleanup)
      } catch (error) {
        reportFailure(plugin.id, error instanceof Error ? error.message : String(error))
        throw error
      }

      function server(serverID: string) {
        const item = context.servers.get(serverID)

        if (!item) return

        return {
          get id() {
            return item.id
          },
          get name() {
            return item.name
          },
          get local() {
            return item.local
          },
          get builtin() {
            return item.builtin
          },
          get connected() {
            return item.connected
          },
          get compatible() {
            return item.compatible
          },
          get client() {
            return item.client
          },
        }
      }
    }

    return { id: plugin.id, i18n: plugin.i18n, renderer: async () => ({ default: setup }) }
  }

  return null
}
