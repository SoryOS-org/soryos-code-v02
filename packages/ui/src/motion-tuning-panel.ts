import { motionPresets, motionTuning, type MotionKnob, type MotionPreset } from "./motion-tuning"

const global = "Global"

// The areas in the order the panel shows them; any other area follows in the order it registered.
const areas = ["Sidebars", "Composer", "Projects", "Voice"]

/**
 * Mounts the Knobs panel into `container`: the Global card (speed and slow motion) pinned at the top, the shipped values
 * and the Snappy, Smooth and Calm presets for every spring at once, then a collapsible card per area of the app with
 * its knobs under sub-headings and its replay buttons. Experiments carry a marker after their label. knobs loads on
 * first mount, so importing this module costs nothing until then. Works anywhere a surface registered its knobs,
 * including Storybook stories. Returns its removal.
 */
export function mountMotionPanel(container: HTMLElement, options: { title?: string; onClose?: () => void } = {}) {
  let unmount: (() => void) | undefined
  // The preset chosen to leave a mode, applied once the rebuilt panel has the knobs it sets.
  let switching: string | undefined
  let disposed = false

  void start()

  return () => {
    disposed = true
    unmount?.()
  }

  async function start() {
    const [{ action, defineControls }, { applyMotion, motionField }] = await Promise.all([
      import("knobs"),
      import("./motion-tuning-fields"),
    ])

    // Knobs whose `when` doesn't hold are left out; a change to it rebuilds the panel like a new knob would.
    const shown = () => motionTuning.list().filter((item) => item.when?.() ?? true)

    const identity = () => [...shown(), ...motionTuning.actions()].map((item) => `${item.group}/${item.id}`).join()

    // Rebuilt when a surface registers or removes a knob or action.
    const mount = () => {
      unmount?.()
      const all = shown()
      // Modes sit in the preset strip, not as rows. While one is on, the spring presets leave its area's springs alone
      // (choosing one switches back to them first); other areas' springs take presets as usual.
      const active = all.find((item) => item.kind === "mode" && item.value)
      const modes = all.filter((item) => item.kind === "mode")
      const list = all.filter((item) => item.kind !== "mode")
      const actions = motionTuning.actions()
      const mounted = identity()
      const springs = list.flatMap((item) => (item.kind === "spring" && item.group !== active?.group ? [item] : []))
      const preset = (id: MotionPreset) => Object.fromEntries(springs.map((item) => [item.id, item.presets[id]]))
      const experiments = new Set(list.flatMap((item) => (item.experiment ? [item.id] : [])))
      // Easing editors open inline, like the spring rows beside them, rather than folded behind a chevron.
      openEditors(list.flatMap((item) => (item.kind === "easing" ? [item.id] : [])))

      const rank = (group: string) => (areas.includes(group) ? areas.indexOf(group) : areas.length)
      const groups = [...new Set([...list, ...actions].map((item) => item.group))]
        .filter((group) => group !== global)
        .toSorted((a, b) => rank(a) - rank(b))

      const controls = defineControls(
        "opencode-motion",
        {
          // Global first, then each area's knobs and its replay buttons together, so each shows as one card.
          ...Object.fromEntries(
            list
              .filter((item) => item.group === global)
              .map((item) => [item.id, motionField(item, { label: item.label, group: global })]),
          ),
          ...Object.fromEntries(
            groups.flatMap((group) => [
              ...list
                .filter((item) => item.group === group)
                .map((item) => [item.id, motionField(item, { label: item.label, group, subsection: item.subsection })]),
              ...actions
                .filter((item) => item.group === group)
                .map((item) => [
                  `action.${item.id}`,
                  action(item.label, { group, subsection: item.subsection ?? "Replay", run: item.run }),
                ]),
            ]),
          ),
        },
        {
          // knobs enables itself only on localhost; this module is only loaded in developer channels.
          enabled: true,
          ship: () => import("knobs/panel"),
          persist: "variants",
          pinned: [global],
          // Each area folds to its header; knobs remembers what's open for the rest of the session.
          groupFolded: Object.fromEntries(groups.map((group) => [group, true])),
          // Springs ship different presets, so the defaults get their own chip.
          defaultLabel: "Shipped",
          presetLabels: { ...motionPresets, ...Object.fromEntries(modes.map((item) => [item.id, item.label])) },
          presets: {
            snappy: preset("snappy"),
            smooth: preset("smooth"),
            calm: preset("calm"),
            ...Object.fromEntries(modes.map((item) => [item.id, {}])),
          },
          onChange: (patch) =>
            list.forEach((item) => {
              // SAFETY: each field was made from its knob above, so its value is that knob's kind.
              const value = patch[item.id] as MotionKnob["value"] | undefined

              if (value !== undefined) applyMotion(item, value)
            }),
        },
      )

      const sync = () => controls.sync(Object.fromEntries(list.map((item) => [item.id, item.value])))
      sync()

      // The strip shows the mode that's on; a preset chosen while a mode was on applies once its knobs are back.
      if (active && active.id in controls.presets) controls.preset(active.id)

      if (!active && switching && switching in controls.presets) controls.preset(switching)
      switching = undefined

      const stopModes = controls.subscribe(() => {
        const chosen = controls.activePreset()

        modes.forEach((item) => {
          const on = chosen?.kind === "preset" && chosen.id === item.id

          if (on === item.value) return

          if (!on) switching = chosen?.kind === "preset" ? chosen.id : chosen ? undefined : "default"
          motionTuning.set(item, on)
        })
      })

      const stopPanel = controls.mount(container, {
        theme: "auto",
        title: options.title ?? "Knobs",
        onClose: options.onClose,
        // The debug bar shows and hides this panel, and `s` jumps only with focus inside it, so the app keeps its keys.
        toggleKey: false,
        hints: "panel",
        rowAccessory: (key) => (experiments.has(key) ? experimentMark() : null),
      })

      const stopWatch = motionTuning.subscribe(() => {
        // Edits from elsewhere, such as the debug bar's SLOW, show here too.
        if (identity() === mounted) return sync()
        mount()
      })

      unmount = () => {
        stopWatch()
        stopModes()
        stopPanel()
      }
    }

    if (!disposed) mount()
  }
}

// Marks a row as a design experiment, in the panel's quietest caption style.
function experimentMark() {
  const mark = document.createElement("span")
  mark.dataset.experiment = ""
  mark.textContent = "Exp"
  mark.title = "Experiment"
  mark.style.cssText = "font-size: var(--_k-text-cap); letter-spacing: 0.06em; color: var(--_k-fg-3)"

  return mark
}

// knobs remembers which rows' editors are open in this tab's session; adding ids there opens them on mount.
function openEditors(ids: string[]) {
  if (ids.length === 0 || typeof sessionStorage === "undefined") return
  const key = "knobs:opencode-motion:session:v1"
  const session = JSON.parse(sessionStorage.getItem(key) ?? "{}")
  const expanded: string[] = Array.isArray(session.expanded) ? session.expanded : []

  if (ids.every((id) => expanded.includes(id))) return
  sessionStorage.setItem(key, JSON.stringify({ ...session, expanded: [...new Set([...expanded, ...ids])] }))
}
