import { For, Show, type Accessor } from "solid-js"
import { sliderFraction, sliderStep, sliderValue, Spring, type DurationOptions } from "@opencode/ui/motion"
import { motionTuning, type Bezier, type MotionKnob } from "@opencode/ui/motion-tuning"
import { changed, reset } from "@opencode/ui/motion-tuning-features"
import { SegmentedControl, SegmentedControlItem } from "@opencode/ui/segmented-control"
import { Switch } from "@opencode/ui/switch"
import { Tooltip } from "@opencode/ui/tooltip"
import { useExtension } from "../sdk"

type Of<Kind extends MotionKnob["kind"]> = Extract<MotionKnob, { kind: Kind }>

// One grid for every row on a feature's page: the label, the control, the value right-aligned in its own column, and
// the dot that resets a changed knob.
const row = "grid min-h-11 grid-cols-[104px_minmax(0,1fr)_64px_16px] items-center gap-x-2 px-4"

const sub = "grid min-h-8 grid-cols-[104px_minmax(0,1fr)_64px_16px] items-center gap-x-2 px-4"

/**
 * A knob's row on its feature's page. `live` changes whenever any knob does, since the registry isn't reactive. A row
 * keeps its knob for its lifetime, so the control under a drag is never replaced.
 */
export function ControlRow(props: { knob: MotionKnob; live: Accessor<number>; label?: string }) {
  const knob = props.knob
  const label = () => props.label ?? knob.label

  if (knob.kind === "number") return <NumberRow knob={knob} live={props.live} label={label()} />

  if (knob.kind === "toggle" || knob.kind === "mode") return <ToggleRow knob={knob} live={props.live} label={label()} />

  if (knob.kind === "choice") return <ChoiceRow knob={knob} live={props.live} label={label()} />

  if (knob.kind === "spring") return <SpringRow knob={knob} live={props.live} label={label()} />

  return <EasingRow knob={knob} live={props.live} label={label()} />
}

function NumberRow(props: { knob: Of<"number">; live: Accessor<number>; label: string }) {
  const value = read(props.knob, props.live)

  return (
    <div class={row}>
      <Label text={props.label} />
      <Track
        label={props.label}
        value={value()}
        shipped={props.knob.initial}
        min={props.knob.min}
        max={props.knob.max}
        step={props.knob.step}
        onChange={(next) => motionTuning.set(props.knob, next)}
      />
      <Value text={format(value(), props.knob.step, props.knob.unit)} />
      <Dot knob={props.knob} live={props.live} />
    </div>
  )
}

function ToggleRow(props: { knob: Of<"toggle"> | Of<"mode">; live: Accessor<number>; label: string }) {
  const value = read(props.knob, props.live)

  return (
    <div class={row}>
      <Label text={props.label} />
      <span />
      <Switch class="justify-self-end" checked={value()} onChange={(next) => motionTuning.set(props.knob, next)} hideLabel>
        {props.label}
      </Switch>
      <Dot knob={props.knob} live={props.live} />
    </div>
  )
}

function ChoiceRow(props: { knob: Of<"choice">; live: Accessor<number>; label: string }) {
  const value = read(props.knob, props.live)

  return (
    <div class={row}>
      <Label text={props.label} />
      <SegmentedControl
        class="segmented-control-v2--full-width col-span-2"
        aria-label={props.label}
        value={value()}
        onChange={(next) => {
          if (next) motionTuning.set(props.knob, next)
        }}
      >
        <For each={props.knob.options}>
          {(option) => (
            <SegmentedControlItem class="text-[12px]" style={{ padding: "0 4px" }} value={option}>
              <span class="truncate">{props.knob.labels[option] ?? option}</span>
            </SegmentedControlItem>
          )}
        </For>
      </SegmentedControl>
      <Dot knob={props.knob} live={props.live} />
    </div>
  )
}

