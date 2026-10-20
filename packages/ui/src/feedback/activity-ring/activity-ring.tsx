import { splitProps, type ComponentProps } from "solid-js"
import "./activity-ring.css"

// An open arc in constant rotation, matching the iOS drawer's busy ring.
export function ActivityRing(props: ComponentProps<"svg">) {
  const [local, rest] = splitProps(props, ["class", "classList", "width", "height"])

  return (
    <svg
      {...rest}
      class={local.class}
      classList={local.classList}
      width={local.width ?? 14}
      height={local.height ?? 14}
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      data-component="activity-ring"
      aria-hidden={rest["aria-hidden"] ?? "true"}
    >
      <circle cx="7" cy="7" r="6.1" pathLength="100" stroke-dasharray="72 28" />
    </svg>
  )
}
