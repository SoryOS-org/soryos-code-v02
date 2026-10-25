/** @jsxImportSource @opentui/solid */
import { testRender, useKeyboard } from "@opentui/solid"
import { expect, test } from "bun:test"
import { keypadKeyName } from "../src/util/keypad"

test("keypad navigation keys resolve to their regular names", () => {
  expect(
    ["kpup", "kpdown", "kpleft", "kpright", "kppageup", "kppagedown", "kphome", "kpend"].map(keypadKeyName),
  ).toEqual(["up", "down", "left", "right", "pageup", "pagedown", "home", "end"])
})

test("regular names and unrelated keys pass through unchanged", () => {
  for (const name of ["up", "down", "left", "right", "pageup", "pagedown", "home", "end", "escape", "return", "kp0"])
    expect(keypadKeyName(name)).toBe(name)
})

test("a keypad key satisfies a handler that compares regular key names", async () => {
  // Mirrors the guard the error screen, the error details dialog, the /btw answer and the
  // mini footers use: a comparison against the regular key name.
  const fired: string[] = []

  function Harness() {
    useKeyboard((event) => {
      if (keypadKeyName(event.name) === "end") fired.push(event.name)
    })
    return <box />
  }

  const app = await testRender(() => <Harness />)
  try {
    // Kitty keyboard protocol: keypad End reports codepoint 57424.
    app.renderer.stdin.emit("data", Buffer.from("\x1b[57424;1:1u"))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(fired).toEqual(["kpend"])

    // The regular End key keeps working.
    app.renderer.stdin.emit("data", Buffer.from("\x1b[4~"))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(fired).toEqual(["kpend", "end"])
  } finally {
    app.renderer.destroy()
  }
})
