import { Plugin } from "@opencode/core/plugin"
import { PluginUpdate } from "@opencode/core/plugin/update"
import { InvalidRequestError, ServiceUnavailableError } from "@opencode/protocol/errors"
import { Cause, Effect, Exit, Schema } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Api } from "../api"
import { response } from "../location"

export const PluginHandler = HttpApiBuilder.group(Api, "server.plugin", (handlers) =>
  handlers
    .handle("plugin.gui", (ctx) =>
      Effect.gen(function* () {
        const plugins = yield* Plugin.Service
        const gui = yield* plugins.gui(ctx.payload.id)
        if (!gui)
          return yield* new InvalidRequestError({
            message: `Plugin does not have an active GUI entry: ${ctx.payload.id}`,
            field: "id",
          })

        const options = yield* Schema.decodeUnknownEffect(Schema.Record(Schema.String, Schema.Json))(gui.options).pipe(
          Effect.mapError(
            () =>
              new ServiceUnavailableError({
                message: `GUI plugin options are not JSON serializable: ${ctx.payload.id}`,
                service: "plugin",
              }),
          ),
        )
        const built = yield* Effect.tryPromise({
          try: async () => {
            const { buildGuiBundle } = await import("../gui-bundle")

            return buildGuiBundle(gui.entrypoint)
          },
          catch: (cause) =>
            new ServiceUnavailableError({
              message: `Failed to build GUI plugin: ${ctx.payload.id}: ${String(cause)}`,
              service: "plugin",
            }),
        })
        if (!built.success || !built.outputs[0])
          return yield* new ServiceUnavailableError({
            message: `Failed to build GUI plugin: ${ctx.payload.id}`,
            service: "plugin",
          })

        const source = yield* Effect.promise(() => built.outputs[0].text())
        return yield* response(Effect.succeed({ source, options }))
      }),
    )
    .handle("plugin.list", () =>
      Effect.gen(function* () {
        return yield* response(Plugin.Service.use((plugin) => plugin.list()))
      }),
    )
    .handle("plugin.check", (ctx) =>
      Effect.gen(function* () {
        const plugins = yield* Plugin.Service
        const inventory = yield* plugins.list()
        const targets = [
          ...new Set(inventory.flatMap((plugin) => (plugin.source.type === "package" ? [plugin.source.target] : []))),
        ].filter((target) => ctx.payload.target === undefined || target === ctx.payload.target)
        if (ctx.payload.target !== undefined && !targets.length)
          return yield* new InvalidRequestError({
            message: `Plugin package is not in the current server inventory: ${ctx.payload.target}`,
            field: "target",
          })
        const updates = yield* PluginUpdate.Service
        const outdated = new Map(
          yield* Effect.forEach(
            targets,
            (target) => updates.check(target, { refresh: true }).pipe(Effect.map((value) => [target, value] as const)),
            { concurrency: "unbounded" },
          ),
        )
        return yield* response(
          Effect.succeed(
            inventory.map((plugin) => {
              if (plugin.source.type !== "package" || !outdated.has(plugin.source.target)) return plugin
              return {
                ...plugin,
                source: {
                  type: "package" as const,
                  target: plugin.source.target,
                  ...(plugin.source.version ? { version: plugin.source.version } : {}),
                  ...(outdated.get(plugin.source.target) ? { outdated: true as const } : {}),
                  ...(plugin.source.updating ? { updating: true as const } : {}),
                },
              }
            }),
          ),
        )
      }),
    )
    .handle("plugin.update", (ctx) =>
      Effect.gen(function* () {
        const plugins = yield* Plugin.Service
        const inventory = new Set(
          (yield* plugins.list()).flatMap((plugin) => (plugin.source.type === "package" ? [plugin.source.target] : [])),
        )
        const unknown = ctx.payload.targets.filter((target) => !inventory.has(target))
        if (unknown.length)
          return yield* new InvalidRequestError({
            message: `Plugin packages are not in the current server inventory: ${unknown.join(", ")}`,
            field: "targets",
          })
        const updates = yield* PluginUpdate.Service
        // Let every update run to completion instead of interrupting the rest on the first failure.
        const failures = yield* Effect.forEach(
          ctx.payload.targets,
          (target) =>
            updates.update(target).pipe(
              Effect.exit,
              Effect.map((exit) => (Exit.isFailure(exit) ? [`${target}: ${Cause.pretty(exit.cause)}`] : [])),
            ),
          { concurrency: "unbounded" },
        ).pipe(Effect.map((results) => results.flat()))
        if (failures.length)
          return yield* new ServiceUnavailableError({
            message: `Failed to update plugin packages: ${failures.join("; ")}`,
            service: "plugin",
          })
      }),
    ),
)
