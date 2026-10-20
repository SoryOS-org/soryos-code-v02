import { Plugin } from "@lutungcode/plugin/effect"
import { Effect } from "effect"
import { BrowserConnection } from "./connection.js"
import { BrowserTools } from "./tools.js"

export default Plugin.define({
  id: "lutungcode.browser",
  effect: (ctx) =>
    Effect.gen(function* () {
      const connection = yield* BrowserConnection.make(ctx)
      yield* BrowserTools.register(ctx, connection)
    }),
})
