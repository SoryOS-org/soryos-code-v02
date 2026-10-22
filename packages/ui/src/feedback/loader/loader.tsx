import { type ComponentProps } from "solid-js"
import { Spinner } from "../../components/spinner"
import "./loader.css"

export function Loader(props: ComponentProps<"svg">) {
  return (
    <Spinner
      {...props}
      width={props.width ?? 16}
      height={props.height ?? 16}
      data-component="loader-v2"
      aria-hidden={props["aria-hidden"] ?? "true"}
    />
  )
}
