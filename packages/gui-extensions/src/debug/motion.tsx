import { createMemo, createSignal, For, Index, onCleanup, onMount, Show } from "solid-js"
import { Portal } from "solid-js/web"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { springStyle } from "@opencode/ui/motion/solid"
import { motionPresets, motionTuning } from "@opencode/ui/motion-tuning"
import {
  activeFeaturePreset,
  applyFeaturePreset,
  featureChanged,
  featureControls,
  featurePresets,
  motionFeatures,
  resetFeature,
  type MotionFeature,
} from "@opencode/ui/motion-tuning-features"
import { SegmentedControl, SegmentedControlItem } from "@opencode/ui/segmented-control"
import { useExtension } from "../sdk"
import { ControlRow } from "./motion-rows"

// Where the panel was dragged to, as an offset from its bottom-right home, its width, and the feature it last showed;
// kept per device.
const key = "opencode.motion.panel"

// From this width the list and the open feature sit side by side.
const wideAt = 560

// The push between the list and a feature's page: no bounce, transform and opacity only.
const push = { omega: (2 * Math.PI) / 0.34, zeta: 1 }

/**
 * The Knobs panel, docked above the debug bar's right end until its header is dragged: a list of the app's features
 * under their areas, each opening to a page with its presets, its controls on one grid, Replay, Focus and Reset. Wide
 * enough, the list and the page sit side by side.
 */
