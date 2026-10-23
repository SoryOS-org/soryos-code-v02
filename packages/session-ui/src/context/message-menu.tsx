import { createContext, useContext, type ParentProps } from "solid-js"

const context = createContext<() => boolean>(() => false)

/** Experiment: a ⋯ menu per message in a trailing gutter replaces the hover info line, and turns sit further apart. */
export function MessageMenuProvider(props: ParentProps<{ enabled: boolean }>) {
  return <context.Provider value={() => props.enabled}>{props.children}</context.Provider>
}

export function useMessageMenu() {
  return useContext(context)
}
