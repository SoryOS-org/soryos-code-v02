import { Effect } from "effect"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"
import { ServerConnection } from "../../../services/server-connection"
import { runNonInteractive } from "../../../run/run"

export default Runtime.handler(Commands.commands.github.commands.run, (input) =>
  Effect.gen(function* () {
    const server = yield* ServerConnection.resolve({ standalone: true })
    const prompt = process.env["PROMPT"] || "Summarize this repository"
    yield* Effect.promise(() =>
      runNonInteractive({
        server,
        message: [prompt],
        continue: false,
        session: undefined,
        fork: false,
        model: process.env["MODEL"],
        agent: process.env["AGENT"] || undefined,
        format: "default",
        file: [],
        title: undefined,
        thinking: false,
        auto: true,
      }),
    )
    void input
  }),
)