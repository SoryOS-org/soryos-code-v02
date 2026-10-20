import { expect, test } from "bun:test"
import { Effect } from "effect"
import { fromPromise } from "../src/promise/adapter.js"

function host(methods: { generate: { text: () => Effect.Effect<unknown, unknown> } }) {
  return new Proxy(methods, {
    get(target, key) {
      if (key in target) return target[key as keyof typeof target]
      return new Proxy(() => undefined, { get: () => () => undefined })
    },
  })
}

test("adapted API methods are interrupted by the request signal", async () => {
  const plugin = fromPromise({
    id: "test.request-signal",
    async setup(context) {
      const controller = new AbortController()
      setTimeout(() => controller.abort(), 10)
      const pending = context.generate.text({ prompt: "wait" }, { signal: controller.signal })
      await expect(pending).rejects.toThrow("All fibers interrupted")
    },
  })
  const context = host({ generate: { text: () => Effect.never } })
  await Effect.runPromise(Effect.scoped(plugin.effect(context as unknown as Parameters<typeof plugin.effect>[0])))
}, 10_000)
