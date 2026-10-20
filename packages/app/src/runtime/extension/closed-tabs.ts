import { createEventListener } from "@solid-primitives/event-listener"
import { adjacentTabKey } from "@/shell/titlebar/tab-order"

/** Side tabs the user closed in this window, newest last, each with how its panel brings it back. */
export function createClosedTabs(limit = 25) {
  const stack: { session: string; reopen: () => void }[] = []

  return {
    push(session: string, reopen: () => void) {
      stack.push({ session, reopen })

      if (stack.length > limit) stack.shift()
    },
    reopen(session: string) {
      const index = stack.findLastIndex((entry) => entry.session === session)

      if (index !== -1) stack.splice(index, 1)[0]?.reopen()
    },
  }
}

/**
 * Whether a key event belongs to the side panel: its target is in it, or, when the target is the body because closing
 * the focused tab dropped focus, the user's last focus, click or key was.
 */
export function createSideFocus() {
  let last = false
  createEventListener(document, ["focusin", "pointerdown", "keydown"], (event) => (last = inSide(event, last)), {
    capture: true,
  })

  return (event: Event) => inSide(event, last)
}

/** As in a browser: inside the side panel, ⌘1–8 select that side tab, ⌘9 the last one, and ⇧⌘[ and ⇧⌘] the previous and next. */
export function sideTabShortcuts(input: {
  keys: () => readonly string[]
  active: () => string | undefined
  select: (key: string) => void
  when: (event: KeyboardEvent) => boolean
}) {
  const shortcut = (id: string, keybind: string, target: () => string | undefined) => ({
    id,
    title: "",
    keybind,
    hidden: true,
    when: input.when,
    onSelect: () => {
      const key = target()

      if (key) input.select(key)
    },
  })

  return [
    ...Array.from({ length: 9 }, (_, index) =>
      shortcut(`file.tab.${index + 1}`, `mod+${index + 1}`, () =>
        index === 8 ? input.keys().at(-1) : input.keys()[index],
      ),
    ),
    shortcut("file.tab.left", "mod+shift+[", () => adjacentTabKey([...input.keys()], input.active(), -1)),
    shortcut("file.tab.right", "mod+shift+]", () => adjacentTabKey([...input.keys()], input.active(), 1)),
  ]
}

function inSide(event: Event, fallback: boolean) {
  const target = event.target

  const placed =
    target instanceof Element && target !== document.body && target !== document.documentElement && target.isConnected

  return placed ? !!target.closest("#review-panel") : fallback
}
