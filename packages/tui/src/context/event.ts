import type { LutungCodeEvent } from "@lutungcode/client"
import { useClient } from "./client"

type EventMetadata = {
  directory: string | undefined
}
type LutungCodeEventMap = { [Type in LutungCodeEvent["type"]]: Extract<LutungCodeEvent, { type: Type }> }

export function useEvent() {
  const client = useClient()

  function subscribe(handler: (event: LutungCodeEvent, metadata: EventMetadata) => void) {
    return client.event.listen(({ details }) => {
      if (details.type === "server.connected") return
      handler(details, { directory: details.location?.directory })
    })
  }

  function on<T extends LutungCodeEvent["type"]>(
    type: T,
    handler: (event: LutungCodeEventMap[T], metadata: EventMetadata) => void,
  ) {
    return client.event.on(type, (event) => {
      handler(event, { directory: event.location?.directory })
    })
  }

  return {
    subscribe,
    on,
  }
}
