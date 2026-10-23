import { expect, it } from "bun:test"
import { panelSpring } from "./panel-motion"

const shared = { duration: 0.3, bounce: 0 }

const scale = { min: 0.15, max: 0.45, reference: 480 }

it("scales the shared spring's time by the square root of the distance against the reference width", () => {
  expect(panelSpring(480, shared, scale)).toEqual(shared)
  expect(panelSpring(260, shared, scale).duration).toBeCloseTo(0.2208, 3)
  expect(panelSpring(260, shared, scale).bounce).toBe(0)
  expect(panelSpring(260, shared, { ...scale, reference: 260 })).toEqual(shared)
})

it("clamps the scaled time between the min and max durations", () => {
  expect(panelSpring(40, shared, scale).duration).toBe(0.15)
  expect(panelSpring(2000, shared, scale).duration).toBe(0.45)
  expect(panelSpring(40, shared, { ...scale, min: 0.2 }).duration).toBe(0.2)
  expect(panelSpring(2000, shared, { ...scale, max: 0.6 }).duration).toBe(0.6)
})

it("stops a min dragged past the max at the max", () => {
  const crossed = { ...scale, min: 0.5, max: 0.3 }
  expect(panelSpring(40, shared, crossed).duration).toBe(0.3)
  expect(panelSpring(480, shared, crossed).duration).toBe(0.3)
  expect(panelSpring(2000, shared, crossed).duration).toBe(0.3)
  expect(panelSpring(40, shared, { ...scale, min: 0.3, max: 0.3 }).duration).toBe(0.3)
})

it("keeps the shared spring when scaling is off or the distance is unknown", () => {
  expect(panelSpring(260, shared, null)).toEqual(shared)
  expect(panelSpring(undefined, shared, scale)).toEqual(shared)
  expect(panelSpring(0, shared, scale)).toEqual(shared)
})
