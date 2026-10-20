import { resolveThemeVariant } from "@opencode/ui/theme/resolve"
import type { DesktopTheme } from "@opencode/ui/theme/types"
import { Option, Schema } from "effect"
import { nativeTheme } from "electron"
import oc2ThemeJson from "../../../../ui/src/theme/themes/oc-2.json"
import { BACKGROUND_COLOR_KEY, TRAFFIC_LIGHT_POSITION_KEY } from "../storage/keys"
import { getStore } from "../storage/store"

// Frame defaults shared by the early window (created on ready, before the renderer exists) and the
// full window setup in appearance.ts, so both draw the same frame.

const oc2Theme = oc2ThemeJson as DesktopTheme

// Match the renderer's 36px titlebar plus its former 8px content inset.
export const titlebarHeight = 44

export function tone() {
  return nativeTheme.shouldUseDarkColors ? "dark" : "light"
}

// The colour the renderer reported on its last run, or the default theme's for the system tone, so
// a window shown before the renderer paints already has the right background. Resolving a palette
// costs tens of milliseconds before the first window, so it only happens when nothing is stored.
export function storedBackgroundColor() {
  const stored = getStore().get(BACKGROUND_COLOR_KEY)

  if (typeof stored === "string") return stored
  const dark = tone() === "dark"

  return resolveThemeVariant(dark ? oc2Theme.dark : oc2Theme.light, dark)["background-base"]
}

export function titlebarOverlay(mode: "light" | "dark" = tone(), zoom = 1) {
  return {
    color: "#00000000",
    symbolColor: mode === "dark" ? "white" : "black",
    height: Math.max(titlebarHeight, Math.round(titlebarHeight * zoom)),
  }
}

const decodeTrafficLightPosition = Schema.decodeUnknownOption(Schema.Struct({ x: Schema.Number, y: Schema.Number }))

// The macOS window buttons' position the renderer last asked for, which depends on its tab layout, so a new window opens
// with them already in place.
export function storedTrafficLightPosition() {
  const stored = decodeTrafficLightPosition(getStore().get(TRAFFIC_LIGHT_POSITION_KEY))

  return Option.getOrElse(stored, () => ({ x: 14, y: 14 }))
}