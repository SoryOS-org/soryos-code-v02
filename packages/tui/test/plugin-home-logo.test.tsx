import { expect, test } from "bun:test"
import { createAppFixture } from "./fixture/app"
import { copyPlugin } from "./fixture/fixture"

// The first wordmark row's left column. Every character is a glyph the Logo
// renders verbatim, so the row survives cursor placement and theme colors, and
// both covered widths lay the two columns out on separate lines.
const wordmark = "█▀▀█ █▀▀█ █▀▀█ █▀▀▄"

test.each([100, 44])("Home keeps the built-in wordmark at %i columns when no plugin claims home.logo", async (width) => {
  await using setup = await createAppFixture({ width, height: 30 })
  await setup.ready
  const frame = await setup.waitForFrame((frame) => frame.includes(wordmark))
  expect(frame).toContain(wordmark)
  expect(frame).toContain("Ask anything…")
})

test.each([100, 44])("a plugin claiming home.logo replaces the wordmark at %i columns", async (width) => {
  await using plugin = await copyPlugin("home-logo")
  await using setup = await createAppFixture({
    width,
    height: 30,
    config: { animations: false, plugins: [plugin.directory] },
  })
  await setup.ready
  const frame = await setup.waitForFrame((frame) => frame.includes("Plugin home wordmark"))
  expect(frame).toContain("Plugin home wordmark")
  expect(frame).not.toContain(wordmark)
  expect(frame).toContain("Ask anything…")
})