export default function Motion(props: { title: string; onClose: () => void }) {
  const ctx = useExtension()
  let container!: HTMLDivElement
  const saved = load()
  const offset = { x: saved.x, y: saved.y }
  const [width, setWidth] = createSignal(saved.width)
  const [selected, setSelected] = createSignal(saved.feature)
  const [pushed, setPushed] = createSignal(false)
  const [stack, setStack] = createSignal<HTMLDivElement>()
  // The registry isn't reactive; this ticks on every registration and edit, including the debug bar's.
  const [live, setLive] = createSignal(0)
  onCleanup(motionTuning.subscribe(() => setLive((value) => value + 1)))

  const areas = createMemo(() => {
    live()

    return motionFeatures()
  })

  const features = () => areas().flatMap((area) => area.features)
  const wide = () => width() >= wideAt
  const feature = () => features().find((item) => item.key === selected()) ?? (wide() ? features()[0] : undefined)
  const show = outline()
  let focusing: ReturnType<typeof setTimeout> | undefined

  onCleanup(() => {
    clearTimeout(focusing)
    show(undefined)
  })

  springStyle(
    stack,
    () => ({ push: pushed() ? 1 : 0 }),
    (element, value) => {
      element.style.setProperty("--push", `${value.push}`)
      element.toggleAttribute("data-home", value.push === 0 && !pushed())
    },
    push,
  )

  // A pushed page makes the list inert before the pointer leaves its row, so the hover outline is cleared here.
  const open = (item: MotionFeature) => {
    show(undefined)
    setSelected(item.key)
    setPushed(true)
    save({ ...offset, width: width(), feature: item.key })

    if (wide()) return
    // Shown now rather than on the spring's next frame, so focus can land in the page.
    stack()?.removeAttribute("data-home")
    container.querySelector<HTMLElement>("[data-motion-page] button")?.focus({ preventScroll: true })
  }

  const back = () => {
    setPushed(false)
    container
      .querySelector<HTMLElement>(`[data-motion-feature="${CSS.escape(selected() ?? "")}"]`)
      ?.focus({ preventScroll: true })
  }

  const focus = (target: string) => {
    clearTimeout(focusing)
    document.querySelector(target)?.scrollIntoView({ block: "nearest", inline: "nearest" })
    show(undefined)
    show(target)
    focusing = setTimeout(() => show(undefined), 1600)
  }

  const escape = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || event.defaultPrevented) return
    event.preventDefault()
    event.stopPropagation()

    if (!wide() && pushed()) return back()
    props.onClose()
  }

  const place = () => (container.style.transform = `translate(${offset.x}px, ${offset.y}px)`)

  // Moves by at most what keeps the whole panel in the window, reading layout once rather than every frame.
  const bounds = () => {
    const rect = container.getBoundingClientRect()

    return {
      x: [offset.x - rect.left, offset.x + window.innerWidth - rect.right],
      y: [offset.y - rect.top, offset.y + window.innerHeight - rect.bottom],
    }
  }

  const clamp = (limits: ReturnType<typeof bounds>, x: number, y: number) => {
    offset.x = Math.min(Math.max(x, limits.x[0]), Math.max(limits.x[0], limits.x[1]))
    offset.y = Math.min(Math.max(y, limits.y[0]), Math.max(limits.y[0], limits.y[1]))
    place()
  }

  const settle = () => {
    clamp(bounds(), offset.x, offset.y)
    save({ ...offset, width: width(), feature: selected() })
  }

  const grab = (event: PointerEvent) => {
    if (event.button !== 0 || !(event.currentTarget instanceof HTMLElement)) return

    if (event.target instanceof Element && event.target.closest("button")) return
    const header = event.currentTarget
    event.preventDefault()
    const limits = bounds()
    const start = { x: event.clientX - offset.x, y: event.clientY - offset.y }
    header.setPointerCapture(event.pointerId)

    const move = (moved: PointerEvent) => clamp(limits, moved.clientX - start.x, moved.clientY - start.y)

    const drop = () => {
      header.removeEventListener("pointermove", move)
      header.removeEventListener("pointerup", drop)
      header.removeEventListener("pointercancel", drop)
      settle()
    }

    header.addEventListener("pointermove", move)
    header.addEventListener("pointerup", drop)
    header.addEventListener("pointercancel", drop)
  }

  // The left edge resizes; the right edge stays where it is.
  const resize = (event: PointerEvent) => {
    if (event.button !== 0 || !(event.currentTarget instanceof HTMLElement)) return
    const edge = event.currentTarget
    event.preventDefault()
    const start = { x: event.clientX, width: width() }
    edge.setPointerCapture(event.pointerId)

    const move = (moved: PointerEvent) =>
      setWidth(Math.round(Math.min(Math.max(320, start.width + start.x - moved.clientX), window.innerWidth - 24)))

    const drop = () => {
      edge.removeEventListener("pointermove", move)
      edge.removeEventListener("pointerup", drop)
      edge.removeEventListener("pointercancel", drop)
      settle()
    }

    edge.addEventListener("pointermove", move)
    edge.addEventListener("pointerup", drop)
    edge.addEventListener("pointercancel", drop)
  }

  onMount(() => {
    place()
    const observer = new ResizeObserver(settle)
    observer.observe(container)
    window.addEventListener("resize", settle)
    onCleanup(() => {
      observer.disconnect()
      window.removeEventListener("resize", settle)
    })
  })

  const list = () => (
    <div class="pb-3">
      <Index each={areas()}>
        {(area) => (
          <section>
            <h3 class="px-4 pb-1.5 pt-4 text-[11px] font-semibold uppercase leading-4 tracking-[0.06em] text-v2-text-text-faint">
              {area().area}
            </h3>
            <Index each={area().features}>
              {(item) => (
                <button
                  type="button"
                  data-motion-feature={item().key}
                  aria-current={wide() && feature()?.key === item().key ? "page" : undefined}
                  class="grid min-h-12 w-full grid-cols-[minmax(0,1fr)_16px_16px] items-center gap-x-2 border-t border-v2-border-border-muted px-4 py-1.5 text-start hover:bg-v2-overlay-simple-overlay-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-v2-border-border-focus aria-[current=page]:bg-v2-overlay-simple-overlay-hover"
                  onPointerEnter={() => {
                    clearTimeout(focusing)
                    show(item().target)
                  }}
                  onPointerLeave={() => show(undefined)}
                  onClick={() => open(item())}
                >
                  <span class="min-w-0">
                    <span class="flex items-baseline gap-2 text-[14px] font-medium leading-5 text-v2-text-text-base">
                      <span class="truncate">{item().name}</span>
                      <Show when={item().switch?.value === false}>
                        <span class="text-[11px] font-medium text-v2-text-text-faint">{ctx.t("motion.off")}</span>
                      </Show>
                      <Show when={item().modes.find((mode) => mode.value)}>
                        {(mode) => <span class="text-[11px] font-medium text-v2-text-text-faint">{mode().label}</span>}
                      </Show>
                    </span>
                    <Show when={item().description}>
                      {(description) => (
                        <span class="block truncate text-[12px] leading-[18px] text-v2-text-text-faint">
                          {description()}
                        </span>
                      )}
                    </Show>
                  </span>
                  <span class="grid size-4 place-items-center">
                    <Show when={featureChanged(item())}>
                      <span class="size-1.5 rounded-full bg-v2-icon-icon-accent" />
                    </Show>
                  </span>
                  <Show when={!wide()} fallback={<span />}>
                    <Icon name="outline-chevron-right" size="small" class="text-v2-icon-icon-faint rtl:-scale-x-100" />
                  </Show>
                </button>
              )}
            </Index>
          </section>
        )}
      </Index>
    </div>
  )

  const page = () => (
    <Show when={feature()}>
      {(item) => (
        <FeaturePage
          feature={item()}
          live={live}
          back={wide() ? undefined : back}
          onFocus={focus}
        />
      )}
    </Show>
  )

  return (
    <Portal>
      <div
        ref={container}
        class="pointer-events-auto fixed bottom-10 right-3 z-50 flex h-[min(600px,calc(100vh-6rem))] flex-col overflow-hidden rounded-[10px] border border-v2-border-border-muted bg-v2-background-bg-base text-v2-text-text-base shadow-[var(--v2-elevation-floating)]"
        style={{ width: `${width()}px` }}
        onKeyDown={escape}
      >
        <div
          class="absolute inset-y-0 left-0 z-10 w-1.5 cursor-ew-resize touch-none"
          aria-hidden="true"
          onPointerDown={resize}
        />
        <header
          class="flex h-10 shrink-0 cursor-grab touch-none items-center justify-between gap-2 border-b border-v2-border-border-muted ps-4 pe-1.5"
          onPointerDown={grab}
        >
          <h2 class="text-[13px] font-semibold leading-5">{props.title}</h2>
          <IconButton
            size="small"
            variant="ghost-muted"
            icon={<Icon name="close" />}
            aria-label={ctx.t("motion.close")}
            onClick={() => props.onClose()}
          />
        </header>
        <Show
          when={!wide()}
          fallback={
            <div class="grid min-h-0 flex-1 grid-cols-[240px_minmax(0,1fr)]">
              <div class="min-h-0 overflow-y-auto border-e border-v2-border-border-muted">{list()}</div>
              <div class="min-h-0 overflow-y-auto">{page()}</div>
            </div>
          }
        >
          <div
            ref={setStack}
            class="group/stack relative min-h-0 flex-1 overflow-hidden [--dir:1] rtl:[--dir:-1]"
            data-home=""
          >
            <div
              class="absolute inset-0 overflow-y-auto"
              inert={pushed()}
              style={{
                transform: "translateX(calc(var(--push, 0) * -30% * var(--dir)))",
                opacity: "calc(1 - var(--push, 0) * 0.6)",
              }}
            >
              {list()}
            </div>
            <div
              data-motion-page=""
              class="absolute inset-0 overflow-y-auto bg-v2-background-bg-base group-data-[home]/stack:invisible"
              inert={!pushed()}
              style={{ transform: "translateX(calc((1 - var(--push, 0)) * 100% * var(--dir)))" }}
            >
              {page()}
            </div>
          </div>
        </Show>
      </div>
    </Portal>
  )
}

