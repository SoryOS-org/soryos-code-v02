import type { EventApi } from "@lutungcode/client/promise/api"

export interface EventDomain extends Pick<EventApi, "subscribe"> {}
