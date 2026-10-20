import { registerCustomTheme } from "@pierre/diffs"
import { LutungCodeTheme } from "./marked-theme"

let registered = false

export function registerLutungCodeTheme() {
  if (registered) return
  registered = true
  registerCustomTheme("LutungCode", () => Promise.resolve(LutungCodeTheme))
}
