import { expect, it } from "bun:test"
import { panelSpring } from "./panel-motion"

const shared = { duration: 0.3, bounce: 0 }

it("scales the shared spring's time by the square root of the distance against 480px", () => {
  expect(panelSpring(480, shared, true)).toEqual(shared)
  expect(panelSpring(260, shared, true).duration).toBeCloseTo(0.2208, 3)
  expect(panelSpring(260, shared, true).bounce).toBe(0)
})

it("clamps the scaled time between 0.15s and 0.45s", () => {
  expect(panelSpring(40, shared, true).duration).toBe(0.15)
  expect(panelSpring(2000, shared, true).duration).toBe(0.45)
})

it("keeps the shared spring when scaling is off or the distance is unknown", () => {
  expect(panelSpring(260, shared, false)).toEqual(shared)
  expect(panelSpring(undefined, shared, true)).toEqual(shared)
  expect(panelSpring(0, shared, true)).toEqual(shared)
})
