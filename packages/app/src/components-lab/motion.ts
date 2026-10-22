import { motionGlobals, motionPresets, motionTuning, type MotionKnob } from "@opencode/ui/motion-tuning"
import { applyMotion, motionField } from "@opencode/ui/motion-tuning-fields"
import type { DurationOptions } from "@opencode/ui/motion"
import { action, toolbar, type Field, type Values } from "knobs"

/**
 * The Knobs a story names in `parameters.motion` (ids, groups or cards) and their replay buttons. Speed and slow motion
 * come along when there is motion to time.
 */
export function storyMotion(names: readonly string[]) {
  const named = (item: { id: string; group: string; card?: string }) =>
    [item.id, item.group, item.card].some((key) => key !== undefined && names.includes(key))

  const knobs = motionTuning.list().filter((item) => item.kind !== "mode" && named(item) && (item.when?.() ?? true))
  const actions = motionTuning.actions().filter(named)
  const timed = actions.length > 0 || knobs.some((item) => item.kind === "spring" || item.kind === "easing")

  return { knobs, actions, globals: timed ? [motionGlobals.speed, motionGlobals.slow] : [] }
}

export type StoryMotion = ReturnType<typeof storyMotion>

/** What the inspector is built from: a new knob or replay button rebuilds it. */
export function motionKey(motion: StoryMotion) {
  return [...motion.knobs, ...motion.actions, ...motion.globals].map((item) => item.id).join()
}

/**
 * One card per group (or card): buttons for its spring presets, its knobs and its replay buttons, then speed and slow
 * motion. `apply` sets the values a preset button names.
 */
export function motionFields(
  motion: StoryMotion,
  apply: (values: { [key: string]: DurationOptions }) => void,
): { [key: string]: Field } {
  return Object.fromEntries([
    ...Object.entries(springPresets(motion)).map(([group, list]) => [
      `presets.${group}`,
      toolbar(
        list.map((item) => ({ id: item.name, label: item.name, run: () => apply(item.values) })),
        { group, labels: true },
      ),
    ]),
    ...motion.knobs.map((item) => [
      key(item),
      motionField(item, { label: item.label, group: item.card ?? item.group }),
    ]),
    ...motion.actions.map((item) => [
      `replay.${item.id}`,
      action(item.label, { group: item.group, subsection: "Replay", run: item.run }),
    ]),
    ...motion.globals.map((item) => [key(item), motionField(item, { label: item.label, group: item.group })]),
  ])
}

export function motionValues(motion: StoryMotion) {
  return Object.fromEntries([...motion.knobs, ...motion.globals].map((item) => [key(item), item.value]))
}

/** Applies the motion keys of a change from the inspector. */
export function applyMotionPatch(motion: StoryMotion, patch: Partial<Values<{ [key: string]: Field }>>) {
  ;[...motion.knobs, ...motion.globals].forEach((item) => {
    // SAFETY: each key's field was made from its knob by `motionField`, so its value is that knob's kind.
    const value = patch[key(item)] as MotionKnob["value"] | undefined

    if (value !== undefined) applyMotion(item, value)
  })
}

const presets = ["snappy", "smooth", "calm"] as const

// Apart from the story's own args.
function key(item: MotionKnob) {
  return `motion.${item.id}`
}

// The Shipped, Snappy, Smooth and Calm values of each card's springs.
function springPresets(motion: StoryMotion) {
  const springs = motion.knobs.flatMap((item) => (item.kind === "spring" ? [item] : []))

  return Object.fromEntries(
    [...new Set(springs.map((item) => item.card ?? item.group))].map((group) => {
      const own = springs.filter((item) => (item.card ?? item.group) === group)

      return [
        group,
        [
          { name: "Shipped", values: Object.fromEntries(own.map((item) => [key(item), item.initial])) },
          ...presets.map((preset) => ({
            name: motionPresets[preset],
            values: Object.fromEntries(own.map((item) => [key(item), item.presets[preset]])),
          })),
        ],
      ]
    }),
  )
}
