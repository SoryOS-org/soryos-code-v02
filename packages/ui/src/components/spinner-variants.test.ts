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
  expect(spinnerKeyframes("spinner-ripple", spinnerVariants.ripple)).toBe(
    "@keyframes spinner-ripple-0{0%{opacity:0.2;animation-timing-function:cubic-bezier(.45,0,.2,1)}3%{opacity:1;animation-timing-function:cubic-bezier(.45,0,.2,1)}37%{opacity:0.2;animation-timing-function:cubic-bezier(.45,0,.2,1)}100%{opacity:0.2;animation-timing-function:cubic-bezier(.45,0,.2,1)}}",
  )
})

test.each(["radar", "radarSmooth"] as const)(
  "%s's brightest dot is never more than half a dot from its head",
  (name) => {
    const variant = spinnerVariants[name]
    const css = spinnerKeyframes(name, variant)
    // Head keyframes are linear, so each dot's opacity is a straight line between stops.
    expect(css).not.toContain("cubic-bezier")
    const shapes = [...css.matchAll(/@keyframes [\w-]+\{(.*?)\}\}/g)].map((match) =>
      [...match[1]!.matchAll(/([\d.]+)%\{opacity:([\d.]+)/g)].map(
        (stop) => [Number(stop[1]), Number(stop[2])] as const,
      ),
    )
    const opacity = (shape: number, percent: number) => {
      const stops = shapes[shape]!
      const next = stops.findIndex(([at]) => at >= percent)
      if (next <= 0) return stops[0]![1]
      const [p0, o0] = stops[next - 1]!
      const [p1, o1] = stops[next]!
      return o0 + ((o1 - o0) * (percent - p0)) / (p1 - p0)
    }
    const dots = spinnerDots(variant)
    const centre = dots.find((dot) => dot.hold === "lit")!
    const ring = dots
      .filter((dot) => !dot.hold)
      .map((dot) => ({
        ...dot,
        ring: Math.round(Math.max(Math.abs(dot.x + dot.size / 2 - 8), Math.abs(dot.y + dot.size / 2 - 8))),
      }))
    const wrap = (turns: number) => turns - Math.round(turns)

    Array.from({ length: 360 }, (_, step) => step / 360).forEach((head) => {
      const lit = ring.map((dot) => opacity(dot.shape, ((((head - dot.at) % 1) + 1) % 1) * 100))
      const top = Math.max(...lit)
      const brightest = ring.filter((_, index) => lit[index]! > top - 1e-9)

      expect(top).toBeGreaterThan(centre.still)
      brightest.forEach((dot) => {
        const offset = wrap(dot.at - head)
        // The gap to the neighbour on the head's side, on the dot's own ring.
        const gap = Math.min(
          ...ring
            .filter(
              (other) =>
                other.ring === dot.ring && other !== dot && Math.sign(wrap(other.at - dot.at)) === -Math.sign(offset),
            )
            .map((other) => Math.abs(wrap(other.at - dot.at))),
        )
        expect(Math.abs(offset)).toBeLessThanOrEqual(gap / 2 + 0.003)
      })
    })
  },
)
