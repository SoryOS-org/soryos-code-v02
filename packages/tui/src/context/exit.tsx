import { createSimpleContext } from "./helper"

// `updatedVersion` adds the update restart instructions to the epilogue.
export type Exit = (input?: { readonly reason?: unknown; readonly updatedVersion?: string }) => void

export const { use: useExit, provider: ExitProvider } = createSimpleContext({
  name: "Exit",
  init: (input: { exit: Exit }) => input.exit,
})
