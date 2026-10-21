import { createEffect, createSignal, on, onCleanup, type Accessor } from "solid-js"
import { frameLoop, prefersReducedMotion, Spring } from "@opencode/ui/motion"
import { motionTuning } from "@opencode/ui/motion-tuning"

const group = "Sidebars"

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
 * until a close settles.
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

  const paint = () => input.paint(Math.min(1, Math.max(0, motion.value / 100)))

  const settle = () => {
    stop?.()
    stop = undefined

    if (input.open()) return
    setPresent(false)
    input.onClosed?.()
  }

  createEffect(
    on(
      () => [input.open(), input.identity?.()] as const,
      ([open, identity], previous) => {
        const target = open ? 0 : 100

        if (open) setPresent(true)

        if (previous === undefined || previous[1] !== identity) {
          stop?.()
          stop = undefined
          motion.snap(target)
          paint()

          if (!open) setPresent(false)

          return
        }

        if (prefersReducedMotion() || style() === "instant") {
          motion.snap(target)
          paint()
          settle()

          return
        }

        const tuning = spring()
        motion.omega = (2 * Math.PI) / tuning.duration
        motion.zeta = 1 - tuning.bounce
        // Retargeting keeps the current position and velocity, so a second toggle mid-flight turns around smoothly.
        motion.set(target)
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

  onCleanup(() => stop?.())

  return { present }
}
