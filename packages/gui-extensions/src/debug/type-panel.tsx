import { createSignal, For } from "solid-js"
import { Portal } from "solid-js/web"
import { apply, load, options, save, type Type } from "./type"

const groups = [
  ["smoothing", "Smoothing"],
  ["family", "Family"],
  ["weight", "Weight"],
  ["tracking", "Tracking"],
  ["opsz", "Inter opsz"],
] as const

// The Type workspace: live text-rendering overrides, docked above the debug bar's left end. Choices persist on this device.
export default function TypePanel(props: { title: string }) {
  const [type, setType] = createSignal<Type>(load())

  const update = (next: Type) => {
    setType(next)
    apply(next)
    save(next)
  }

  return (
    <Portal>
      <div class="pointer-events-auto fixed bottom-10 left-3 z-50 w-[320px] rounded-xl border border-border-base bg-surface-raised-stronger-non-alpha p-3 text-12-regular text-text-strong shadow-[var(--shadow-lg-border-base)]">
        <div class="mb-2 flex items-center justify-between">
          <span class="font-bold">{props.title}</span>
          <button type="button" class="rounded px-1.5 hover:bg-surface-raised-base" onClick={() => update({})}>
            Reset
          </button>
        </div>
        <For each={groups}>
          {([name, label]) => (
            <div class="flex items-center justify-between gap-2 py-1">
              <span class="opacity-70">{label}</span>
              <div class="flex gap-1">
                <For each={[undefined, ...options[name]]}>
                  {(value) => (
                    <button
                      type="button"
                      aria-pressed={type()[name] === value}
                      classList={{
                        "rounded px-1.5 py-0.5 hover:bg-surface-raised-base": true,
                        "bg-surface-raised-base font-bold": type()[name] === value,
                      }}
                      onClick={() => update({ ...type(), [name]: value })}
                    >
                      {value ?? "app"}
                    </button>
                  )}
                </For>
              </div>
            </div>
          )}
        </For>
      </div>
    </Portal>
  )
}
