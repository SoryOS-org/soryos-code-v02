import { expect, test } from "bun:test"
import { TuiKeybind } from "../src/config/keybind"

test("binds agent cycling only to shift+tab by default", () => {
  expect(TuiKeybind.Definitions["agent.cycle"].default).toBe("shift+tab")
  expect(TuiKeybind.Definitions["agent.cycle.reverse"].default).toBe("none")
})

test("binds harness trace disclosure to a direct mac-safe chord and leader h", () => {
  expect(TuiKeybind.Definitions["session.toggle.harness_traces"].default).toBe("ctrl+alt+h,<leader>h")
})