function FeaturePage(props: {
  feature: MotionFeature
  live: () => number
  back?: () => void
  onFocus: (target: string) => void
}) {
  const ctx = useExtension()

  const state = createMemo(() => {
    props.live()

    return {
      controls: featureControls(props.feature),
      presets: featurePresets(props.feature),
      active: activeFeaturePreset(props.feature),
      changed: featureChanged(props.feature),
      on: props.feature.switch?.value !== false,
    }
  })

  const presetLabel = (preset: string) => {
    if (preset === "shipped") return ctx.t("motion.shipped")

    if (preset === "snappy" || preset === "smooth" || preset === "calm") return motionPresets[preset]

    return props.feature.modes.find((item) => item.id === preset)?.label ?? preset
  }

  return (
    <div class="pb-6">
      <Show when={props.back}>
        {(back) => (
          <button
            type="button"
            class="flex h-9 items-center gap-0.5 ps-2.5 pe-3 text-[13px] font-medium text-v2-text-text-muted hover:text-v2-text-text-base"
            onClick={() => back()()}
          >
            <Icon name="outline-chevron-right" size="small" class="-scale-x-100 rtl:scale-x-100" />
            <span>{props.feature.area}</span>
          </button>
        )}
      </Show>
      <h3 classList={{ "px-4 text-[17px] font-semibold leading-6": true, "pt-4": !props.back }}>{props.feature.name}</h3>
      <Show when={props.feature.description}>
        {(description) => <p class="mt-1 px-4 text-[13px] leading-[18px] text-v2-text-text-muted">{description()}</p>}
      </Show>
      <div class="flex flex-wrap items-center gap-2 px-4 pt-4">
        {/* One trigger is Replay; several replay on their own, each named for what it moves. */}
        <For each={props.feature.actions}>
          {(item) => (
            <PageButton
              icon="outline-rotate-clockwise"
              label={props.feature.actions.length === 1 ? ctx.t("motion.replay") : item.label}
              onClick={() => item.run()}
            />
          )}
        </For>
        <Show when={props.feature.target}>
          {(target) => (
            <PageButton icon="select-element" label={ctx.t("motion.focus")} onClick={() => props.onFocus(target())} />
          )}
        </Show>
        <span class="ms-auto">
          <PageButton
            icon="outline-reset"
            label={ctx.t("motion.reset")}
            disabled={!state().changed}
            onClick={() => resetFeature(props.feature)}
          />
        </span>
      </div>
      <Show when={state().on && state().presets.length > 0}>
        <div class="px-4 pt-4">
          <SegmentedControl
            class="segmented-control-v2--full-width"
            aria-label={ctx.t("motion.presets")}
            value={state().active ?? null}
            onChange={(preset) => {
              if (preset) applyFeaturePreset(props.feature, preset)
            }}
          >
            <For each={state().presets}>
              {(preset) => (
                <SegmentedControlItem class="text-[12px]" style={{ padding: "0 4px" }} value={preset}>
                  <span class="truncate">{presetLabel(preset)}</span>
                </SegmentedControlItem>
              )}
            </For>
          </SegmentedControl>
          <Show when={!state().active}>
            <p class="mt-1.5 text-[12px] leading-4 text-v2-text-text-faint">{ctx.t("motion.custom")}</p>
          </Show>
        </div>
      </Show>
      <div class="mt-4 divide-y divide-v2-border-border-muted border-t border-v2-border-border-muted">
        {/* Keyed: a row keeps the knob it mounted with, so another feature's switch needs a row of its own. */}
        <Show when={props.feature.switch} keyed>
          {(item) => <ControlRow knob={item} live={props.live} label={ctx.t("motion.enabled")} />}
        </Show>
        <For each={state().controls}>{(item) => <ControlRow knob={item} live={props.live} />}</For>
      </div>
    </div>
  )
}

