import { createEffect, createSignal, on, onCleanup, type Accessor } from "solid-js"
import { ease, frameLoop, prefersReducedMotion, Spring, type DurationOptions } from "@opencode/ui/motion"
import { motionTuning } from "@opencode/ui/motion-tuning"

const group = "Sidebars"

// Panels in flight, across the app. Native views, which no DOM box clips, stay hidden while any panel moves.
const [flights, setFlights] = createSignal(0)

export const panelsMoving = () => flights() > 0

// The "James" option, chosen in the preset strip beside Snappy, Smooth and Calm, swaps the section's knobs for its own: layout
// changes in one frame and only the panel moves, a few pixels toward its edge, while it fades. The neighbours beside it
// glide from their old box to the new one. All run as Web Animations, so the compositor plays them through main-thread
// work. The shared spring ships; James stays one choice away.
const james = motionTuning.mode("sidebars.james", { label: "James", group })

const springs = () => !james()

// The left sidebar and the side panel share one spring, so they move as one system.
const spring = motionTuning.spring("sidebars", {
  label: "Spring",
  group,
  when: springs,
  shipped: "smooth",
  presets: {
    snappy: { duration: 0.2, bounce: 0 },
    smooth: { duration: 0.3, bounce: 0 },
    calm: { duration: 0.45, bounce: 0 },
  },
})

const style = motionTuning.choice("sidebars.style", {
  label: "Motion",
  group,
  when: springs,
  value: "spring",
  labels: { spring: "Spring", instant: "Instant" },
})

// How far a panel's contents dim at the closed end of a spring flight; they never black out.
const fadeFloor = motionTuning.number("sidebars.fadeFloor", {
  label: "Fade floor",
  group,
  when: springs,
  value: 0.5,
  min: 0,
  max: 1,
  step: 0.05,
})

/** The opacity of a panel's contents `closed` of the way through a spring flight, from 1 down to the fade floor. */
export const panelOpacity = (closed: number) => (closed === 0 ? "" : `${1 - closed * (1 - fadeFloor())}`)

const jamesShift = motionTuning.spring("sidebars.james.shift", {
  label: "Movement",
  group,
  when: james,
  shipped: "smooth",
  presets: {
    snappy: { duration: 0.18, bounce: 0 },
    smooth: { duration: 0.24, bounce: 0 },
    calm: { duration: 0.32, bounce: 0 },
  },
})

const jamesFade = motionTuning.easing("sidebars.james.fade", {
  label: "Fade",
  group,
  when: james,
  value: [0.44, 0.75, 0.63, 1.03],
})

const jamesFadeDuration = motionTuning.number("sidebars.james.fadeDuration", {
  label: "Fade duration",
  group,
  when: james,
  value: 0.18,
  min: 0.05,
  max: 0.6,
  step: 0.01,
  unit: "s",
  time: "duration",
})

/** How far the right side panel shifts in from its edge when James opens it, in pixels. */
export const jamesPanelShift = motionTuning.number("sidebars.james.panelShift", {
  label: "Panel shift",
  group,
  when: james,
  value: 30,
  min: 0,
  max: 48,
  step: 1,
  unit: "px",
})

// "flip" translates the neighbours from their old box on the compositor; "width" animates the resized box's real width,
// re-wrapping its content each frame.
const jamesLayout = motionTuning.choice("sidebars.james.layout", {
  label: "Layout",
  group,
  when: james,
  value: "flip",
  labels: { flip: "Glide (FLIP)", width: "Width", off: "Off" },
})

const layoutSpring = (direction: string, label: string) =>
  motionTuning.spring(`sidebars.james.layout.${direction}`, {
    label,
    group,
    when: () => james() && jamesLayout() !== "off",
    shipped: "smooth",
    presets: {
      snappy: { duration: 0.12, bounce: 0 },
      smooth: { duration: 0.16, bounce: 0 },
      calm: { duration: 0.24, bounce: 0 },
    },
  })

const jamesLayoutOpen = layoutSpring("open", "Layout open")

const jamesLayoutClose = layoutSpring("close", "Layout close")

// The opacity a panel fades up from under James and down to.
const faded = 0.15

/** Where a neighbour's content sits: centred content follows its box's centre, start-pinned content its start edge. */
export type Anchor = "center" | "start"

type Hold = { box: () => HTMLElement | null | undefined; anchor?: () => HTMLElement | null | undefined }

