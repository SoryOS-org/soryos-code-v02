import { createSimpleContext } from "./helper"

// `notice` is printed after the TUI closes, below any epilogue.
export type Exit = (input?: { readonly reason?: unknown; readonly notice?: string }) => void

export const { use: useExit, provider: ExitProvider } = createSimpleContext({
  name: "Exit",
  init: (input: { exit: Exit }) => input.exit,
})