function SpringRow(props: { knob: Of<"spring">; live: Accessor<number>; label: string }) {
  const ctx = useExtension()
  const value = read(props.knob, props.live)
  const set = (patch: Partial<DurationOptions>) => motionTuning.set(props.knob, { ...value(), ...patch })
  const span = () => Math.max(value().duration, props.knob.initial.duration) * 1.6

  return (
    <div class="py-1">
      <div class={row}>
        <Label text={props.label} />
        <Graph ghost={springPath(props.knob.initial, span())} path={springPath(value(), span())} />
        <Dot knob={props.knob} live={props.live} />
      </div>
      <div class={sub}>
        <Label text={ctx.t("motion.duration")} sub />
        <Track
          label={`${props.label} ${ctx.t("motion.duration")}`}
          value={value().duration}
          shipped={props.knob.initial.duration}
          min={0.05}
          max={1}
          step={0.01}
          onChange={(duration) => set({ duration })}
        />
        <Value text={format(value().duration, 0.01, "s")} />
      </div>
      <div class={sub}>
        <Label text={ctx.t("motion.bounce")} sub />
        <Track
          label={`${props.label} ${ctx.t("motion.bounce")}`}
          value={value().bounce}
          shipped={props.knob.initial.bounce}
          min={0}
          max={0.6}
          step={0.01}
          onChange={(bounce) => set({ bounce })}
        />
        <Value text={format(value().bounce, 0.01)} />
      </div>
    </div>
  )
}

const handles = [
  { label: "x1", min: 0, max: 1 },
  { label: "y1", min: -0.5, max: 1.5 },
  { label: "x2", min: 0, max: 1 },
  { label: "y2", min: -0.5, max: 1.5 },
]

function EasingRow(props: { knob: Of<"easing">; live: Accessor<number>; label: string }) {
  const value = read(props.knob, props.live)

  const set = (index: number, next: number) => {
    const curve: Bezier = [...value()]
    curve[index] = next
    motionTuning.set(props.knob, curve)
  }

  return (
    <div class="py-1">
      <div class={row}>
        <Label text={props.label} />
        <Graph ghost={bezierPath(props.knob.initial)} path={bezierPath(value())} />
        <Dot knob={props.knob} live={props.live} />
      </div>
      <For each={handles}>
        {(handle, index) => (
          <div class={sub}>
            <Label text={handle.label} sub />
            <Track
              label={`${props.label} ${handle.label}`}
              value={value()[index()] ?? 0}
              shipped={props.knob.initial[index()] ?? 0}
              min={handle.min}
              max={handle.max}
              step={0.01}
              onChange={(next) => set(index(), next)}
            />
            <Value text={format(value()[index()] ?? 0, 0.01)} />
          </div>
        )}
      </For>
    </div>
  )
}

function Label(props: { text: string; sub?: boolean }) {
  return (
    <span
      title={props.text}
      classList={{
        "truncate leading-[18px]": true,
        "text-[13px] text-v2-text-text-base": !props.sub,
        "ps-3 text-[12px] text-v2-text-text-faint": !!props.sub,
      }}
    >
      {props.text}
    </span>
  )
}

function Value(props: { text: string }) {
  return (
    <span dir="ltr" class="justify-self-end whitespace-nowrap font-mono text-[12px] tabular-nums text-v2-text-text-base">
      {props.text}
    </span>
  )
}

// A changed knob's dot resets it to what ships.
function Dot(props: { knob: MotionKnob; live: Accessor<number> }) {
  const ctx = useExtension()

  const shown = () => {
    props.live()

    return changed(props.knob)
  }

  return (
    <Show when={shown()} fallback={<span />}>
      <Tooltip appearance="compact" value={ctx.t("motion.reset")} placement="top">
        <button
          type="button"
          class="grid size-4 place-items-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-v2-border-border-focus"
          aria-label={ctx.t("motion.reset")}
          onClick={() => reset(props.knob)}
        >
          <span class="size-1.5 rounded-full bg-v2-icon-icon-accent" />
        </button>
      </Tooltip>
    </Show>
  )
}

