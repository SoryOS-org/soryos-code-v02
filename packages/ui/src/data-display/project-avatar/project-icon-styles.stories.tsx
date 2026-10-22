import { createEffect, For, on, onCleanup, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { PROJECT_ICON_STYLES, projectIconStyle, type ProjectIconStyle } from "./procedural"
import "./project-avatar.css"

const docs = `### Overview
Candidate procedural styles for the generated default project avatar, next to James's mesh. Each style resolves its
params once from a key, like the mesh, and draws on a 2D canvas clipped to the avatar's rounded tile.

### Gallery
- One row per style; columns are fictional project names at 32, 20 and 16 px, then a large preview.
- Click any icon to show it large at the top. Hover an icon to play its animation (off with reduced motion).

### Controls
- \`style\`: one style or all. \`name\`: a seed of your own, shown in the first column.
- \`size\`: the large preview. \`surface\`: dark or light ground. \`animate\`: hover animation.
`

const NAMES = ["atlas", "quill", "harbor-api", "nimbus", "copperleaf", "tern", "lumen-ui", "basalt"]

const SIZES = [32, 20, 16]

const SURFACES = {
  dark: {
    background: "#141414",
    text: "#ededed",
    muted: "#8a8a8a",
    hairline: "rgba(255, 255, 255, 0.08)",
    ring: "rgba(255, 255, 255, 0.85)",
  },
  light: {
    background: "#fafafa",
    text: "#171717",
    muted: "#737373",
    hairline: "rgba(0, 0, 0, 0.08)",
    ring: "rgba(0, 0, 0, 0.8)",
  },
}

type Args = { style: string; name: string; size: number; surface: string; animate: boolean }

export default {
  title: "UI/ProjectIconStyles",
  id: "ui-project-icon-styles",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component: docs,
      },
    },
  },
  argTypes: {
    style: {
      control: "select",
      options: ["all", ...PROJECT_ICON_STYLES.map((style) => style.id)],
    },
    size: {
      control: { type: "range", min: 64, max: 256, step: 8 },
    },
    surface: {
      control: "select",
      options: ["dark", "light"],
    },
  },
  args: {
    style: "all",
    name: "",
    size: 128,
    surface: "dark",
    animate: true,
  },
}

export const Gallery = {
  render: (args: Args) => <GalleryView args={args} />,
}

export const ContactSheet = {
  render: (args: Args) => <ContactSheetView args={args} />,
}

function GalleryView(props: { args: Args }) {
  const surface = () => (props.args.surface === "light" ? SURFACES.light : SURFACES.dark)
  const names = () => (props.args.name ? [props.args.name, ...NAMES.slice(1)] : NAMES)

  const styles = () =>
    props.args.style === "all"
      ? PROJECT_ICON_STYLES
      : PROJECT_ICON_STYLES.filter((style) => style.id === props.args.style)

  const [selected, setSelected] = createStore({ style: "mesh", name: NAMES[0] })
  const spotlight = () => projectIconStyle(selected.style)

  createEffect(
    on(
      () => props.args.name,
      (name) => name && setSelected("name", name),
      { defer: true },
    ),
  )
  createEffect(
    on(
      () => props.args.style,
      (style) => style !== "all" && setSelected("style", style),
      { defer: true },
    ),
  )

  const isSelected = (style: ProjectIconStyle, name: string) => selected.style === style.id && selected.name === name

  // Fixed columns: a label, one 32 + 20 + 16 px trio per name, then the large preview.
  const row = () => ({
    display: "grid",
    "grid-template-columns": `200px repeat(${names().length}, 80px) 48px`,
    "column-gap": "24px",
    "align-items": "center",
  })

  const tile = (style: ProjectIconStyle, name: string, size: number) => (
    <Tile
      style={style}
      name={name}
      size={size}
      animate={props.args.animate}
      selected={isSelected(style, name)}
      ring={surface().ring}
      onSelect={() => setSelected({ style: style.id, name })}
    />
  )

  return (
    <div
      style={{
        "min-height": "100%",
        padding: "0 24px 24px",
        background: surface().background,
        color: surface().text,
        "font-size": "13px",
        "line-height": "16px",
      }}
    >
      <div style={{ position: "sticky", top: "0", "z-index": 1, background: surface().background }}>
        <div style={{ display: "flex", gap: "24px", "align-items": "center", padding: "24px 0" }}>
          <Icon style={spotlight()} name={selected.name} size={props.args.size} animate={props.args.animate} />
          <div style={{ display: "flex", "flex-direction": "column", gap: "4px" }}>
            <div style={{ "font-weight": 500 }}>
              {spotlight().name} · {selected.name}
            </div>
            <div style={{ color: surface().muted, "font-size": "12px" }}>{spotlight().label}</div>
            <div style={{ display: "flex", gap: "12px", "align-items": "flex-end", "padding-top": "12px" }}>
              <For each={SIZES}>
                {(size) => <Icon style={spotlight()} name={selected.name} size={size} animate={props.args.animate} />}
              </For>
            </div>
          </div>
        </div>
        <div style={{ ...row(), color: surface().muted, "font-size": "12px", "padding-bottom": "8px" }}>
          <div />
          <For each={names()}>
            {(name) => (
              <div style={{ "white-space": "nowrap", overflow: "hidden", "text-overflow": "ellipsis" }}>{name}</div>
            )}
          </For>
        </div>
      </div>
      <For each={styles()}>
        {(style) => (
          <div style={{ ...row(), padding: "12px 0", "border-top": `1px solid ${surface().hairline}` }}>
            <button
              type="button"
              onClick={() => setSelected("style", style.id)}
              style={{ ...reset, padding: "0", "text-align": "start" }}
            >
              <div style={{ "font-weight": 500 }}>{style.name}</div>
              <div style={{ color: surface().muted, "font-size": "12px", "padding-top": "2px" }}>{style.label}</div>
            </button>
            <For each={names()}>
              {(name) => (
                <div style={{ display: "flex", gap: "6px", "align-items": "flex-end" }}>
                  <For each={SIZES}>{(size) => tile(style, name, size)}</For>
                </div>
              )}
            </For>
            {tile(style, selected.name, 48)}
          </div>
        )}
      </For>
    </div>
  )
}

