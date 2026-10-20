import { isLocationNotFoundError, type LocationGetOutput, type LocationRef } from "@opencode/client"
import { retry } from "@opencode/util/retry"
import { createContext, createMemo, createSignal, onCleanup, useContext, type ParentProps } from "solid-js"
import { useClient } from "./client"
import { useData } from "./data"

const context = createContext<{
  readonly current: LocationGetOutput | undefined
  // The target location as set, available before the server-synced info in `current` arrives.
  readonly ref: LocationRef | undefined
  // Set only when the server reports that this location's folder does not exist.
  readonly missing: LocationRef | undefined
  // The location could not be read for a reason that may resolve on its own.
  readonly error: { readonly location: LocationRef; readonly cause: unknown } | undefined
  set: (location?: LocationRef) => void
}>()

export function LocationProvider(props: ParentProps) {
  const client = useClient()
  const data = useData()
  const [ref, setRef] = createSignal<LocationRef>()
  const [missing, setMissing] = createSignal<LocationRef>()
  const [error, setError] = createSignal<{ readonly location: LocationRef; readonly cause: unknown }>()
  let generation = 0
  const current = createMemo(() => data.location.info(ref()))

  function sync(location?: LocationRef) {
    if (!location) return
    const attempt = ++generation
    const defaultLocation = data.location.default()
    const target =
      location.directory === defaultLocation.directory && location.workspaceID === defaultLocation.workspaceID
        ? undefined
        : location
    setError(undefined)
    setMissing(undefined)
    // A failed catalog read does not prove the folder is gone. Only the server's typed
    // LocationNotFoundError does, and retrying it cannot succeed until the folder changes.
    void retry(() => data.location.sync(target), {
      retryIf: (cause) => generation === attempt && !isLocationNotFoundError(cause),
    }).catch((cause) => {
      const current = ref()
      if (
        generation !== attempt ||
        current?.directory !== location.directory ||
        current.workspaceID !== location.workspaceID
      )
        return
      if (isLocationNotFoundError(cause)) {
        setMissing(location)
        return
      }
      setError({ location, cause })
    })
  }

  function set(location?: LocationRef) {
    setRef(location)
    if (client.connection.status() === "connected") sync(location)
  }

  onCleanup(client.event.on("server.connected", () => sync(ref())))

  return (
    <context.Provider
      value={{
        get current() {
          return current()
        },
        get ref() {
          return ref()
        },
        get missing() {
          return missing()
        },
        get error() {
          return error()
        },
        set,
      }}
    >
      {props.children}
    </context.Provider>
  )
}

export function useLocation() {
  const value = useContext(context)
  if (!value) throw new Error("Location context must be used within a LocationProvider")
  return value
}