// A slider whose track scrubs: press anywhere on it and drag. The amber tick marks what ships.
function Track(props: {
  label: string
  value: number
  shipped: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}) {
  let track!: HTMLDivElement
  const spec = () => ({ min: props.min, max: props.max, step: props.step })
  const percent = (value: number) => `${sliderFraction(spec(), value) * 100}%`

  const at = (x: number) => {
    const rect = track.getBoundingClientRect()

    return sliderValue(spec(), props.min + ((x - rect.left) / Math.max(1, rect.width)) * (props.max - props.min))
  }

  const press = (event: PointerEvent) => {
    if (event.button !== 0) return
    event.preventDefault()
    track.setPointerCapture(event.pointerId)
    track.focus()
    props.onChange(at(event.clientX))
  }

  const drag = (event: PointerEvent) => {
    if (track.hasPointerCapture(event.pointerId)) props.onChange(at(event.clientX))
  }

  const key = (event: KeyboardEvent) => {
    const direction = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[event.key]

    if (direction !== 1 && direction !== -1) return
    event.preventDefault()
    props.onChange(sliderStep(spec(), props.value, direction, event.shiftKey ? 10 : 1))
  }

  return (
    <div
      ref={track}
      role="slider"
      tabIndex={0}
      dir="ltr"
      aria-label={props.label}
      aria-valuemin={props.min}
      aria-valuemax={props.max}
      aria-valuenow={props.value}
      class="group/track relative h-7 min-w-0 cursor-ew-resize touch-none rounded outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-v2-border-border-focus"
      onPointerDown={press}
      onPointerMove={drag}
      onKeyDown={key}
    >
      <span class="absolute inset-x-0 top-[13px] h-0.5 rounded-full bg-v2-background-bg-layer-03" />
      <span
        class="absolute left-0 top-[13px] h-0.5 rounded-full bg-v2-icon-icon-muted group-hover/track:bg-v2-icon-icon-base"
        style={{ width: percent(props.value) }}
      />
      <span
        class="absolute top-[9px] -ml-px h-2.5 w-0.5 rounded-full bg-v2-icon-icon-accent opacity-60"
        style={{ left: percent(props.shipped) }}
      />
      <span
        class="absolute top-[7px] -ml-[7px] size-3.5 rounded-full bg-v2-text-text-base shadow-[var(--v2-elevation-elements)]"
        style={{ left: percent(props.value) }}
      />
    </div>
  )
}

// The curve a spring or easing draws, over the shipped one dashed.
function Graph(props: { ghost: string; path: string }) {
  return (
    <svg
      class="col-span-2 h-12 w-full rounded-md bg-v2-background-bg-layer-01"
      viewBox="0 0 240 48"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={props.ghost} fill="none" class="stroke-v2-icon-icon-faint" stroke-width="1.5" stroke-dasharray="3 3" />
      <path d={props.path} fill="none" class="stroke-v2-text-text-base" stroke-width="2" />
    </svg>
  )
}

function read<K extends MotionKnob>(knob: K, live: Accessor<number>): Accessor<K["value"]> {
  return () => {
    live()

    return knob.value
  }
}

function format(value: number, step: number, unit?: string) {
  const text = value.toFixed(step < 0.01 ? 3 : step < 0.1 ? 2 : step < 1 ? 1 : 0)

  if (!unit) return text

  return unit === "%" ? `${text}%` : `${text} ${unit}`
}

// Height runs from 0 at the bottom to 1 near the top, with room above for overshoot.
const y = (value: number) => 42 - value * 32

function springPath(options: DurationOptions, span: number) {
  const spring = Spring.fromDuration(0, { duration: Math.max(0.03, options.duration), bounce: Math.min(0.95, options.bounce) })
  spring.set(1)
  const steps = 96

  return Array.from({ length: steps + 1 }, (_, index) => {
    const point = `${index === 0 ? "M" : "L"}${((index / steps) * 240).toFixed(1)},${y(spring.value).toFixed(1)}`
    spring.step(span / steps)

    return point
  }).join("")
}

function bezierPath(curve: Bezier) {
  const [x1, y1, x2, y2] = curve
  const x = (value: number) => 8 + value * 224

  return `M${x(0)},${y(0)} C${x(x1)},${y(y1)} ${x(x2)},${y(y2)} ${x(1)},${y(1)}`
}
