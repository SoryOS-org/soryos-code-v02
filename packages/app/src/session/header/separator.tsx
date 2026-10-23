import { motionTuning } from "@opencode/ui/motion-tuning"
import { Match, Switch } from "solid-js"
import { createStore } from "solid-js/store"

const group = "Experiments"
const card = "Icons"
const order = 3

const glyph = motionTuning.choice("sessionHeader.separator", {
  label: "Separator",
  group,
  card,
  order,
  value: "chevron",
  labels: { divider: "Divider", slash: "Slash", chevron: "Chevron", bold: "Bold chevron", dot: "Dot" },
})

const size = motionTuning.number("sessionHeader.separator.size", {
  label: "Separator size",
  group,
  card,
  order,
  value: 11,
  min: 6,
  max: 24,
  step: 1,
  unit: "px",
})

const weight = motionTuning.number("sessionHeader.separator.weight", {
  label: "Separator weight",
  group,
  card,
  order,
  value: 1,
  min: 0.5,
  max: 3,
  step: 0.25,
  unit: "px",
})

const opacity = motionTuning.number("sessionHeader.separator.opacity", {
  label: "Separator opacity",
  group,
  card,
  order,
  value: 1,
  min: 0.2,
  max: 1,
  step: 0.05,
})

const gap = motionTuning.number("sessionHeader.separator.gap", {
  label: "Separator gap (ink to ink)",
  group,
  card,
  order,
  value: 10,
  min: 4,
  max: 20,
  step: 0.5,
  unit: "px",
})

const read = () => ({ glyph: glyph(), size: size(), weight: weight(), opacity: opacity(), gap: gap() })

const [tuning, setTuning] = createStore(read())

motionTuning.subscribe(() => setTuning(read()))

/**
 * Sits between breadcrumb segments with `gap` of visible space on both sides. `before` and `after` are the space the
 * neighbouring segments already leave between their ink and this element, so the margins make up the rest.
 */
export function SessionHeaderSeparator(props: {
  before?: number
  after?: number
  glyph?: typeof tuning.glyph
  gap?: number
}) {
  const glyph = () => props.glyph ?? tuning.glyph

  // The ink of every glyph fills its box, so the gap is exact; the text beside it keeps ~0.5px of side bearing.
  const width = () => {
    if (glyph() === "divider") return tuning.weight

    if (glyph() === "dot") return tuning.size / 4

    return tuning.size * 0.45
  }

  const stroke = () => tuning.weight * (glyph() === "bold" ? 2 : 1)

  return (
    <span
      data-slot="session-title-separator"
      data-glyph={glyph()}
      class="session-header-separator text-v2-text-text-faint"
      style={{
        "--separator-gap": `${props.gap ?? tuning.gap}px`,
        "--separator-before": props.before === undefined ? undefined : `${props.before}px`,
        "--separator-after": props.after === undefined ? undefined : `${props.after}px`,
        opacity: tuning.opacity,
      }}
      aria-hidden="true"
    >
      <Switch>
        <Match when={glyph() === "divider"}>
          <span class="block rounded-full bg-current" style={{ width: `${width()}px`, height: `${tuning.size}px` }} />
        </Match>
        <Match when={glyph() === "dot"}>
          <span class="block rounded-full bg-current" style={{ width: `${width()}px`, height: `${width()}px` }} />
        </Match>
        <Match when={glyph() === "slash"}>
          <span class="session-header-slash text-v2-icon-icon-faint" />
        </Match>
        <Match when={true}>
          <svg
            class="block fill-none stroke-current"
            width={width()}
            height={tuning.size}
            viewBox={`0 0 ${width()} ${tuning.size}`}
            stroke-width={stroke()}
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path
              d={`M${stroke() / 2} ${stroke() / 2}L${width() - stroke() / 2} ${tuning.size / 2}L${stroke() / 2} ${tuning.size - stroke() / 2}`}
            />
          </svg>
        </Match>
      </Switch>
    </span>
  )
}
