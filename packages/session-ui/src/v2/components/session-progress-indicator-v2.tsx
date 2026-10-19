import { splitProps, type ComponentProps } from "solid-js"
import "./session-progress-indicator-v2.css"

// The frames paint through a CSS mask (see the stylesheet), not an SVG <image>: Chromium restarts an animated image
// shown by <img> or <image> for every instance whenever another one mounts, while CSS images join the running loop.
export function SessionProgressIndicatorV2(props: ComponentProps<"svg">) {
  const [local, rest] = splitProps(props, ["class", "classList", "width", "height"])

  return (
    <svg
      {...rest}
      class={local.class}
      classList={local.classList}
      width={local.width ?? 16}
      height={local.height ?? 16}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      data-component="session-progress-indicator-v2"
      aria-hidden={rest["aria-hidden"] ?? "true"}
    >
      <rect data-reduced-motion x={7} y={7} width={2} height={2} />
    </svg>
  )
}
