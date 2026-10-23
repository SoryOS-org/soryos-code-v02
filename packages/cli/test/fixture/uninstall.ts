import { NodeServices } from "@effect/platform-node"
import { Global } from "@opencode/util/global"
import { Effect, Logger } from "effect"
import path from "node:path"
import uninstall from "../../src/commands/handlers/uninstall"
import { Updater } from "../../src/services/updater"

const root = process.argv[2]
const mode = process.argv[3]
if (process.env.OPENCODE_TEST_HOME !== root) throw new Error("Expected an isolated test home")
const global = Global.make(
  Object.fromEntries(
    ["home", "data", "cache", "config", "state", "tmp", "bin", "log", "repos"].map((key) => [
      key,
      path.join(root, key),
    ]),
  ),
)
const unused = Effect.die("Unexpected updater operation")
const updater = Updater.Service.of({
  run: () => unused,
  check: () => unused,
  apply: () => unused,
  method: () => Effect.succeed("npm"),
  latest: () => unused,
  upgrade: () => unused,
  removal: () => ({
    command: ["npm", "uninstall", "--global", "@opencode/cli"],
    run: Effect.gen(function* () {
      yield* Effect.tryPromise(() => Bun.write(path.join(root, "removal-called"), "yes"))
      if (mode === "failure") return yield* Effect.fail(new Error("fixture removal failed"))
      return {
        retainedDirectory:
          mode === "ordinary" ? undefined : path.join(root, "npm prefix", ".opencode", "retained-images"),
      }
    }),
  }),
})

await Effect.runPromise(
  Effect.scoped(uninstall({ force: true, dryRun: mode === "dry-run" })).pipe(
    Effect.provideService(Global.Service, global),
    Effect.provideService(Updater.Service, updater),
    Effect.provide(NodeServices.layer),
    // Match normal CLI use: diagnostic logging is not terminal output.
    Effect.provide(Logger.layer([])),
  ),
)
