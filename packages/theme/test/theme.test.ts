import { expect, test } from "bun:test"
import { migrateV1, parseThemeDocument, resolveThemeDocument } from "../src/tui/index.js"
import type { ThemeV1Json } from "../src/tui/v1.js"

const source: ThemeV1Json = await Bun.file(
  new URL("../../tui/src/theme/assets/opencode.json", import.meta.url),
).json()
const document = migrateV1(source)

test.each(["light", "dark"] as const)("resolves %s themes without status tokens", (mode) => {
  const theme = resolveThemeDocument(document, mode)
  expect("status" in theme.text).toBeFalse()
  expect(theme.hue.accent[800]).toBeDefined()
  expect(theme.hue.interactive[800]).toBeDefined()
})

function brokenToken(token: string) {
  const copy = structuredClone(document) as unknown as {
    base: { background: Record<string, string> }
  }
  return {
    remove: () => delete copy.base.background[token],
    set: (value: string) => (copy.base.background[token] = value),
    parse: () => parseThemeDocument(copy, "broken"),
  }
}

test("names the token when a required key is missing", () => {
  const theme = brokenToken("base")
  theme.remove()
  expect(theme.parse).toThrow("base.background.base: Missing key")
})

test("names the token and value when a color is invalid", () => {
  const theme = brokenToken("base")
  theme.set("#zz")
  expect(theme.parse).toThrow('base.background.base: got "#zz"')
})

test("keeps the reason a theme reference could not be resolved", () => {
  const theme = brokenToken("base")
  theme.set("$missing.color")
  expect(theme.parse).toThrow('Theme reference "$missing.color" was not found')
})

