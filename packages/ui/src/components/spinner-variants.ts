// Dot-matrix variations of the activity spinner, Soft Radar by default and others from Knobs → Experiments → "Activity
// spinner". Each variation
// is plain data: a dot layout, a keyframe shape, and a pattern that turns each dot's place (angle, distance, path
// index…) into its animation delay. Animation is CSS only; every dot shares the variation's loop, so pinning start
// times with syncSpinPhase keeps every spinner on screen in phase. Paste replacements from the prototype's
// "Try in app" list.

export type SpinnerPattern =
  | "sweep"
  | "bar"
  | "diagonal"
  | "ripple"
  | "twinkle"
  | "border"
  | "breathe"
  | "spiral"
  | "rain"
  | "pulse"

export type SpinnerVariant = {
  label: string
  /** "grid" is span × span; "orb" is the 37-dot circle (rows of 3, 5, 7, 7, 7, 5, 3). */
  layout: "grid" | "orb"
  span: number
  /** Dot side and gap, in a 16-unit viewBox. */
  dot: number
  gap: number
  /** Seconds per loop at 1×. */
  loop: number
  pattern: SpinnerPattern
  /** How far apart neighbouring dots light, for the patterns that spread outward. */
  spread?: number
  /** The centre dot stays lit (radars and scan lines). */
  steady?: boolean
  /** Resting opacity of an unlit dot. */
  dim: number
  /** The keyframe shape: [percent of the loop, level from 0 (dim) to 1 (lit)]. With a head, the trail it leaves. */
  stops: readonly (readonly [number, number])[]
  /**
   * Sweeps on a grid: the head is the brightest dot and `stops` only fade behind it. "step" lights the dot nearest the
   * head on each square ring; "glide" shares the head between the two dots either side of it, so it moves continuously.
   */
  head?: "step" | "glide"
}

// Soft Radar's trail: its ease-in-out fade over 48% of the loop, sampled every 4%, from a level below the head's.
const fade = [1, 0.987, 0.934, 0.812, 0.599, 0.384, 0.238, 0.143, 0.081, 0.041, 0.017, 0.004, 0]

function trail(from: number) {
  return [...fade.map((level, index) => [index * 4, round(from * level)] as const), [100, 0] as const]
}

export const spinnerVariants = {
  radar: {
    label: "Soft Radar",
    layout: "grid",
    span: 5,
    dot: 2,
    gap: 1,
    loop: 1.8,
    pattern: "sweep",
    steady: true,
    dim: 0.2,
    head: "step",
    stops: trail(0.55),
  },
  orbRadar: {
    label: "Orb Radar",
    layout: "orb",
    span: 7,
    dot: 1.5,
    gap: 0.72,
    loop: 2.2,
    pattern: "sweep",
    steady: true,
    dim: 0.2,
    stops: [
      [0, 0],
      [3, 1],
      [62, 0],
      [100, 0],
    ],
  },
  ripple: {
    label: "Centre Ripple",
    layout: "grid",
    span: 5,
    dot: 2,
    gap: 1,
    loop: 1.5,
    pattern: "ripple",
    spread: 0.28,
    dim: 0.2,
    stops: [
      [0, 0],
      [3, 1],
      [37, 0],
      [100, 0],
    ],
  },
  snake: {
    label: "Border Snake",
    layout: "grid",
    span: 4,
    dot: 2.6,
    gap: 1.3,
    loop: 1.2,
    pattern: "border",
    dim: 0.2,
    stops: [
      [0, 0],
      [3, 1],
      [33, 0],
      [100, 0],
    ],
  },
  spiral: {
    label: "Spiral Fill",
    layout: "grid",
    span: 5,
    dot: 2,
    gap: 1,
    loop: 3,
    pattern: "spiral",
    dim: 0.2,
    stops: [
      [0, 0],
      [3, 1],
      [48, 1],
      [54, 0],
      [100, 0],
    ],
  },
  breathe: {
    label: "Breathing Grid",
    layout: "grid",
    span: 3,
    dot: 3.6,
    gap: 2,
    loop: 2,
    pattern: "breathe",
    spread: 0.05,
    dim: 0.2,
    stops: [
      [0, 0],
      [8, 0],
      [50, 1],
      [92, 0],
      [100, 0],
    ],
  },
  // Soft Radar's sweep without the steps: the head lights the two dots either side of it on each ring in proportion
  // to how close it is, so it glides between them. Last, because Knobs saves a choice by its index.
  radarSmooth: {
    label: "Soft Radar (smooth)",
    layout: "grid",
    span: 5,
    dot: 2,
    gap: 1,
    loop: 1.8,
    pattern: "sweep",
    steady: true,
    dim: 0.2,
    head: "glide",
    stops: trail(0.35),
  },
} satisfies Record<string, SpinnerVariant>

