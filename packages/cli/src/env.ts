import { Config } from "effect"
import { env } from "@lutungcode/util/identity"

// Every environment variable the CLI reads, in one place. Consumers yield
// these instead of touching process.env so the full surface stays visible,
// typed, and redacted where secret.

// The server password: sent by clients connecting to an explicit --server,
// and adopted by a manually run or standalone server. LUTUNGCODE_SERVER_PASSWORD
// remains accepted.
export const password = Config.Redacted(env.password).pipe(
  Config.orElse(() => Config.Redacted(env.serverPassword)),
  Config.withDefault(undefined),
)

export function session() {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && entry[0] !== "LUTUNGCODE_PASSWORD" && entry[0] !== "LUTUNGCODE_SERVER_PASSWORD",
    ),
  )
}

export * as Env from "./env"
