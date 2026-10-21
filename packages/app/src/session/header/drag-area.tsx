import { createEffect, createSignal, onCleanup, Show } from "solid-js"
import { usePlatform, type Platform } from "@/runtime/platform/platform"

// Narrower gaps leave nothing worth grabbing between the title and the actions.
const minWidth = 24

/** Whether this window hides its native titlebar and moves from app-drawn drag regions. */
export function windowDragEnabled(platform: Platform) {
  return platform.platform === "desktop" && (platform.os === "macos" || platform.os === "windows")
}

/**
 * Moves the window from the empty gap between the session title and the header actions, as the hidden titlebar's row
 * would. The area is pinned to the pane rather than placed in the header: the header sticks inside the timeline's
 * scroller, and Chromium only recomputes drag regions on layout, so a region inside it would stay behind on scroll.
 */
export function createSessionHeaderDrag() {
  const platform = usePlatform()
  const enabled = () => windowDragEnabled(platform)
  // Every cached timeline registers its header and stays registered while detached for another session, so the area
  // follows whichever header is on screen.
  const [headers, setHeaders] = createSignal<HTMLElement[]>([])
  const [gap, setGap] = createSignal<{ x: number; y: number; width: number; height: number }>()
  const [area, setArea] = createSignal<HTMLDivElement>()

  const register = (element: HTMLElement) => {
    setHeaders((items) => [...items, element])

    return () => setHeaders((items) => items.filter((item) => item !== element))
  }

  const parts = (layout: HTMLElement) => ({
    title: layout.querySelector<HTMLElement>(".session-header-title"),
    actions: layout.querySelector<HTMLElement>(".session-header-actions"),
  })

  const measure = (pane: HTMLElement, layouts: HTMLElement[]) => {
    const layout = layouts.findLast((item) => item.isConnected && item.getBoundingClientRect().width > 0)
    const slots = layout && parts(layout)

    // An open rename field fills the gap, and the area must not take its clicks.
    if (!layout || !slots?.title || slots.title.querySelector("input")) {
      setGap(undefined)
      return
    }

    const bounds = layout.getBoundingClientRect()
    const rtl = getComputedStyle(layout).direction === "rtl"
    // Inline-end and inline-start edges of a box.
    const after = (rect: DOMRect) => (rtl ? rect.left : rect.right)
    const before = (rect: DOMRect) => (rtl ? rect.right : rect.left)
    // The title slot grows to fill the row, so its end is where its last item (the title or the options menu) ends.
    const items = [...slots.title.children].map((child) => child.getBoundingClientRect()).filter((rect) => rect.width)
    const end = items.length
      ? (rtl ? Math.min : Math.max)(...items.map(after))
      : before(slots.title.getBoundingClientRect())
    const start = slots.actions ? before(slots.actions.getBoundingClientRect()) : after(bounds)
    const left = Math.min(start, end)
    const right = Math.max(start, end)

    if ((rtl ? end - start : start - end) < minWidth) {
      setGap(undefined)
      return
    }

    const origin = pane.getBoundingClientRect()
    setGap({ x: left - origin.left, y: bounds.top - origin.top, width: right - left, height: bounds.height })
  }

  // Sizes change on rename, truncation, readout updates and pane resizes; nothing here runs while the timeline scrolls.
  createEffect(() => {
    const layouts = headers()
    const pane = area()?.parentElement

    if (!enabled() || !pane || !layouts.length) {
      setGap(undefined)
      return
    }

    const update = () => measure(pane, layouts)
    const resize = new ResizeObserver(update)

    const observe = () => {
      resize.disconnect()
      resize.observe(pane)

      for (const layout of layouts) {
        const slots = parts(layout)
        resize.observe(layout)

        for (const element of [slots.title, slots.actions, ...(slots.title?.children ?? [])])
          if (element) resize.observe(element)
      }
    }

    // Renaming swaps the heading for an input and the actions come and go with the session, so rebind when children
    // change. Size changes alone reach the resize observer.
    let frame: number | undefined
    const mutations = new MutationObserver(() => {
      if (frame !== undefined) return
      frame = requestAnimationFrame(() => {
        frame = undefined
        observe()
        update()
      })
    })

    for (const layout of layouts) mutations.observe(layout, { childList: true, subtree: true })

    observe()
    update()
    onCleanup(() => {
      resize.disconnect()
      mutations.disconnect()

      if (frame !== undefined) cancelAnimationFrame(frame)
    })
  })

  const style = () => {
    const value = gap()

    if (!value) return { display: "none" }

    return { left: `${value.x}px`, top: `${value.y}px`, width: `${value.width}px`, height: `${value.height}px` }
  }

  // Rendered as a child of the pane, which positions it.
  const Area = () => (
    <Show when={enabled()}>
      <div
        ref={setArea}
        data-slot="session-header-drag"
        aria-hidden="true"
        class="absolute"
        style={style()}
        data-tauri-drag-region
      />
    </Show>
  )

  return { register, Area }
}
