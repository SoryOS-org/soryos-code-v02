import { createSimpleContext } from "./helper"
import type { SessionEpilogue } from "../util/presentation"

export const { use: useEpilogue, provider: EpilogueProvider } = createSimpleContext({
  name: "Epilogue",
  init: (props: { set(value?: SessionEpilogue): void }) => props.set,
})
