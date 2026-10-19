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

const failure = (input: unknown) => {
  try {
    parseThemeDocument(input, "broken")
    return undefined
  } catch (error) {
    return (error as Error).message
  }
}

const broken = () => {
  const copy = structuredClone(document)
  delete (copy.base.background as Record<string, unknown>).base
  return copy
}

// The toast shows only this message, so it has to name the token that failed rather than a value from
// a message the user cannot see (#57105).
test("names the failing token when a required token is missing", () => {
  expect(failure(broken())).toContain("base.background.base")
  expect(failure(broken())).not.toContain("value is an invalid value")
})

// `parseThemeDocument` wraps decoding and resolution in one try, so a resolution error used to be
// replaced by the generic decode sentence even though it already said what was wrong.
test("passes a reference error through unchanged", () => {
  const copy = structuredClone(document)
  ;(copy.base.background as Record<string, unknown>).base = "$missing"
  expect(failure(copy)).toContain('Theme reference "$missing" was not found')
})
