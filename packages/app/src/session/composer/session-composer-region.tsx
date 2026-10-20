import { Show, type JSX } from "solid-js"
import { SessionPermissionDock } from "@/session/requests/session-permission-dock"
import { SessionQuestionDock } from "@/session/requests/session-question-dock"
import { SessionWebSearchDock } from "@/session/requests/session-websearch-dock"
import type { SessionComposerRegionController } from "./session-composer-region-controller"

type SessionComposerRegionState = Pick<
  SessionComposerRegionController["state"],
  "questionRequest" | "websearch" | "permissionRequest" | "permissionResponding" | "decide" | "blocked"
>

export type SessionComposerRegionViewController = Pick<
  SessionComposerRegionController,
  "centered" | "onResponseSubmit" | "setDockRef" | "child" | "showComposer"
> & { state: SessionComposerRegionState }

export function SessionComposerRegion(props: {
  controller: SessionComposerRegionViewController
  composer: JSX.Element
  subagent: JSX.Element
}) {
  const controller = props.controller

  return (
    <div
      ref={controller.setDockRef}
      data-component="session-composer-dock"
      class="w-full shrink-0 flex flex-col justify-center items-center pb-3 pointer-events-none"
    >
      {/* Only the docks and composer take the pointer; the gaps beside them belong to the timeline underneath. */}
      <div
        classList={{
          "w-full px-3 *:pointer-events-auto": true,
          "md:max-w-session md:mx-auto": controller.centered(),
        }}
      >
        <Show when={controller.state.websearch.request()}>
          <SessionWebSearchDock model={controller.state.websearch} onSubmit={controller.onResponseSubmit} />
        </Show>
        <Show when={controller.state.questionRequest()} keyed>
          {(request) => (
            <div>
              <SessionQuestionDock request={request} onSubmit={controller.onResponseSubmit} />
            </div>
          )}
        </Show>

        <Show when={controller.state.permissionRequest()} keyed>
          {(request) => (
            <div>
              <SessionPermissionDock
                request={request}
                responding={controller.state.permissionResponding()}
                onDecide={(response) => {
                  controller.onResponseSubmit()
                  controller.state.decide(response)
                }}
              />
            </div>
          )}
        </Show>

        <Show when={controller.showComposer()}>
          <div
            classList={{
              "relative z-[70]": true,
            }}
          >
            <Show when={controller.child()} fallback={<Show when={!controller.state.blocked()}>{props.composer}</Show>}>
              {props.subagent}
            </Show>
          </div>
        </Show>
      </div>
    </div>
  )
}
