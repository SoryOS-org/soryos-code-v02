import path from "node:path"
import { databaseFilename, env } from "@lutungcode/util/identity"
import { LUTUNGCODE_CHANNEL } from "./version"

export function databasePath(data: string) {
  const filename =
    process.env[env.database] ??
    (["latest", "dev", "beta", "next", "prod"].includes(LUTUNGCODE_CHANNEL) ||
    process.env[env.disableChannelDb] === "1" ||
    process.env[env.disableChannelDb] === "true"
      ? databaseFilename
      : `lutungcode-${LUTUNGCODE_CHANNEL.replace(/[^a-zA-Z0-9._-]/g, "-")}.db`)
  return filename === ":memory:" ? filename : path.resolve(data, filename)
}