type Landing = {
  /** Paints where the flight lands, then back where it is. */
  land: () => void
  resume: () => void
  /** Starts counting the flight's remaining travel from here, 1 now and 0 where it lands. */
  begin: () => void
  remaining: () => number
}

const holds = new Set<Hold>()

// The spring flights in progress, and the one whose travel carries the held boxes' shift.
const landings = new Set<Landing>()

let driver: Landing | undefined

let held: { box: HTMLElement; shift: number }[] = []

/**
 * Keeps a content box beside the panels at the width it will have once every spring flight lands, so its text wraps
 * once as a flight starts rather than on every frame while its container's width moves. For the flight, the box gets
 * `--panel-hold-width`, which its layout uses in place of its container's width. A box that lands at no width, like the
 * contents of a closing panel, is left to its own layout.
 *
 * `anchor` is an element inside the box whose start edge must not jump when the box takes its landing width: the box
 * shifts by the difference, with a transform, and the shift runs out over the flight.
 */
export function holdLandingWidth(box: Hold["box"], anchor?: Hold["anchor"]) {
  const hold = { box, anchor }
  holds.add(hold)
  onCleanup(() => holds.delete(hold))
}

// Measures every held box with each moving panel painted where it lands. A flight that starts, turns around or lands
// forces a few layouts here; no frame of a flight reads layout.
function rehold(next: Landing | undefined) {
  const flights = [...landings]

  const boxes = flights.length
    ? [...holds].flatMap((hold) => {
        const box = hold.box()

        if (!box?.isConnected) return []
        const anchor = hold.anchor?.()

        return [{ box, anchor, before: anchor ? anchorX(anchor, "start") : undefined }]
      })
    : []

  held.forEach((item) => {
    item.box.style.removeProperty("--panel-hold-width")
    item.box.style.translate = ""
  })
  held = []
  driver = next
  driver?.begin()

  if (boxes.length === 0) return
  flights.forEach((flight) => flight.land())
  const widths = boxes.map((item) => item.box.getBoundingClientRect().width)
  flights.forEach((flight) => flight.resume())
  held = boxes
    .filter((item, index) => {
      if (widths[index] === 0) return false
      item.box.style.setProperty("--panel-hold-width", `${widths[index]}px`)

      return true
    })
    .map((item) => ({
      box: item.box,
      shift: item.anchor && item.before !== undefined ? item.before - anchorX(item.anchor, "start") : 0,
    }))
  shiftHeld()
}

function shiftHeld() {
  const remaining = driver?.remaining() ?? 0
  held.forEach((item) => {
    if (item.shift !== 0) item.box.style.translate = `${item.shift * remaining}px`
  })
}

/** Adds a button that toggles a panel to the Motion workspace's Sidebars section while the panel is mounted. */
export function replayPanelToggle(input: { id: string; label: string; toggle: () => void }) {
  onCleanup(motionTuning.action({ id: `sidebars.${input.id}`, label: input.label, group, run: input.toggle }))
}

/**
 * Opens and closes an edge panel on the shared sidebar spring. `paint` receives how far closed the panel is, from 0
 * (open) to 1 (closed), every frame of a flight and whenever a signal it reads changes at rest. It sizes the panel's
 * real layout box, so the neighbouring content's edge follows the panel's edge on every frame. `present` stays true
 * until a close settles. `whenSettled` defers work that would force a layout, like moving focus, until the flight
 * lands; `sync` shows a state at once, for changes the user makes by hand.
 */
