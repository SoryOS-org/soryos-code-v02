import { Effect } from "effect"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"

export default Runtime.handler(Commands.commands.github.commands.run, (input) =>
  Effect.sync(() => {
    process.stderr.write("opencode github run is not yet implemented in v2\n")
    process.exitCode = 1
  }),
)