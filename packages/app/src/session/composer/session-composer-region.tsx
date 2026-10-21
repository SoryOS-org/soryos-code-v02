import { createMemo, Show, type JSX } from "solid-js"
import { SessionPermissionDock } from "@/session/requests/session-permission-dock"
import { SessionQuestionDock } from "@/session/requests/session-question-dock"
import { SessionWebSearchDock } from "@/session/requests/session-websearch-dock"
import type { SessionComposerRegionController } from "./session-composer-region-controller"
import { ComposerMorph } from "./spring-height"

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
  above?: JSX.Element
  composer: JSX.Element
  subagent: JSX.Element
}) {
  const controller = props.controller
  const face = createMemo(() => {
    const websearch = controller.state.websearch.request()
    const question = controller.state.questionRequest()
    const permission = controller.state.permissionRequest()
    const composer = controller.showComposer() && !controller.child() && !controller.state.blocked()
    const parts = [
      websearch && `w:${websearch.id}`,
      question && `q:${question.id}`,
      permission && `p:${permission.id}`,
      composer && "composer",
    ].filter(Boolean)
    return { key: parts.join("|") || "none", single: parts.length === 1, websearch, question, permission, composer }
  })

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
        <div class="relative z-[70] flex flex-col">
          {props.above}
          <ComposerMorph face={face()}>
            {(current) => (
              <div class="flex flex-col gap-2" classList={{ "mb-2": controller.child() && current().key !== "none" }}>
                <Show when={current().websearch}>
                  <SessionWebSearchDock model={controller.state.websearch} onSubmit={controller.onResponseSubmit} />
                </Show>
                <Show when={current().question} keyed>
                  {(request) => (
                    <div>
                      <SessionQuestionDock request={request} onSubmit={controller.onResponseSubmit} />
                    </div>
                  )}
                </Show>

                <Show when={current().permission} keyed>
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

                <Show when={current().composer}>
                  <div
                    classList={{
                      "relative z-[70]": true,
                    }}
                  >
                    {props.composer}
                  </div>
                </Show>
              </div>
            )}
          </ComposerMorph>
          <Show when={controller.showComposer() && controller.child()}>{props.subagent}</Show>
        </div>
      </div>
    </div>
  )
}
