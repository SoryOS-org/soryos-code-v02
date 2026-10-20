import type { EventApi } from "@lutungcode/client/effect/api"

export interface EventDomain extends Pick<EventApi<unknown>, "subscribe"> {}