// Every style × six names at 32, 20 and 16 px, in two columns: the proof still for review.
function ContactSheetView(props: { args: Args }) {
  const surface = () => (props.args.surface === "light" ? SURFACES.light : SURFACES.dark)
  const names = NAMES.slice(0, 6)
  const half = Math.ceil(PROJECT_ICON_STYLES.length / 2)
  const columns = [PROJECT_ICON_STYLES.slice(0, half), PROJECT_ICON_STYLES.slice(half)]

  return (
    <div
      data-slot="contact-sheet"
      style={{
        display: "inline-flex",
        gap: "48px",
        padding: "24px",
        background: surface().background,
        color: surface().text,
        "font-size": "12px",
        "line-height": "16px",
      }}
    >
      <For each={columns}>
        {(column) => (
          <div style={{ display: "flex", "flex-direction": "column", gap: "10px" }}>
            <For each={column}>
              {(style) => (
                <div style={{ display: "flex", "align-items": "flex-end", gap: "20px" }}>
                  <div style={{ width: "88px", "align-self": "center", "white-space": "nowrap" }}>{style.name}</div>
                  <For each={SIZES}>
                    {(size) => (
                      <div style={{ display: "flex", gap: "8px", "align-items": "flex-end" }}>
                        <For each={names}>
                          {(name) => <Icon style={style} name={name} size={size} animate={props.args.animate} />}
                        </For>
                      </div>
                    )}
                  </For>
                </div>
              )}
            </For>
          </div>
        )}
      </For>
    </div>
  )
}

const reset = {
  background: "none",
  border: "0",
  margin: "0",
  color: "inherit",
  font: "inherit",
  cursor: "pointer",
}

function Tile(props: {
  style: ProjectIconStyle
  name: string
  size: number
  animate: boolean
  selected: boolean
  ring: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      title={`${props.style.name} · ${props.name}`}
      onClick={props.onSelect}
      style={{
        ...reset,
        padding: "0",
        display: "block",
        "border-radius": `${Math.max(4, props.size * 0.22 + 2)}px`,
        outline: props.selected ? `1.5px solid ${props.ring}` : "none",
        "outline-offset": "2px",
      }}
    >
      <Icon style={props.style} name={props.name} size={props.size} animate={props.animate} />
    </button>
  )
}

// The avatar's own markup and styles, so each style is clipped exactly as ProjectAvatar clips the mesh.
function Icon(props: { style: ProjectIconStyle; name: string; size: number; animate: boolean }) {
  let canvas!: HTMLCanvasElement

  onMount(() => {
    const icon = () => props.style.generate(props.name)
    let frame = 0
    let time = 0
    let hovering = false
    let last = 0

    const paint = (seconds: number) => {
      const px = Math.max(1, Math.round(props.size * (window.devicePixelRatio || 1)))

      if (canvas.width !== px) canvas.width = canvas.height = px
      const ctx = canvas.getContext("2d")

      if (!ctx) return

      if (seconds > 0) return props.style.draw(ctx, px, icon(), seconds)
      ctx.clearRect(0, 0, px, px)
      ctx.drawImage(still(props.style, props.name, px), 0, 0)
    }

    // As in the app's avatars: play while hovered, then ease back to the static frame and stop.
    const tick = (now: number) => {
      const seconds = Math.min((now - last) / 1000, 0.1)
      last = now
      time = hovering ? time + seconds : time * Math.pow(0.002, seconds)

      if (!hovering && time < 0.01) {
        time = 0
        frame = 0
        paint(0)

        return
      }

      paint(time)
      frame = requestAnimationFrame(tick)
    }

    const enter = () => {
      if (!props.animate || !props.style.animated || matchMedia("(prefers-reduced-motion: reduce)").matches) return
      hovering = true

      if (frame) return
      last = performance.now()
      frame = requestAnimationFrame(tick)
    }

    const leave = () => (hovering = false)
    const target = canvas.closest("button") ?? canvas

    target.addEventListener("pointerenter", enter)
    target.addEventListener("pointerleave", leave)
    onCleanup(() => {
      cancelAnimationFrame(frame)
      target.removeEventListener("pointerenter", enter)
      target.removeEventListener("pointerleave", leave)
    })
    createEffect(() => {
      props.style
      props.name
      props.size

      if (!frame) paint(0)
    })
  })

  return (
    <div data-component="project-avatar-v2" style={{ width: `${props.size}px`, height: `${props.size}px` }}>
      <div data-slot="project-avatar-surface" data-generated="">
        <canvas ref={canvas} data-slot="project-avatar-generated" aria-hidden="true" />
      </div>
    </div>
  )
}

const stills = new Map<string, HTMLCanvasElement>()

function still(style: ProjectIconStyle, name: string, px: number) {
  const key = `${style.id}|${name}|${px}`
  const cached = stills.get(key)

  if (cached) return cached

  if (stills.size > 2048) stills.clear()
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = px
  const ctx = canvas.getContext("2d")

  if (ctx) style.draw(ctx, px, style.generate(name), 0)
  stills.set(key, canvas)

  return canvas
}
