import { expect, test } from "bun:test"
import { normalizeZoomFactor } from "./zoom-factor"

test("falls back to 1 for missing, invalid or out-of-range values", () => {
  for (const value of [undefined, null, "1.2", -1, 0, 11, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(normalizeZoomFactor(value)).toBe(1)
  }
})

test("keeps values inside the supported range", () => {
  expect(normalizeZoomFactor(0.2)).toBe(0.2)
  expect(normalizeZoomFactor(1.5)).toBe(1.5)
  expect(normalizeZoomFactor(10)).toBe(10)
})
