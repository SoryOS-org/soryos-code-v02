import { createStore } from "solid-js/store"

/**
 * Sends a surface's reply once. The first press claims the send before its request goes out, so a double click or
 * a repeated Enter cannot send it twice, and a reply already in the session blocks any more. A failed send can be
 * retried. Returns the send in flight, if this press started one.
 */
export function createReplySender<T>(input: { sent: () => boolean; send: (reply: T) => Promise<void> }) {
  const [state, setState] = createStore({ sending: false, failed: false })

  return {
    sending: () => state.sending,
    failed: () => state.failed,
    send(reply: T) {
      if (state.sending || input.sent()) return
      setState({ sending: true, failed: false })

      return input
        .send(reply)
        .catch(() => setState("failed", true))
        .finally(() => setState("sending", false))
    },
  }
}
