import { motionTuning } from "@opencode/ui/motion-tuning"
import { createSignal } from "solid-js"

const toggle = motionTuning.toggle("session.messageMenu", {
  label: "Message menu",
  group: "Composer",
  experiment: true,
  value: false,
})

const [enabled, setEnabled] = createSignal(toggle())

motionTuning.subscribe(() => setEnabled(toggle()))

/** Experiment: a ⋯ menu per message in a 28px trailing gutter replaces the hover info line, and turns sit 24px apart. */
export const messageMenu = enabled
