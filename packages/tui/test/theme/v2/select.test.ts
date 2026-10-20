import { expect, test } from "bun:test"
import { selectTheme, selectThemeMode, supportsThemeMode, themeModes } from "@lutungcode/theme/tui"
import { getLutungCodeTheme } from "../../../src/theme"

test("selects complete light and dark themes independently", () => {
  const light = selectTheme(getLutungCodeTheme(), "light")
  const dark = selectTheme(getLutungCodeTheme(), "dark")
  expect(selectTheme(getLutungCodeTheme())).toEqual(light)
  expect(light.hue).toEqual(getLutungCodeTheme().light.hue)
  expect(dark.text).toEqual(getLutungCodeTheme().base.text)
  expect(dark.hue).toEqual(getLutungCodeTheme().dark.hue)
  expect(selectThemeMode(getLutungCodeTheme(), "dark")).toEqual({ theme: dark, mode: "dark" })
})

test("selects the available mode when the requested mode is missing", () => {
  const lightOnly = { base: getLutungCodeTheme().base, light: getLutungCodeTheme().light } as const
  const darkOnly = { base: getLutungCodeTheme().base, dark: getLutungCodeTheme().dark } as const

  expect(themeModes(lightOnly)).toEqual(["light"])
  expect(themeModes(darkOnly)).toEqual(["dark"])
  expect(supportsThemeMode(lightOnly, "light")).toBeTrue()
  expect(supportsThemeMode(lightOnly, "dark")).toBeFalse()
  expect(selectThemeMode(lightOnly, "dark")).toEqual({ theme: selectTheme(getLutungCodeTheme(), "light"), mode: "light" })
  expect(selectThemeMode(darkOnly, "light")).toEqual({ theme: selectTheme(getLutungCodeTheme(), "dark"), mode: "dark" })
})
