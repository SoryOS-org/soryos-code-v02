import { createEffect, createSignal, For, on, onCleanup, Show, untrack, type Accessor, type JSX } from "solid-js"
import { frameLoop, observeReducedMotion, prefersReducedMotion, Spring, type DurationOptions } from "@opencode/ui/motion"

const enter: DurationOptions = { duration: 0.4, bounce: 0 }
const exit: DurationOptions = { duration: 0.3, bounce: 0 }
const fade: DurationOptions = { duration: 0.15, bounce: 0 }
export const snap = (px: number, dpr = window.devicePixelRatio || 1) => Math.round(px * dpr) / dpr

type Face<T> = {
  key: string
  value: Accessor<T>
  set: (value: T) => void
  leaving: Accessor<boolean>
  leave: (leaving: boolean) => void
  presence: Spring
  el?: HTMLDivElement
  height: number
}

// The composer and the docks that stand in for it as one surface: a new face grows the region to its height on one
// spring while the old face hands over in place. Faces present on mount rest immediately.
export function ComposerMorph<T extends { key: string; single?: boolean }>(props: {
  face: T
  children: (face: Accessor<T>) => JSX.Element
}) {
  const born = performance.now()
  const [faces, setFaces] = createSignal([face(props.face, 1)])
  let root: HTMLDivElement | undefined
  let height: Spring | undefined
  let stop: (() => void) | undefined

  const settle = (list: Face<T>[]) => {
    stop?.()
    stop = undefined
    height = undefined
    ;["data-moving", "data-single", "data-dock-border-underlay"].forEach((attr) => root?.removeAttribute(attr))
    root?.style.removeProperty("height")
    list.forEach((item) =>
      ["opacity", "transform", "filter", "mask-image"].forEach((prop) => item.el?.style.removeProperty(prop)),
    )
    setFaces(list.filter((item) => !item.leaving()))
    return false
  }

  const measure = () => {
    for (const item of untrack(faces)) if (item.el) item.height = item.el.offsetHeight
  }

  const styleFace = (item: Face<T>, shown: number, reduced: boolean) => {
    const el = item.el
    if (!el) return
    const p = Math.max(0, Math.min(1, item.presence.value))
    el.style.opacity = `${(p * p).toFixed(4)}`
    if (reduced) return
    const dy = (1 - p) * (item.leaving() ? 2 : 6)
    el.style.transform = `translateY(${dy.toFixed(2)}px) scale(${(1 - (1 - p) * 0.02).toFixed(4)})`
    el.style.filter = p < 0.999 ? `blur(${((1 - p) * 4).toFixed(2)}px)` : ""
    const hidden = Math.max(0, item.height - shown)
    el.style.maskImage =
      hidden > 0 ? `linear-gradient(to top, transparent ${hidden}px, #000 ${hidden + Math.min(24, hidden)}px)` : ""
  }

  const paint = (dt: number) => {
    const list = untrack(faces)
    const entering = list.find((item) => !item.leaving())
    if (!root || !height || !entering) return false
    const reduced = prefersReducedMotion()

    if (entering.el && height.target !== entering.height) height.set(entering.height)
    if (reduced) height.snap(entering.height)
    height.step(dt)
    if (Math.abs(height.value - height.target) < 0.5 && Math.abs(height.velocity) < 5) height.snap(height.target)
    list.forEach((item) => {
      item.presence.step(dt)
      if (Math.abs(item.presence.value - item.presence.target) < 0.01 && Math.abs(item.presence.velocity) < 0.05)
        item.presence.snap(item.presence.target)
    })

    if (height.resting && list.every((item) => item.presence.resting)) return settle(list)
    const shown = snap(height.value)
    root.style.height = `${shown}px`
    list.forEach((item) => styleFace(item, shown, reduced))
    return true
  }

  createEffect(
    on(
      () => props.face,
      (next) => {
        const list = untrack(faces)
        const current = list.find((item) => !item.leaving())
        if (current?.key === next.key) return current.set(next)
        if (!root || performance.now() - born < 250) return setFaces([face(next, 1)])

        const from = height ? height.value : root.offsetHeight
        const reduced = prefersReducedMotion()
        const back = list.find((item) => item.key === next.key)
        const entering = back ?? face(next, 0)
        const active = list.filter((item) => item === entering || item.presence.value >= 0.01)

        active.forEach((item) => {
          if (item === entering) return
          item.leave(true)
          if (item.el?.contains(document.activeElement) && document.activeElement instanceof HTMLElement)
            document.activeElement.blur()
          tune(item.presence, reduced ? fade : exit).set(0)
        })
        entering.set(next)
        entering.leave(false)
        tune(entering.presence, reduced ? fade : enter).set(1)
        height ??= Spring.fromDuration(from, enter)
        tune(height, enter)
        const shown = snap(height.value)
        const nextFaces = back ? active : [...active, entering]
        const single = nextFaces.every((item) => item.value().single !== false)
        root.toggleAttribute("data-moving", true)
        root.toggleAttribute("data-single", single)
        root.toggleAttribute("data-dock-border-underlay", single)
        root.style.height = `${shown}px`
        nextFaces.forEach((item) => styleFace(item, shown, reduced))
        setFaces(nextFaces)
        stop ??= frameLoop.addMeasured(measure, paint)
      },
      { defer: true },
    ),
  )

  onCleanup(observeReducedMotion(() => prefersReducedMotion() && stop && settle(untrack(faces))))
  onCleanup(() => stop?.())

  return (
    <div
      ref={root}
      data-slot="composer-morph"
      class="relative z-10 flex flex-col data-[moving]:overflow-clip data-[single]:rounded-xl data-[single]:bg-v2-background-bg-base [[data-color-scheme=dark]_&[data-single]]:bg-v2-background-bg-layer-01"
    >
      <For each={faces()}>
        {(item) => (
          <div
            ref={(el) => {
              item.el = el
              if (height) styleFace(item, snap(height.value), prefersReducedMotion())
            }}
            data-slot="composer-face"
            inert={item.leaving()}
            aria-hidden={item.leaving() || undefined}
            class="shrink-0 origin-top"
            classList={{ "pointer-events-none absolute inset-x-0 top-0": item.leaving() }}
          >
            {props.children(item.value)}
          </div>
        )}
      </For>
    </div>
  )
}

