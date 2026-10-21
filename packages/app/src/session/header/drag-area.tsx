import { createEffect, createSignal, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { usePlatform } from "@/runtime/platform/platform"

type Gap = { x: number; y: number; width: number; height: number }

// Narrower gaps leave nothing worth grabbing between the title and the actions.
const minWidth = 24

/**
 * Moves the window from the empty gap between the session title and the header actions, as the hidden titlebar's row
 * would. The area is pinned to the pane rather than placed in the header: the header sticks inside the timeline's
 * scroller, and Chromium only recomputes drag regions on layout, so a region inside it would stay behind on scroll.
 */
export function createSessionHeaderDrag() {
  const platform = usePlatform()
  const enabled = () => platform.platform === "desktop" && (platform.os === "macos" || platform.os === "windows")
  // Every cached timeline registers its header and stays registered while detached for another session, so the area
  // follows whichever header is on screen.
  const [headers, setHeaders] = createSignal<HTMLElement[]>([])
  const [gap, setGap] = createStore<{ value?: Gap }>({})
  let area: HTMLDivElement | undefined

  const register = (element: HTMLElement) => {
    setHeaders((items) => [...items, element])

    return () => setHeaders((items) => items.filter((item) => item !== element))
  }

  const parts = (layout: HTMLElement) => ({
    title: layout.querySelector<HTMLElement>(".session-header-title"),
    actions: layout.querySelector<HTMLElement>(".session-header-actions"),
  })

  const measure = (layouts: HTMLElement[]) => {
    const pane = area?.parentElement
    const layout = layouts.findLast((item) => item.isConnected && item.getBoundingClientRect().width > 0)
    const { title, actions } = layout ? parts(layout) : { title: null, actions: null }

    // An open rename field fills the gap, and the area must not take its clicks.
    if (!pane || !layout || !title || title.querySelector("input")) return setGap("value", undefined)
    const bounds = layout.getBoundingClientRect()
    const rtl = getComputedStyle(layout).direction === "rtl"
    // The title slot grows to fill the row, so its end is where its last item (the title or the options menu) ends.
    const items = [...title.children].map((child) => child.getBoundingClientRect()).filter((rect) => rect.width)
    const slot = title.getBoundingClientRect()
    const end = items.length
      ? rtl
        ? Math.min(...items.map((rect) => rect.left))
        : Math.max(...items.map((rect) => rect.right))
      : rtl
        ? slot.right
        : slot.left
    const limit = actions?.getBoundingClientRect()
    const start = limit ? (rtl ? limit.right : limit.left) : rtl ? bounds.left : bounds.right
    const left = rtl ? start : end
    const right = rtl ? end : start

    if (right - left < minWidth) return setGap("value", undefined)
    const origin = pane.getBoundingClientRect()
    setGap("value", { x: left - origin.left, y: bounds.top - origin.top, width: right - left, height: bounds.height })
  }

  // Sizes change on rename, truncation, readout updates and pane resizes; nothing here runs while the timeline scrolls.
  createEffect(() => {
    const layouts = headers()

    if (!enabled() || !layouts.length) return setGap("value", undefined)
    const update = () => measure(layouts)
    const resize = new ResizeObserver(update)

    const observe = () => {
      resize.disconnect()

      if (area?.parentElement) resize.observe(area.parentElement)

      for (const layout of layouts) {
        const { title, actions } = parts(layout)
        resize.observe(layout)

        for (const element of [title, actions, ...(title?.children ?? [])]) if (element) resize.observe(element)
      }
    }

    // Renaming swaps the heading for an input and the actions come and go with the session, so rebind on changes.
    const mutations = new MutationObserver(() => {
      observe()
      update()
    })

    for (const layout of layouts) mutations.observe(layout, { childList: true, subtree: true, characterData: true })

    observe()
    update()
    onCleanup(() => {
      resize.disconnect()
      mutations.disconnect()
    })
  })

  // Rendered as a child of the pane, which positions it.
  const Area = () => (
    <Show when={enabled()}>
      <div
        ref={area}
        data-slot="session-header-drag"
        aria-hidden="true"
        class="absolute"
        style={
          gap.value
            ? {
                left: `${gap.value.x}px`,
                top: `${gap.value.y}px`,
                width: `${gap.value.width}px`,
                height: `${gap.value.height}px`,
              }
            : { display: "none" }
        }
        data-tauri-drag-region
      />
    </Show>
  )

  return { register, Area }
}
