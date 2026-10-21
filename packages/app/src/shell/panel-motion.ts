import { createEffect, createSignal, on, onCleanup, type Accessor } from "solid-js"
import { frameLoop, prefersReducedMotion, Spring } from "@opencode/ui/motion"
import { motionTuning } from "@opencode/ui/motion-tuning"

const group = "Sidebars"

// Panels in flight, across the app. Native views, which no DOM box clips, stay hidden while any panel moves.
const [flights, setFlights] = createSignal(0)

export const panelsMoving = () => flights() > 0

// The left sidebar and the side panel share one spring, so they move as one system.
const spring = motionTuning.spring("sidebars", {
  label: "Spring",
  group,
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
  value: "spring",
  labels: { spring: "Spring", instant: "Instant" },
})

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
}) {
  const [present, setPresent] = createSignal(input.open())
  // Percent closed, so the spring's rest threshold stays well under a pixel.
  const motion = new Spring(input.open() ? 0 : 100)
  let stop: (() => void) | undefined
  let landed: (() => void)[] = []
  // A state `sync` asked to show at once, for when the change hasn't reached this motion yet, e.g. inside a batch.
  let snapTo: boolean | undefined
  let flying = false

  const fly = (next: boolean) => {
    if (flying === next) return
    flying = next
    setFlights((count) => count + (next ? 1 : -1))
  }

  const paint = () => input.paint(Math.min(1, Math.max(0, motion.value / 100)))

  const settle = () => {
    stop?.()
    stop = undefined
    fly(false)
    const queued = landed
    landed = []

    if (!input.open()) {
      setPresent(false)
      input.onClosed?.()
    }

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
          fly(false)
          motion.snap(target)
          paint()

          if (!open) setPresent(false)

          return
        }

        if (now || prefersReducedMotion() || style() === "instant") return snap(open)

        const tuning = spring()
        motion.omega = (2 * Math.PI) / tuning.duration
        motion.zeta = 1 - tuning.bounce
        // Retargeting keeps the current position and velocity, so a second toggle mid-flight turns around smoothly.
        motion.set(target)
        fly(true)
        // Writes only; anything reading layout this frame does so in the loop's read phase, before this runs.
        stop ??= frameLoop.add((dt) => {
          motion.step(dt)
          paint()

          if (!motion.resting) return true
          stop = undefined
          settle()

          return false
        })
      },
    ),
  )

  // Repaints at rest when the open size changes, e.g. a resize drag or a window resize.
  createEffect(paint)

  onCleanup(() => {
    stop?.()
    fly(false)
  })

  return {
    present,
    sync: (open: boolean) => {
      if (stop && input.open() === open) return snap(open)
      snapTo = open
    },
    whenSettled: (run: () => void) => {
      if (stop) return void landed.push(run)
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
