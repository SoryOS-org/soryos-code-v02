import { motionTuning } from "@opencode/ui/motion-tuning"
import { createSignal } from "solid-js"

const toggle = motionTuning.toggle("session.messageMenu", {
  label: "Message menu",
  group: "Experiments",
  card: "Experiments",
  // Ahead of the card's other rows (order 1), so it sits at the top of the EXPERIMENTS card.
  order: 0,
  value: false,
})

const [enabled, setEnabled] = createSignal(toggle())

motionTuning.subscribe(() => setEnabled(toggle()))

/** Experiment: a ⋯ menu per message in a 28px trailing gutter replaces the hover info line, and turns sit 24px apart. */
export const messageMenu = enabled
