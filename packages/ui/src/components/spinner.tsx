import { createSignal, For, Show, splitProps, type ComponentProps } from "solid-js"
import { syncSpinPhase } from "../hooks/spin-phase"
import { motionTuning } from "../motion-tuning"
import { spinnerDots, spinnerKeyframes, spinnerVariants, type SpinnerVariant } from "./spinner-variants"

export type SpinnerVariantName = "today" | keyof typeof spinnerVariants

// Experiment: dot-matrix variations to try in place of today's spinner, everywhere it shows (tabs, loaders, the
// update button), before one ships.
const choice = motionTuning.choice("spinner.variant", {
  label: "Activity spinner",
  group: "Experiments",
  value: "today",
  // SAFETY: built from spinnerVariants' own keys, plus "today".
  labels: Object.fromEntries([
    ["today", "Today"],
    ...Object.entries(spinnerVariants).map(([name, variant]) => [name, variant.label]),
  ]) as Record<SpinnerVariantName, string>,
})

const [chosen, setChosen] = createSignal(choice())

motionTuning.subscribe(() => setChosen(choice()))

// Each variation's keyframes are added to the document once, the first time one renders.
const added = new Set<string>()

export function Spinner(props: ComponentProps<"svg"> & { "data-component"?: string; variant?: SpinnerVariantName }) {
  const [local, rest] = splitProps(props, ["variant", "class", "classList", "data-component"])
  const name = () => local.variant ?? chosen()
  // SAFETY: "today" is the only name that isn't a key of spinnerVariants, and it maps to undefined.
  const variant = (): SpinnerVariant | undefined => spinnerVariants[name() as keyof typeof spinnerVariants]
  const classList = () => ({ ...local.classList, [local.class ?? ""]: !!local.class })

  return (
    <Show
      when={variant()}
      fallback={
        <svg
          {...rest}
          viewBox="0 0 16 16"
          data-component={local["data-component"] ?? "spinner"}
          data-slot="spinner-grid"
          classList={classList()}
          fill="currentColor"
        >
          <rect data-reduced-motion x={7} y={7} width={2} height={2} />
        </svg>
      }
    >
      {(current) => {
        const keyframes = `spinner-${name()}`

        if (!added.has(keyframes)) {
          added.add(keyframes)
          const style = document.createElement("style")
          style.textContent = spinnerKeyframes(keyframes, current())
          document.head.append(style)
        }

        return (
          <svg
            {...rest}
            ref={syncSpinPhase}
            viewBox="0 0 16 16"
            data-component={local["data-component"] ?? "spinner"}
            data-slot="spinner-dots"
            data-variant={name()}
            classList={classList()}
            fill="currentColor"
          >
            <For each={spinnerDots(current())}>
              {(dot) => {
                const loop = current().loop * dot.scale

                return (
                  <rect
                    x={dot.x}
                    y={dot.y}
                    width={dot.size}
                    height={dot.size}
                    rx={dot.size * 0.24}
                    style={{
                      "--still": dot.hold === "lit" ? 1 : dot.hold === "rest" ? current().dim : dot.still,
                      animation: dot.hold
                        ? undefined
                        : `${keyframes} calc(${loop}s * var(--spinner-time, 1)) linear calc(${-loop * (1 - dot.at)}s * var(--spinner-time, 1)) infinite`,
                    }}
                  />
                )
              }}
            </For>
          </svg>
        )
      }}
    </Show>
  )
}
