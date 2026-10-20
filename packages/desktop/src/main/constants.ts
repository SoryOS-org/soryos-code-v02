import { app } from "electron"

type Channel = "local" | "dev" | "beta" | "prod"

const raw = import.meta.env.LUTUNGCODE_CHANNEL

export const CHANNEL: Channel = raw === "local" || raw === "dev" || raw === "beta" || raw === "prod" ? raw : "dev"

export const VERSION = app.isPackaged ? app.getVersion() : (process.env.LUTUNGCODE_VERSION ?? app.getVersion())

const appNames: Record<string, string> = {
  dev: "LutungCode Dev",
  beta: "LutungCode Beta",
  prod: "LutungCode",
}

const appIDs: Record<string, string> = {
  dev: "app.lutungcode.desktop.dev",
  beta: "app.lutungcode.desktop.beta",
  prod: "app.lutungcode.desktop",
}

// Local renderer/server mode keeps the dev application identity.
export const APP_NAME = app.isPackaged ? appNames[CHANNEL] : "LutungCode Dev"

export const APP_ID = app.isPackaged ? appIDs[CHANNEL] : "app.lutungcode.desktop.dev"
