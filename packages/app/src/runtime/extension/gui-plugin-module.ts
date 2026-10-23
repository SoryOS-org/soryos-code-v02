import { Predicate, Schema } from "effect"
import type { Definition as GuiPluginDefinition } from "@opencode/plugin/gui"

const GuiPluginModule = Schema.Struct({
  default: Schema.Struct({
    id: Schema.String,
    i18n: Schema.optionalKey(
      Schema.declare<NonNullable<GuiPluginDefinition["i18n"]>>(
        (value): value is NonNullable<GuiPluginDefinition["i18n"]> =>
          Predicate.isObject(value) &&
          Predicate.hasProperty(value, "en") &&
          isMessages(value.en) &&
          Object.values(value).every(isMessages),
      ),
    ),
    setup: Schema.declare<GuiPluginDefinition["setup"]>((value): value is GuiPluginDefinition["setup"] =>
      Predicate.isFunction(value),
    ),
  }),
})

/** Loads a server-bundled GUI plugin against the app's shared Solid and GUI plugin modules. */
export async function decodeGuiPlugin(source: string): Promise<GuiPluginDefinition> {
  const module = { exports: {} }

  const [guiSDK, solid, store, jsx, jsxDev, web] = await Promise.all([
    import("@opencode/plugin/gui"),
    import("solid-js"),
    import("solid-js/store"),
    import("solid-js/jsx-runtime"),
    import("solid-js/jsx-dev-runtime"),
    import("solid-js/web"),
  ])

  const shared = new Map<string, object>([
    ["@opencode/plugin/gui", guiSDK],
    ["solid-js", solid],
    ["solid-js/store", store],
    ["solid-js/jsx-runtime", jsx],
    ["solid-js/jsx-dev-runtime", jsxDev],
    ["solid-js/web", web],
  ])

  // The server only returns bundles for plugins explicitly listed in the user's plugin config.
  new Function("require", "module", "exports", source)(
    (name: string) => {
      const loaded = shared.get(name)

      if (!loaded) throw new Error(`Unsupported GUI plugin import: ${name}`)

      return loaded
    },
    module,
    module.exports,
  )

  return Schema.decodeUnknownSync(GuiPluginModule)(module.exports).default
}

function isMessages(value: unknown): value is Readonly<Record<string, string>> {
  return Predicate.isObject(value) && Object.values(value).every(Predicate.isString)
}