export function createPanelMotion(input: {
  open: Accessor<boolean>
  paint: (closed: number) => void
  /** A change shows the new state without motion, e.g. switching to another session's layout. */
  identity?: Accessor<unknown>
  onClosed?: () => void
  /** Reads layout in the frame loop's read phase, before each frame of a flight paints. */
  measure?: () => void
  /**
   * The panel layer, which fades in under reduced motion. James shifts and fades it, `offset` pixels toward its edge
   * (negative for the inline-start edge; mirrored in RTL).
   */
  element?: Accessor<HTMLElement | undefined>
  offset?: () => number
  /** James: the boxes beside the panel that glide into place when its layout changes, and how. */
  neighbours?: () => Array<[HTMLElement | null | undefined, Anchor]>
  /** James, width layout: the box whose real width animates. */
  resize?: () => HTMLElement | null | undefined
}) {
  const [present, setPresent] = createSignal(input.open())
  // Percent closed, so the spring's rest threshold stays well under a pixel.
  const motion = new Spring(input.open() ? 0 : 100)
  let stop: (() => void) | undefined
  let landed: (() => void)[] = []
  // A state `sync` asked to show at once, for when the change hasn't reached this motion yet, e.g. inside a batch.
  let snapTo: boolean | undefined
  let flying = false
  // James's flight in progress, if any.
  let fades: Animation[] = []

  const fly = (next: boolean) => {
    if (flying === next) return
    flying = next
    setFlights((count) => count + (next ? 1 : -1))
  }

  const paint = () => input.paint(Math.min(1, Math.max(0, motion.value / 100)))

  // Where the flight's current leg started, for how much of it remains.
  let from = 0

  const landing: Landing = {
    land: () => input.paint(motion.target / 100),
    resume: paint,
    begin: () => {
      from = motion.value
    },
    remaining: () =>
      from === motion.target ? 0 : Math.min(1, Math.max(0, (motion.value - motion.target) / (from - motion.target))),
  }

  const unhold = () => {
    if (!landings.delete(landing)) return
    // Another flight still moving carries the shift from here.
    rehold(driver === landing ? landings.values().next().value : driver)
  }

  const settle = () => {
    stop?.()
    stop = undefined
    fly(false)
    unhold()
    const queued = landed
    landed = []

    if (!input.open()) setPresent(false)
    fades.forEach((animation) => animation.cancel())
    fades = []

    if (!input.open()) input.onClosed?.()

    queued.forEach((run) => run())
  }

  const snap = (open: boolean) => {
    motion.snap(open ? 0 : 100)
    paint()
    settle()
  }

  createEffect(
    on(
      () => [input.open(), input.identity?.()] as const,
      ([open, identity], previous) => {
        const target = open ? 0 : 100
        // Work queued for the previous direction no longer applies.
        landed = []
        const now = snapTo === open
        snapTo = undefined

        if (open) setPresent(true)

        if (previous === undefined || previous[1] !== identity) {
          stop?.()
          stop = undefined
          fades.forEach((animation) => animation.cancel())
          fades = []
          fly(false)
          motion.snap(target)
          paint()
          // After the snap, so a flight still moving measures this layout's landing.
          unhold()

          if (!open) setPresent(false)

          return
        }

        if (prefersReducedMotion() && !now) {
          snap(open)

          return open ? reveal() : undefined
        }

        if (now || (!james() && style() === "instant")) return snap(open)

        // James closes at once; only its neighbours glide into place.
        if (james()) return open ? fade() : glide(false, () => snap(false))

        const tuning = spring()
        motion.omega = (2 * Math.PI) / tuning.duration
        motion.zeta = 1 - tuning.bounce
        // Retargeting keeps the current position and velocity, so a second toggle mid-flight turns around smoothly.
        motion.set(target)
        fly(true)
        landings.add(landing)
        rehold(landing)

        // Writes only; anything reading layout this frame does so in the loop's read phase, before this runs.
        const step = (dt: number) => {
          motion.step(dt)
          paint()

          if (driver === landing) shiftHeld()

          if (!motion.resting) return true
          stop = undefined
          settle()

          return false
        }

        stop ??= input.measure ? frameLoop.addMeasured(input.measure, step) : frameLoop.add(step)
      },
    ),
  )

  /** Reduced motion: the panel, opened at once, fades in without travel. */
  const reveal = () =>
    // Deferred so a panel that mounts with this open exists; microtasks run before the next paint.
    queueMicrotask(() => {
      if (input.open()) input.element?.()?.animate?.({ opacity: [0, 1] }, { duration: 150, easing: ease.out })
    })

  /** The layout opens at once, gliding its neighbours into place; the panel then shifts in and fades up. */
  const fade = () => {
    stop?.()
    stop = undefined
    glide(true, () => {
      motion.snap(0)
      paint()
    })
    fly(true)
    // Deferred so a panel that mounts with this open exists before it animates; microtasks run before the next paint.
    queueMicrotask(() => {
      const element = input.element?.()

      if (!input.open()) return

      if (!element?.animate) return settle()

      const x = (input.offset?.() ?? 0) * (element.matches(":dir(rtl)") ? -1 : 1)
      fades.forEach((animation) => animation.cancel())
      fades = [
        element.animate({ transform: [`translateX(${x}px)`, "none"] }, springEasing(jamesShift())),
        element.animate(
          { opacity: [faded, 1] },
          { duration: jamesFadeDuration() * 1000, easing: `cubic-bezier(${jamesFade().join(", ")})` },
        ),
      ]
      const current = fades
      void Promise.all(current.map((animation) => animation.finished)).then(
        () => current === fades && settle(),
        () => undefined,
      )
    })
  }

  /**
   * Runs `change`, which moves the layout, then glides the neighbours from their old boxes to the new ones, measured
   * on either side of the change and started in the same frame.
   */
  const glide = (open: boolean, change: () => void) => {
    const mode = jamesLayout()

    const before =
      mode === "flip"
        ? (input.neighbours?.() ?? []).flatMap(([element, anchor]) =>
            element ? [{ element, anchor, x: anchorX(element, anchor) }] : [],
          )
        : []

    const box = mode === "width" ? input.resize?.() : undefined

    const width = box?.getBoundingClientRect().width
    change()

    if (before.length === 0 && !box) return
    const timing = layoutEasing(open ? jamesLayoutOpen() : jamesLayoutClose())

    before.forEach(({ element, anchor, x }) => {
      const dx = x - anchorX(element, anchor)

      if (Math.abs(dx) > 0.5)
        element.animate({ transform: [`translateX(${dx}px)`, "none"] }, { ...timing, composite: "add" })
    })

    if (!box || width === undefined) return
    const to = box.getBoundingClientRect().width

    if (Math.abs(to - width) > 0.5) box.animate({ width: [`${width}px`, `${to}px`] }, timing)
  }

  // Repaints at rest when the open size changes, e.g. a resize drag or a window resize.
  createEffect(paint)

  onCleanup(() => {
    stop?.()
    fades.forEach((animation) => animation.cancel())
    fly(false)
    unhold()
  })

  return {
    present,
    sync: (open: boolean) => {
      if (flying && input.open() === open) return snap(open)
      snapTo = open
    },
    whenSettled: (run: () => void) => {
      if (flying) return void landed.push(run)
      run()
    },
  }
}

