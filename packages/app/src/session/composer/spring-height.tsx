import { createEffect, createMemo, createSignal, For, on, onCleanup, Show, untrack, type Accessor, type JSX } from "solid-js"
import { frameLoop, observeReducedMotion, prefersReducedMotion, Spring, type DurationOptions } from "@opencode/ui/motion"
import { motionTuning } from "@opencode/ui/motion-tuning"

const group = "Composer docks"
const presets = {
  snappy: { duration: 0.3, bounce: 0 },
  smooth: { duration: 0.4, bounce: 0 },
  calm: { duration: 0.55, bounce: 0 },
}
// Opening and closing share one height spring, so a dock leaves the way it came.
const morph = motionTuning.spring("docks.morph", { label: "Height", group, shipped: "smooth", presets })
export const fadeIn = motionTuning.spring("docks.fade-in", { label: "Fade in", group, shipped: "smooth", presets })
const fadeOut = motionTuning.spring("docks.fade-out", { label: "Fade out", group, shipped: "smooth", presets })
const blur = motionTuning.number("docks.blur", { label: "Blur", group, value: 4, min: 0, max: 16, step: 0.5, unit: "px" })
export const queueStagger = motionTuning.number("docks.stagger", {
  label: "Queue row stagger",
  group,
  value: 0,
  min: 0,
  max: 0.12,
  step: 0.005,
  unit: "s",
  time: "duration",
})
const fade: DurationOptions = { duration: 0.15, bounce: 0 }
const snap = (px: number, dpr = window.devicePixelRatio || 1) => Math.round(px * dpr) / dpr
const surface =
  "data-[moving]:overflow-clip data-[dock-border-underlay]:rounded-xl data-[dock-border-underlay]:bg-v2-background-bg-base [[data-color-scheme=dark]_&[data-dock-border-underlay]]:bg-v2-background-bg-layer-01"

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
export function ComposerMorph<T extends { key: string }>(props: {
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
    root?.removeAttribute("data-moving")
    root?.removeAttribute("data-dock-border-underlay")
    root?.style.removeProperty("height")
    list.forEach((item) =>
      ["opacity", "transform", "filter", "mask-image"].forEach((prop) => item.el?.style.removeProperty(prop)),
    )
    setFaces(list.filter((item) => !item.leaving()))
    return false
  }

  const measure = () => {
    for (const item of untrack(faces)) if (item.el) item.height = item.el.getBoundingClientRect().height
  }

  const paintFace = (item: Face<T>, shown: number) => {
    if (!item.el) return
    const p = Math.max(0, Math.min(1, item.presence.value))
    styleFace(item.el, p, { dy: item.leaving() ? 2 : 6, out: item.leaving(), hidden: item.height - shown })
  }

  const paint = (dt: number) => {
    const list = untrack(faces)
    const entering = list.find((item) => !item.leaving())
    if (!root || !height || !entering) return false

    if (entering.el && height.target !== entering.height) height.set(entering.height)
    if (prefersReducedMotion()) height.snap(entering.height)
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
    list.forEach((item) => paintFace(item, shown))
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

        const from = height ? height.value : root.getBoundingClientRect().height
        const reduced = prefersReducedMotion()
        const back = next.key === "composer" ? list.find((item) => item.key === next.key) : undefined
        const entering = back ?? face(next, 0)
        const active = list.filter((item) => item === entering || item.presence.value >= 0.01)

        active.forEach((item) => {
          if (item === entering) return
          item.leave(true)
          if (item.el?.contains(document.activeElement) && document.activeElement instanceof HTMLElement)
            document.activeElement.blur()
          tune(item.presence, reduced ? fade : fadeOut()).set(0)
        })
        entering.set(next)
        entering.leave(false)
        tune(entering.presence, reduced ? fade : fadeIn()).set(1)
        height ??= Spring.fromDuration(from, morph())
        tune(height, morph())
        const shown = snap(height.value)
        const nextFaces = back ? active : [...active, entering]
        root.toggleAttribute("data-moving", true)
        root.toggleAttribute("data-dock-border-underlay", true)
        root.style.height = `${shown}px`
        nextFaces.forEach((item) => paintFace(item, shown))
        setFaces(nextFaces)
        stop ??= frameLoop.addMeasured(measure, paint)
      },
      { defer: true },
    ),
  )

  onCleanup(observeReducedMotion(() => prefersReducedMotion() && stop && settle(untrack(faces))))
  onCleanup(() => stop?.())

  return (
    <div ref={root} data-slot="composer-morph" class={`relative z-10 flex flex-col ${surface}`}>
      <For each={faces()}>
        {(item) => (
          <div
            ref={(el) => {
              item.el = el
              if (height) paintFace(item, snap(height.value))
            }}
            data-slot="composer-face"
            inert={item.leaving()}
            aria-hidden={item.leaving() || undefined}
            class="shrink-0"
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

// A face coming in eases its opacity in late; a face going out fades with its presence, so it stays visible while the
// height closes over it instead of vanishing in the first frames.
function styleFace(el: HTMLElement, p: number, input: { dy: number; out: boolean; hidden?: number; content?: HTMLElement }) {
  const content = input.content ?? el
  const hidden = input.hidden ?? 0
  el.style.opacity = `${(input.out ? p : p * p).toFixed(4)}`
  if (prefersReducedMotion()) return
  content.style.transform = `translateY(${((1 - p) * input.dy).toFixed(2)}px)`
  el.style.filter = p < 0.999 && blur() > 0 ? `blur(${((1 - p) * blur()).toFixed(2)}px)` : ""
  content.style.maskImage =
    hidden > 0 ? `linear-gradient(to top, transparent ${hidden}px, #000 ${hidden + Math.min(24, hidden)}px)` : ""
}

// Mounts its children when `when` turns truthy and grows them in; when it turns falsy they close and unmount.
export function Grow<T>(props: {
  when: T | undefined | null | false
  appear?: boolean
  fade?: boolean
  card?: boolean
  class?: string
  onClosed?: () => void
  children: JSX.Element | ((item: NonNullable<T>) => JSX.Element)
}) {
  const [present, setPresent] = createSignal(!!props.when)
  const item = createMemo((prev?: NonNullable<T>) => (props.when ? (props.when as NonNullable<T>) : prev))
  let el: HTMLDivElement | undefined
  let entering = !!props.when && !!props.appear

  createEffect(
    on(
      () => [!!props.when, present()] as const,
      ([when, shown], prev) => {
        if (when && !shown) {
          entering = true
          return setPresent(true)
        }
        if (!el || (!entering && (!prev || prev[0] === when))) return
        entering = false
        grow(el, when, props.fade, props.card, () => {
          setPresent(false)
          props.onClosed?.()
        })
      },
    ),
  )

  return (
    <Show when={present()}>
      <div
        ref={el}
        inert={!props.when}
        class={[props.class, props.card && "[&:not(:last-child)]:mb-2", surface].filter(Boolean).join(" ")}
      >
        {(() => {
          const child = props.children
          return typeof child === "function" ? <Show when={item()} keyed>{child}</Show> : child
        })()}
      </div>
    </Show>
  )
}

const growing = new WeakMap<HTMLElement, { spring: Spring; presence: Spring; open: boolean; done?: () => void }>()

function grow(el: HTMLElement, open: boolean, withFade?: boolean, card?: boolean, done?: () => void) {
  const reduced = prefersReducedMotion()
  const current = growing.get(el)
  if (current) {
    current.open = open
    current.done = done
    tune(current.spring, reduced ? fade : morph())
    tune(current.presence, reduced ? fade : open ? fadeIn() : fadeOut())
    return
  }

  const mb = parseFloat(getComputedStyle(el).marginBottom) || 0
  const prevMb =
    (!mb && el.previousElementSibling ? parseFloat(getComputedStyle(el.previousElementSibling).marginBottom) : 0) || 0
  const state = {
    spring: Spring.fromDuration(open ? 0 : el.getBoundingClientRect().height, reduced ? fade : morph()),
    presence: Spring.fromDuration(open ? 0 : 1, reduced ? fade : open ? fadeIn() : fadeOut()),
    open,
    done,
  }
  growing.set(el, state)
  el.toggleAttribute("data-moving", true)
  el.toggleAttribute("data-dock-border-underlay", !!card)
  if (!reduced) {
    el.style.height = `${snap(state.spring.value)}px`
    if (open && mb > 0) el.style.marginBottom = "0px"
    if (open && prevMb > 0) el.style.marginTop = `${-prevMb}px`
  }
  if ((withFade || reduced) && open) el.style.opacity = "0"

  let full = 0
  frameLoop.addMeasured(
    () => {
      const child = el.firstElementChild
      if (!(child instanceof HTMLElement)) return
      const margin = parseFloat(getComputedStyle(child).marginBottom) || 0
      if (margin < 0) el.style.overflowClipMargin = `${-margin}px`
      full = child.getBoundingClientRect().height + margin
    },
    (dt) => {
      if (!el.isConnected) {
        growing.delete(el)
        return false
      }
      const noMotion = prefersReducedMotion()
      const size = state.open ? full : 0
      state.spring.set(size).step(dt)
      if (Math.abs(state.spring.value - size) < 0.5 && Math.abs(state.spring.velocity) < 5) state.spring.snap(size)
      const shown = state.open ? 1 : 0
      state.presence.set(shown).step(dt)
      if (Math.abs(state.presence.value - shown) < 0.01 && Math.abs(state.presence.velocity) < 0.05)
        state.presence.snap(shown)

      if (state.spring.resting && (!withFade || state.presence.resting)) {
        growing.delete(el)
        finish(el, state.open, state.done)
        return false
      }

      const value = snap(Math.max(0, state.spring.value))
      const p = Math.max(0, Math.min(1, state.spring.value / Math.max(1, full)))
      const presence = Math.max(0, Math.min(1, state.presence.value))
      if (!noMotion) {
        el.style.height = `${value}px`
        if (mb > 0) el.style.marginBottom = `${snap(mb * p)}px`
        if (prevMb > 0) el.style.marginTop = `${snap(-prevMb * (1 - p))}px`
      }
      if (withFade || noMotion) {
        const child = el.firstElementChild instanceof HTMLElement ? el.firstElementChild : el
        styleFace(el, presence, { dy: 4, out: !state.open, hidden: card ? full - value : 0, content: child })
      }
      return true
    },
  )
}

function finish(el: HTMLElement, open: boolean, done?: () => void) {
  const child = el.firstElementChild instanceof HTMLElement ? el.firstElementChild : undefined
  el.removeAttribute("data-moving")
  el.removeAttribute("data-dock-border-underlay")
  ;["height", "margin-top", "margin-bottom", "overflow-clip-margin", "opacity", "filter", "transform", "mask-image"].forEach(
    (prop) => {
      el.style.removeProperty(prop)
      child?.style.removeProperty(prop)
    },
  )
  if (!open) done?.()
}
