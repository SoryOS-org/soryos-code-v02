import { type ComponentProps, Show, splitProps } from "solid-js"
import { Icon } from "@opencode/ui/icon"
import { Spinner } from "@opencode/ui/spinner"

export interface StatusLinkProps extends Omit<ComponentProps<"button">, "type"> {
  tone: "danger" | "accent"
  busy?: boolean
}

/** A status that opens its follow-up, such as an error or a sign-in, in the slot a row's switch would use. */
export function StatusLink(props: StatusLinkProps) {
  const [local, rest] = splitProps(props, ["tone", "busy", "disabled", "children"])

  return (
    <button
      {...rest}
      type="button"
      data-component="status-link"
      data-tone={local.tone}
      aria-busy={local.busy || undefined}
      disabled={local.disabled || local.busy}
    >
      {local.children}
      <Show when={local.busy} fallback={<Icon name="chevron-right" size="small" />}>
        <Spinner />
      </Show>
    </button>
  )
}