/**
 * Keeps focus out of a closing panel without `inert`, which would restyle every element in it: focus inside moves to
 * `target` when the close starts and whenever it enters during the flight. A settled panel is skipped, so nothing in
 * it can take focus.
 */
export function guardClosingFocus(input: {
  root: Accessor<HTMLElement | undefined>
  closing: Accessor<boolean>
  target: () => HTMLElement | undefined
}) {
  const evict = () => {
    const root = input.root()

    if (!input.closing() || !root?.contains(document.activeElement)) return
    const target = input.target()

    if (target) return target.focus({ preventScroll: true })

    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  }

  createEffect(on(input.closing, evict, { defer: true }))
  createEffect(() => {
    const root = input.root()

    if (!root) return
    root.addEventListener("focusin", evict)
    onCleanup(() => root.removeEventListener("focusin", evict))
  })
}

/** A spring sampled per 60 Hz frame into a CSS `linear()` easing. It ends once within 0.5% of rest, a twentieth of a
 * pixel on these shifts. */
function springEasing(tuning: DurationOptions) {
  const spring = Spring.fromDuration(0, tuning).set(1)
  const points = [0]

  while (points.length < 240 && points.at(-1)! < 0.995) points.push(Math.round(spring.step(1 / 60) * 1000) / 1000)
  points[points.length - 1] = 1

  return { duration: ((points.length - 1) * 1000) / 60, easing: `linear(${points.join(", ")})` }
}

/** A layout spring sampled per 60 Hz frame into `linear()`, until it rests within 0.5% and nearly still. */
function layoutEasing(tuning: DurationOptions) {
  const spring = Spring.fromDuration(0, tuning).set(1)
  const points = [0]

  while (points.length < 240) {
    const y = Math.round(spring.step(1 / 60) * 1000) / 1000
    points.push(y)

    if (Math.abs(1 - y) < 0.005 && Math.abs(spring.velocity) < 0.05) break
  }

  points[points.length - 1] = 1

  return { duration: ((points.length - 1) * 1000) / 60, easing: `linear(${points.join(", ")})` }
}

function anchorX(element: HTMLElement, anchor: Anchor) {
  const box = element.getBoundingClientRect()

  if (anchor === "center") return box.left + box.width / 2

  return element.matches(":dir(rtl)") ? box.right : box.left
}
