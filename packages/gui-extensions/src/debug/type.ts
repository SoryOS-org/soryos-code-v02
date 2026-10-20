const key = "opencode.type.panel"

export const options = {
  smoothing: ["auto", "antialiased"],
  family: ["inter", "system"],
  weight: ["400", "440", "450", "500"],
  tracking: ["0", "-0.04", "-0.1"],
  opsz: ["auto", "none"],
} as const

export type Type = { [K in keyof typeof options]?: (typeof options)[K][number] }

const css = `
:root[data-type-smoothing], :root[data-type-smoothing] * { -webkit-font-smoothing: var(--type-smoothing) !important; }
:root[data-type-weight] body :not(b, strong, h1, h2, h3, h4, h5, h6, th, [class*="font-bold"], [class*="font-semibold"], [class*="font-medium"], [class*="font-["]) { font-weight: var(--type-weight) !important; }
:root[data-type-tracking] body * { letter-spacing: var(--type-tracking) !important; }
:root[data-type-opsz] body * { font-optical-sizing: none !important; }
`

const system = '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif'

// Overrides are global and sit on the root, so no component changes are needed. An unset group leaves the app as shipped.
export function apply(type: Type) {
  const root = document.documentElement

  const set = (name: string, value: string | undefined, css?: string) => {
    if (value === undefined) {
      root.removeAttribute(`data-type-${name}`)
      root.style.removeProperty(`--type-${name}`)

      return
    }

    root.setAttribute(`data-type-${name}`, value)
    root.style.setProperty(`--type-${name}`, css ?? value)
  }


  if (!document.getElementById("type-tuning")) {
    const style = document.createElement("style")
    style.id = "type-tuning"
    style.textContent = css
    document.head.append(style)
  }


  set("smoothing", type.smoothing)
  set("weight", type.weight)
  set("tracking", type.tracking, type.tracking && `${type.tracking}px`)
  set("opsz", type.opsz === "none" ? "none" : undefined)


  for (const name of ["--font-family-sans", "--v2-font-family-sans"]) {
    if (type.family === "system") root.style.setProperty(name, system)
    else root.style.removeProperty(name)
  }
}

export function load(): Type {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "{}")
  } catch {
    return {}
  }
}

export function save(type: Type) {
  try {
    localStorage.setItem(key, JSON.stringify(type))
  } catch {}
}

export function applyStored() {
  apply(load())
}
