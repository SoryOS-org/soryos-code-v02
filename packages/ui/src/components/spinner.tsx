import { type ComponentProps } from "solid-js"

export function Spinner(props: ComponentProps<"svg"> & { "data-component"?: string }) {
  return (
    <svg
      {...props}
      viewBox="0 0 16 16"
      data-component={props["data-component"] ?? "spinner"}
      data-slot="spinner-grid"
      classList={{
        ...props.classList,
        [props.class ?? ""]: !!props.class,
      }}
      fill="currentColor"
    >
      <rect data-reduced-motion x={7} y={7} width={2} height={2} />
    </svg>
  )
}