export type SpinnerDot = {
  x: number
  y: number
  size: number
  /** Where in the loop the dot lights, 0–1. */
  at: number
  /** The dot's loop as a multiple of the variation's (twinkle varies it). */
  scale: number
  /** Always lit, or never animated (the resting middle of a border pattern). */
  hold?: "lit" | "rest"
  /** Opacity for reduced motion: the pattern frozen a fifth of the way into its loop. */
  still: number
  /** Which of the variation's keyframes the dot runs: spinnerKeyframes names them `name-0`, `name-1`… */
  shape: number
}

type Cell = { c: number; r: number; gx: number; gy: number }

/** The dots of a variation, positioned in a 16-unit viewBox. */
export function spinnerDots(variant: SpinnerVariant) {
  return layout(variant).dots
}

/** The variation's keyframes, one per shape its dots run, named `name-0`, `name-1`… */
export function spinnerKeyframes(name: string, variant: SpinnerVariant) {
  return layout(variant)
    .shapes.map((stops, index) => {
      const frames = stops
        .map(
          ([percent, level]) =>
            `${round(percent)}%{opacity:${round(variant.dim + (1 - variant.dim) * level)};animation-timing-function:${variant.head ? "linear" : "cubic-bezier(.45,0,.2,1)"}}`,
        )
        .join("")

      return `@keyframes ${name}-${index}{${frames}}`
    })
    .join("")
}

function layout(variant: SpinnerVariant) {
  const cells = variant.layout === "orb" ? orb() : grid(variant.span)
  const extent = variant.span * variant.dot + (variant.span - 1) * variant.gap
  const fit = Math.min(1, 15 / extent)
  const size = variant.dot * fit
  const pitch = (variant.dot + variant.gap) * fit
  const order = variant.pattern === "spiral" ? spiralOrder(variant.span) : []
  const ring = variant.pattern === "border" ? borderOrder(variant.span) : []
  const random = seeded(4242)
  const offsets = Array.from({ length: variant.span }, () => random())

  const placed = cells.map((cell) => {
    const centre = cell.gx === 0 && cell.gy === 0

    const twinkle =
      variant.pattern === "twinkle" ? { at: random(), scale: [1, 1.35, 1.7][Math.floor(random() * 3)]! } : undefined

    const at = (() => {
      const spread = variant.spread ?? 1
      const dist = Math.hypot(cell.gx, cell.gy)

      switch (variant.pattern) {
        case "sweep":
          return angle(cell)
        case "bar":
          return frac(angle(cell) * 2)
        case "diagonal":
          return (cell.c + cell.r) / (2 * variant.span - 1)
        case "ripple":
        case "breathe":
        case "pulse":
          return frac(dist * spread)
        case "twinkle":
          return twinkle!.at
        case "border":
          return Math.max(0, ring.indexOf(cell.r * variant.span + cell.c)) / ring.length
        case "spiral":
          return order.indexOf(cell.r * variant.span + cell.c) / (2 * order.length)
        case "rain":
          return frac(offsets[cell.c]! + cell.r * spread * 0.11)
      }
    })()

    const hold =
      variant.steady && centre
        ? ("lit" as const)
        : variant.pattern === "border" && !ring.includes(cell.r * variant.span + cell.c)
          ? ("rest" as const)
          : undefined

    return { cell, at, hold, scale: twinkle?.scale ?? 1 }
  })

  // With a head, each dot's shape depends on how far it sits from its neighbours on its square ring, in loop fractions.
  const keys = placed.map((dot) => {
    if (!variant.head || dot.hold) return ""
    const ringOf = (cell: Cell) => Math.max(Math.abs(cell.gx), Math.abs(cell.gy))
    const others = placed.filter((other) => other !== dot && !other.hold && ringOf(other.cell) === ringOf(dot.cell))
    const behind = Math.min(...others.map((other) => frac(dot.at - other.at)))
    const ahead = Math.min(...others.map((other) => frac(other.at - dot.at)))
    return `${round(behind)} ${round(ahead)}`
  })
  const unique = [...new Set(keys.filter((key) => key !== ""))]
  const shapes = variant.head
    ? unique.map((key) => {
        const [behind, ahead] = key.split(" ").map(Number)
        return headStops(variant, behind! * 100, ahead! * 100)
      })
    : [variant.stops]

  const dots = placed.map((dot, index): SpinnerDot => {
    const shape = Math.max(0, unique.indexOf(keys[index]!))
    // A steady centre glows like the fresh trail, so the head stays the brightest dot.
    const lit = variant.head ? variant.stops[0]![1] : 1
    const level =
      dot.hold === "lit" ? lit : dot.hold === "rest" ? 0 : levelAt(shapes[shape]!, frac(0.22 - dot.at) * 100)

    return {
      x: round(8 + dot.cell.gx * pitch - size / 2),
      y: round(8 + dot.cell.gy * pitch - size / 2),
      size: round(size),
      at: round(dot.at),
      scale: dot.scale,
      hold: dot.hold,
      still: round(variant.dim + (1 - variant.dim) * level),
      shape,
    }
  })

  return { dots, shapes }
}

