import { type ComponentProps } from "solid-js"
import { Spinner } from "@opencode/ui/spinner"
import "./session-progress-indicator-v2.css"

// The app's one activity spinner, so the activity chip, subagent rows, task cards and loading tabs follow its choice.
export function SessionProgressIndicatorV2(props: ComponentProps<"svg">) {
  return (
    <Spinner
      {...props}
      width={props.width ?? 16}
      height={props.height ?? 16}
      data-component="session-progress-indicator-v2"
      aria-hidden={props["aria-hidden"] ?? "true"}
    />
  )
}
