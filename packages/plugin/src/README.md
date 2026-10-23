# OpenCode V2 Promise Plugin API

The Promise plugin API at `@opencode/plugin` is the async/await equivalent of `@opencode/plugin/effect`. It grants plugins the same two in-process capabilities:

- `hook` installs behavior at an OpenCode extension point.
- `reload` reruns every transform hook for a stateful domain.

The Promise API uses Promises instead of Effects for setup, runtime hook
callbacks, hook registration, `reload`, and `Registration.dispose`. Transform
editor callbacks remain synchronous.

## Defining A Plugin

```ts
import { Plugin } from "@opencode/plugin"

export default Plugin.define({
  id: "example",
  setup: async (ctx) => {
    await ctx.provider.transform((editor) => {
      editor.update("example", (provider) => {
        provider.name = "Example"
      })
    })
  },
})
```

Plugin setup registers hooks imperatively through each domain's `hook` method.
It may return a synchronous or asynchronous cleanup function. OpenCode awaits
the cleanup when the plugin is unloaded or replaced:

```ts
setup: async (ctx) => {
  const timer = setInterval(refresh, 60_000)
  return () => clearInterval(timer)
}
```

Configuration supplied for the plugin is available as `ctx.options`.

A registration may be removed early through `dispose`:

```ts
const registration = await ctx.model.transform(applyModelPolicy)
await registration.dispose()
```

## GUI Plugins

A Desktop GUI plugin is a package with a `./gui` export. Add the package to the user's global `plugins` config to authorize
it and make it available across Desktop projects:

```jsonc title="~/.config/opencode/opencode.jsonc"
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["@acme/opencode-project-sessions"],
}
```

Export a synchronous setup from `gui.tsx` using `@opencode/plugin/gui`. GUI-only packages do not need a server entry point.
The server reports their GUI capability and serves a browser bundle to Desktop; the app never runs the plugin's server
entry to render its UI. Keep the GUI entry browser-compatible: OpenCode bundles its dependencies and shares only the GUI
SDK and Solid runtime with the app.

```json title="package.json"
{
  "name": "@acme/opencode-project-sessions",
  "type": "module",
  "exports": { "./gui": "./gui.tsx" },
  "peerDependencies": {
    "@opencode/plugin": "^2.0.28",
    "@opencode/client": "^2.0.28",
    "solid-js": ">=1.9.0"
  }
}
```

```tsx title="gui.tsx"
import { define } from "@opencode/plugin/gui"
import { For } from "solid-js"

export default define({
  id: "project-sessions",
  i18n: { en: { "command.open": "Sessions by project" } },
  setup(ctx) {
    ctx.ui.command({
      id: "open",
      get title() {
        return ctx.t("command.open")
      },
      run() {
        ctx.ui.dialog((dialog) => (
          <For each={ctx.servers.list()}>
            {(server) => <button onClick={() => ctx.sessions.open(server.id, "session-id")}>{server.name}</button>}
          </For>
        ))
      },
    })
  },
})
```

`ctx.servers` returns live, authenticated clients for the servers Desktop lists. Use `server.client.project.list()` and
`server.client.session.list({ project: project.id, parentID: null })` to build a session view; call
`ctx.sessions.open(server.id, session.id)` to navigate to a selected session. The dialog and command registrations are
owned by the GUI plugin and are removed when it is disabled or unloaded. Desktop reads one GUI plugin inventory from
the built-in local server's default location; it does not switch plugin sets as sessions move between projects or load
GUI code from remote servers. Put GUI plugin entries in global config for consistent availability. Persist a GUI plugin's
own state with `ctx.storage.global(key)` or `ctx.storage.globalString(key, initial)`; it is namespaced by the plugin id.

## Transform Hooks

Transform hooks contribute to stateful domains. The editor is synchronous,
so load asynchronous data before registering a transform or reloading its domain:

```ts
const description = await loadReviewerDescription()

await ctx.agent.transform((agent) => {
  agent.update("reviewer", (item) => {
    item.description = description
    item.mode = "subagent"
  })
})
```

Available transform hooks are namespaced by domain:

```ts
ctx.agent.transform
ctx.command.transform
ctx.integration.transform
ctx.mcp.transform
ctx.model.transform
ctx.provider.transform
ctx.reference.transform
ctx.skill.transform
ctx.tool.transform
ctx.vcs.transform
ctx.websearch.transform
```

Provider transforms contribute provider settings and immutable model definitions. After provider availability is resolved,
model transforms edit the complete active-provider candidate collection in order. Use `ctx.model.transform` for runtime
model restrictions; `editor.provider.get()` reads source templates even when their provider is inactive.

```ts
await ctx.model.transform((editor) => {
  editor
    .list()
    .filter((model) => model.cost.some((tier) => tier.output > 20))
    .forEach((model) => {
      editor.remove(model.providerID, model.id)
    })
})
```

## Runtime Hooks

Runtime hooks intercept live operations:

```ts
await ctx.aisdk.hook("sdk", async (event) => {
  if (event.package !== "@ai-sdk/xai") return
  const mod = await import("@ai-sdk/xai")
  event.sdk = mod.createXai(event.options)
})

await ctx.aisdk.hook("language", (event) => {
  if (event.model.providerID !== "xai") return
  event.language = event.sdk.responses(event.model.modelID)
})
```

Session context is mutable immediately before provider dispatch:

```ts
await ctx.session.hook("context", (event) => {
  event.tools.read.description = "Read a file using narrow line ranges."
  delete event.tools.write
})

await ctx.session.hook("retry", (event) => {
  if (event.attempt >= 3) event.decision = { retry: false }
})
```

Promise tools use complete executable tool values with async executors:

```ts
import { Schema } from "effect"

await ctx.tool.transform((tools) => {
  tools.add({
    name: "echo",
    options: { codemode: false },
    description: "Echo text",
    input: Schema.Struct({ text: Schema.String }),
    output: Schema.Struct({ text: Schema.String }),
    execute: async ({ text }) => ({ output: { text }, content: text }),
  })
})
```

## Reloading A Domain

When data captured by a transform changes, reload the affected domain:

```ts
const source = { providers: await loadProviders() }

await ctx.provider.transform((editor) => {
  source.providers.forEach((provider) => editor.add(provider))
})

source.providers = await loadProviders()
await ctx.provider.reload()
```

`loadProviders()` returns entries shaped as `{ info: Provider.Info, models: readonly Model.Info[] }`. Provider reloads
also invalidate the active model result, so every model transform runs again with the refreshed definitions. Model
callbacks edit raw overrides; provider defaults are merged once when the result is committed.

Available reload operations are:

```ts
ctx.agent.reload()
ctx.command.reload()
ctx.integration.reload()
ctx.mcp.reload()
ctx.model.reload()
ctx.provider.reload()
ctx.reference.reload()
ctx.skill.reload()
ctx.tool.reload()
ctx.vcs.reload()
ctx.websearch.reload()
```