function PageButton(props: {
  icon: "outline-rotate-clockwise" | "select-element" | "outline-reset"
  label: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      class="flex h-8 items-center gap-1.5 rounded-lg bg-v2-background-bg-layer-01 ps-2.5 pe-3 text-[13px] font-medium text-v2-text-text-base shadow-[0_0_0_0.5px_var(--v2-border-border-base)] hover:bg-v2-background-bg-layer-02 focus-visible:outline focus-visible:outline-2 focus-visible:outline-v2-border-border-focus disabled:pointer-events-none disabled:text-v2-text-text-faint"
      onClick={() => props.onClick()}
    >
      <Icon name={props.icon} size="small" class="text-v2-icon-icon-muted" />
      <span>{props.label}</span>
    </button>
  )
}

// Frames the part of the app a feature changes: a pointer-transparent outline that fades in and out. Its rects are read
// once per change of target, never per frame.
function outline() {
  const frames: HTMLElement[] = []
  let current: string | undefined

  const clear = () =>
    frames.splice(0).forEach((frame) => {
      frame.style.opacity = "0"
      setTimeout(() => frame.remove(), 200)
    })

  return (target: string | undefined) => {
    if (target === current) return
    current = target
    clear()

    if (!target) return

    document.querySelectorAll(target).forEach((element) => {
      const rect = element.getBoundingClientRect()

      if (rect.width === 0 || rect.height === 0) return
      const frame = document.body.appendChild(document.createElement("div"))

      frame.style.cssText = `position:fixed;z-index:60;pointer-events:none;opacity:0;transition:opacity .15s;border-radius:6px;
        left:${rect.left - 3}px;top:${rect.top - 3}px;width:${rect.width + 6}px;height:${rect.height + 6}px;
        border:1.5px solid var(--v2-border-border-focus);background:color-mix(in srgb, var(--v2-border-border-focus) 10%, transparent)`
      requestAnimationFrame(() => (frame.style.opacity = "1"))
      frames.push(frame)
    })
  }
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "{}")

    return {
      x: Number(saved.x) || 0,
      y: Number(saved.y) || 0,
      width: Number(saved.width) || 360,
      feature: saved.feature ? String(saved.feature) : undefined,
    }
  } catch {
    return { x: 0, y: 0, width: 360, feature: undefined }
  }
}

function save(state: { x: number; y: number; width: number; feature: string | undefined }) {
  try {
    localStorage.setItem(key, JSON.stringify(state))
  } catch {}
}
