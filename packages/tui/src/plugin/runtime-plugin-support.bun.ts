import { ensurePluginRuntime, provides } from "@lutungcode/plugin/runtime"
import { Plugin, PluginContextProvider, usePlugin } from "@lutungcode/plugin/tui"
import { ensureRuntimePluginSupport } from "@opentui/solid/runtime-plugin-support/configure"

ensurePluginRuntime()
ensureRuntimePluginSupport({
  additional: {
    "@lutungcode/plugin/tui": { Plugin, PluginContextProvider, usePlugin },
  },
  preserve: provides,
})
