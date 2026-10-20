import { createMemo, For } from "solid-js"
import { createStore } from "solid-js/store"
import type { SessionMessageUser } from "@opencode/client/promise"
import type { SessionUserActions } from "../actions"
import { CurrentUserMessageDisplay } from "./message-content"
import { CurrentSessionProviders } from "../storybook/current-session-story"
import { CURRENT_SESSION_ID, STORY_MODEL, STORY_TIME } from "../storybook/current-session-fixtures"

export default {
  title: "OpenCode/Conversation/Prompt message",
  id: "current-prompt-message",
  parameters: { layout: "fullscreen" },
}

export const Pending = {
  render: () => {
    const statuses = ["delivered", "starting", "steering", "stranded", "queued"] as const

    const [state, setState] = createStore<{ status: (typeof statuses)[number]; voice: boolean; text: boolean }>({
      status: "steering",
      voice: false,
      text: true,
    })

    const message = createMemo<SessionMessageUser>(() => ({
      id: "msg_pending_prompt_story",
      type: "user",
      text: state.text ? "Keep the prompt styling consistent with the rest of the timeline." : "",
      time: { created: STORY_TIME },
      files: state.text
        ? []
        : [{ name: "notes.json", mime: "application/json", data: "e30=", source: { type: "inline" } }],
    }))

    const document = createMemo(() => ({
      sessionID: CURRENT_SESSION_ID,
      messages: [message()],
      status: { type: "idle" as const },
      diffs: [],
    }))

    const actions = {
      pending: {
        status: () => (state.status === "delivered" ? undefined : state.status),
        queue: async () => {
          setState("status", "queued")
        },
        remove: async () => {
          setState("status", "delivered")
        },
      },
    } satisfies SessionUserActions

    return (
      <section class="mx-auto flex w-full max-w-[840px] flex-col gap-8 p-6">
        <div class="flex flex-wrap items-center gap-4">
          <label>
            Delivery state{" "}
            <select
              aria-label="Delivery state"
              value={state.status}
              onChange={(event) => {
                const status = statuses.find((status) => status === event.currentTarget.value)

                if (status) setState("status", status)
              }}
            >
              <For each={statuses}>
                {(status) => <option value={status}>{status[0].toUpperCase() + status.slice(1)}</option>}
              </For>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={state.voice}
              onChange={(event) => setState("voice", event.currentTarget.checked)}
            />{" "}
            Voice message
          </label>
          <label>
            <input
              type="checkbox"
              checked={state.text}
              onChange={(event) => setState("text", event.currentTarget.checked)}
            />{" "}
            Prompt text
          </label>
        </div>
        <CurrentSessionProviders document={document()}>
          <CurrentUserMessageDisplay
            sessionID={CURRENT_SESSION_ID}
            message={message()}
            text={message().text}
            agent="build"
            model={STORY_MODEL}
            voice={state.voice}
            actions={actions}
          />
        </CurrentSessionProviders>
      </section>
    )
  },
}
