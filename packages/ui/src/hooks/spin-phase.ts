import { onCleanup } from "solid-js"

// ResizeObserver delivers after style and layout but before paint, so a spinner that mounts or leaves `display: none`
// (which restarts its CSS animation) paints its first frame already in phase.
const observer =
  typeof ResizeObserver === "undefined"
    ? undefined
    : new ResizeObserver((entries) => entries.forEach((entry) => pinSpinPhase(entry.target)))

/** Use as a `ref` on a looping indicator so every instance on screen shares one phase. */
export function syncSpinPhase(el: Element) {
  observer?.observe(el)
  // Turning reduced motion back off restarts the animation without resizing anything.
  el.addEventListener("animationstart", () => pinSpinPhase(el))
  onCleanup(() => observer?.unobserve(el))
}

// Starting every infinite loop at the document timeline's origin puts all instances of one animation in phase.
export function pinSpinPhase(el: {
  getAnimations(
    options: GetAnimationsOptions,
  ): { startTime: CSSNumberish | null; effect: { getTiming(): EffectTiming } | null }[]
}) {
  el.getAnimations({ subtree: true })
    .filter((animation) => animation.effect?.getTiming().iterations === Infinity && animation.startTime !== 0)
    .forEach((animation) => {
      animation.startTime = 0
    })
}
