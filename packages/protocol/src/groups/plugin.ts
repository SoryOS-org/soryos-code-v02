import { Location } from "@opencode/schema/location"
import { Plugin } from "@opencode/schema/plugin"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/http-api"
import { InvalidRequestError, ServiceUnavailableError } from "../errors.js"
import { LocationQuery, locationQueryOpenApi } from "./location.js"

export const PluginGroup = HttpApiGroup.make("server.plugin")
  .add(
    HttpApiEndpoint.get("plugin.list", "/api/plugin", {
      query: LocationQuery,
      success: Location.response(Schema.Array(Plugin.Info)),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "plugin.list",
          summary: "List plugins",
          description: "Retrieve enabled server plugins and their current status.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("plugin.gui", "/api/plugin/gui", {
      query: LocationQuery,
      payload: Schema.Struct({ id: Schema.String }),
      success: Location.response(
        Schema.Struct({
          source: Schema.String,
          options: Schema.Record(Schema.String, Schema.Json),
        }),
      ),
      error: [InvalidRequestError, ServiceUnavailableError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "plugin.gui",
          summary: "Load a configured GUI plugin",
          description: "Return the browser bundle and configured options for an active GUI plugin.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("plugin.check", "/api/plugin/check", {
      query: LocationQuery,
      payload: Schema.Struct({ target: Schema.String.pipe(Schema.optional) }),
      success: Location.response(Schema.Array(Plugin.Info)),
      error: InvalidRequestError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "plugin.check",
          summary: "Check plugin updates",
          description: "Check one or all package plugins for available updates.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("plugin.update", "/api/plugin/update", {
      query: LocationQuery,
      payload: Schema.Struct({ targets: Schema.Array(Schema.String) }),
      success: HttpApiSchema.NoContent,
      error: [InvalidRequestError, ServiceUnavailableError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "plugin.update",
          summary: "Update plugins",
          description:
            "Update package plugins concurrently and notify active locations to reload them. Responds once every update has finished; fails when any update fails.",
        }),
      ),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "plugin",
      description: "Experimental plugin routes.",
    }),
  )