// One dot's level through the loop, 0% being the moment the head passes it, with `behind` and `ahead` the percent of
// the loop to its neighbours on its ring. "step" lights it while it's the dot nearest the head; "glide" rises linearly
// from the neighbour behind and falls linearly toward the one ahead. Then the trail takes over, never above the head.
function headStops(variant: SpinnerVariant, behind: number, ahead: number): (readonly [number, number])[] {
  const edge = 1.5
  const trailAt = (percent: number) => levelAt(variant.stops, percent)
  const tail = (from: number) =>
    variant.stops
      .filter(([percent]) => percent > from && percent < 100)
      .map(([percent, level]) => [percent, level] as const)

  if (variant.head === "step") {
    const off = ahead / 2 + edge
    const on = 100 - behind / 2
    return [
      [0, 1],
      [ahead / 2, 1],
      [off, trailAt(off)],
      ...tail(off).filter(([percent]) => percent < on - edge),
      [on - edge, 0],
      [on, 1],
      [100, 1],
    ]
  }

  // Where the falling edge meets the trail.
  const meet = Array.from({ length: 40 }).reduce<[number, number]>(
    ([lo, hi]) => {
      const mid = (lo + hi) / 2
      return 1 - mid / ahead > trailAt(mid) ? [mid, hi] : [lo, mid]
    },
    [0, ahead],
  )[0]
  const on = 100 - behind
  return [[0, 1], [meet, trailAt(meet)], ...tail(meet).filter(([percent]) => percent < on), [on, 0], [100, 1]]
}

function grid(span: number): Cell[] {
  return Array.from({ length: span * span }, (_, index) => {
    const c = index % span
    const r = Math.floor(index / span)

    return { c, r, gx: c - (span - 1) / 2, gy: r - (span - 1) / 2 }
  })
}

function orb(): Cell[] {
  return [3, 5, 7, 7, 7, 5, 3].flatMap((count, r) =>
    Array.from({ length: count }, (_, j) => {
      const c = (7 - count) / 2 + j

      return { c, r, gx: c - 3, gy: r - 3 }
    }),
  )
}

// Clockwise from the top-left corner, as indices into a span × span grid.
function borderOrder(span: number) {
  const top = Array.from({ length: span }, (_, c) => c)
  const right = Array.from({ length: span - 2 }, (_, r) => (r + 1) * span + span - 1)
  const bottom = Array.from({ length: span }, (_, c) => (span - 1) * span + span - 1 - c)
  const left = Array.from({ length: span - 2 }, (_, r) => (span - 2 - r) * span)

  return [...top, ...right, ...bottom, ...left]
}

// Inward from the top-left corner, clockwise.
function spiralOrder(span: number) {
  const order: number[] = []
  const edges = { top: 0, left: 0, bottom: span - 1, right: span - 1 }

  while (edges.top <= edges.bottom && edges.left <= edges.right) {
    for (let c = edges.left; c <= edges.right; c++) order.push(edges.top * span + c)
    edges.top++

    for (let r = edges.top; r <= edges.bottom; r++) order.push(r * span + edges.right)
    edges.right--

    if (edges.top <= edges.bottom) for (let c = edges.right; c >= edges.left; c--) order.push(edges.bottom * span + c)
    edges.bottom--

    if (edges.left <= edges.right) for (let r = edges.bottom; r >= edges.top; r--) order.push(r * span + edges.left)
    edges.left++
  }

  return order
}

// Clockwise from 12 o'clock, 0–1.
function angle(cell: Cell) {
  return frac(Math.atan2(cell.gx, -cell.gy) / (2 * Math.PI))
}

function levelAt(stops: SpinnerVariant["stops"], percent: number) {
  const next = stops.findIndex(([at]) => at >= percent)

  if (next <= 0) return stops[0]?.[1] ?? 0
  const [p0, l0] = stops[next - 1]!
  const [p1, l1] = stops[next]!

  return l0 + ((l1 - l0) * (percent - p0)) / (p1 - p0 || 1)
}

function seeded(seed: number) {
  const state = { value: seed }

  return () => {
    state.value = (state.value * 16807) % 2147483647

    return (state.value - 1) / 2147483646
  }
}

function frac(value: number) {
  return value - Math.floor(value)
}

function round(value: number) {
  return Math.round(value * 1000) / 1000
}