function face<T extends { key: string }>(value: T, presence: number): Face<T> {
  const [current, set] = createSignal(value)
  const [leaving, leave] = createSignal(false)
  return { key: value.key, value: current, set, leaving, leave, presence: new Spring(presence), height: 0 }
}

function tune(spring: Spring, options: DurationOptions) {
  spring.omega = (2 * Math.PI) / options.duration
  spring.zeta = 1 - options.bounce
  return spring
}

// Mounts its children when `when` turns true and grows them in; when it turns false they close and unmount.
export function Grow(props: {
  when: boolean
  appear?: boolean
  fade?: boolean
  class?: string
  onClosed?: () => void
  children: JSX.Element
}) {
  const [present, setPresent] = createSignal(props.when)
  let el: HTMLDivElement | undefined
  let entering = props.when && !!props.appear

  createEffect(
    on(
      () => [props.when, present()] as const,
      ([when, shown], prev) => {
        if (when && !shown) {
          entering = true
          return setPresent(true)
        }
        if (!el || (!entering && (!prev || prev[0] === when))) return
        entering = false
        grow(el, when, props.fade, () => {
          setPresent(false)
          props.onClosed?.()
        })
      },
    ),
  )

  return (
    <Show when={present()}>
      <div ref={el} class={props.class}>
        {props.children}
      </div>
    </Show>
  )
}

const growing = new WeakMap<HTMLElement, { spring: Spring; open: boolean; done?: () => void }>()

function grow(el: HTMLElement, open: boolean, fade?: boolean, done?: () => void) {
  const current = growing.get(el)
  if (current) {
    current.open = open
    current.done = done
    tune(current.spring, open ? enter : exit)
    return
  }

  const state = {
    spring: Spring.fromDuration(open ? 0 : el.offsetHeight, open ? enter : exit),
    open,
    done,
  }
  growing.set(el, state)
  el.style.overflow = "clip"
  el.style.height = `${snap(state.spring.value)}px`
  const inner = () => (el.firstElementChild instanceof HTMLElement ? el.firstElementChild : el)

  if (fade && open) {
    const node = inner()
    node.style.opacity = "0"
    node.style.filter = "blur(4px)"
  }

  let full = 0
  frameLoop.addMeasured(
    () => {
      const child = el.firstElementChild
      if (!(child instanceof HTMLElement)) return
      const margin = parseFloat(getComputedStyle(child).marginBottom)
      if (margin < 0) el.style.overflowClipMargin = `${-margin}px`
      full = child.offsetHeight + margin
    },
    (dt) => {
      const size = state.open ? full : 0
      if (prefersReducedMotion()) state.spring.snap(size)
      state.spring.set(size).step(dt)
      if (Math.abs(state.spring.value - size) < 0.5 && Math.abs(state.spring.velocity) < 5) state.spring.snap(size)

      if (state.spring.resting) {
        growing.delete(el)
        finish(el, state.open, state.done)
        return false
      }

      const value = snap(Math.max(0, state.spring.value))
      el.style.height = `${value}px`
      if (!fade) return true
      const p = Math.max(0, Math.min(1, state.spring.value / Math.max(1, full)))
      const node = inner()
      node.style.opacity = `${(p * p).toFixed(4)}`
      node.style.filter = p < 0.999 ? `blur(${((1 - p) * 4).toFixed(2)}px)` : ""
      node.style.transform = `translateY(${((value - full) * 0.5).toFixed(2)}px) scale(${(0.97 + 0.03 * p).toFixed(4)})`
      return true
    },
  )
}

function finish(el: HTMLElement, open: boolean, done?: () => void) {
  const child = el.firstElementChild instanceof HTMLElement ? el.firstElementChild : undefined
  ;["height", "overflow", "overflow-clip-margin", "opacity", "filter", "transform", "mask-image"].forEach((prop) => {
    el.style.removeProperty(prop)
    child?.style.removeProperty(prop)
  })
  if (!open) done?.()
}
