import { expect, test } from "bun:test"
import { spinnerDots, spinnerKeyframes, spinnerVariants } from "./spinner-variants"

test("every variation's dots fit the viewBox and light within one loop", () => {
  Object.values(spinnerVariants).forEach((variant) => {
    const dots = spinnerDots(variant)

    expect(dots.length).toBe(variant.layout === "orb" ? 37 : variant.span ** 2)
    dots.forEach((dot) => {
      expect(dot.x).toBeGreaterThanOrEqual(0)
      expect(dot.x + dot.size).toBeLessThanOrEqual(16)
      expect(dot.at).toBeGreaterThanOrEqual(0)
      expect(dot.at).toBeLessThan(1)
      expect(dot.still).toBeGreaterThanOrEqual(variant.dim)
      expect(dot.still).toBeLessThanOrEqual(1)
    })
  })
})

test("a border snake rests its middle dots and visits each edge dot once", () => {
  const dots = spinnerDots(spinnerVariants.snake)
  const edge = dots.filter((dot) => !dot.hold)

  expect(dots.filter((dot) => dot.hold === "rest")).toHaveLength(4)
  expect(new Set(edge.map((dot) => dot.at)).size).toBe(12)
})

test("keyframes run from the dim rest to fully lit", () => {
  expect(spinnerKeyframes("spinner-radar", spinnerVariants.radar)).toBe(
    "@keyframes spinner-radar{0%{opacity:0.2;animation-timing-function:cubic-bezier(.45,0,.2,1)}3%{opacity:1;animation-timing-function:cubic-bezier(.45,0,.2,1)}51%{opacity:0.2;animation-timing-function:cubic-bezier(.45,0,.2,1)}100%{opacity:0.2;animation-timing-function:cubic-bezier(.45,0,.2,1)}}",
  )
})
