import { Show } from "solid-js"
import { render } from "solid-js/web"
import { createStore } from "solid-js/store"
import { BasicTool } from "../src/components/basic-tool"
import { CurrentSessionProviders } from "../src/storybook/current-session-story"
import { storyDocument } from "../src/storybook/current-session-scenarios"
import { ToolDisplay } from "../src/tools/tool-renderer"

export { getCachedMarkdown } from "../src/components/markdown-cache"

export function mountGenericTool(
  scenario: "complete" | "input" | "output" | "empty" | "hidden" | "running" = "complete",
) {
  const host = document.createElement("section")
  host.dataset.testid = "generic-tool-fixture"
  host.style.cssText = "max-width: 720px; padding: 24px"
  document.body.appendChild(host)
  render(() => {
    const [state, setState] = createStore({ completed: scenario !== "running" })
    const input =
      scenario === "output" || scenario === "empty"
        ? {}
        : scenario === "input"
          ? { value: null, flags: [false, 0] }
          : {
              description: "Send a message to a session",
              sessionID: "ses_synthetic",
              message:
                "First line of the synthetic message\nSecond line stays separate\nFinal input line beyond the compact header",
              retries: 2,
              enabled: false,
              options: { recipients: ["review", "test"], context: { priority: "normal" } },
            }

    return (
      <CurrentSessionProviders document={storyDocument([])}>
        <Show when={scenario === "running"}>
          <button onClick={() => setState("completed", true)}>Finish tool</button>
        </Show>
        <ToolDisplay
          id="generic_disclosure"
          tool="messageSession"
          status={state.completed ? "completed" : "running"}
          hideDetails={scenario === "hidden"}
          input={input}
          output={
            scenario === "input"
              ? ""
              : scenario === "empty" || !state.completed
                ? undefined
                : "TOOL-OUTPUT-MARKER: message delivered\nSecond output line\n<b>literal output</b> **plain text**"
          }
          metadata={{}}
        />
      </CurrentSessionProviders>
    )
  }, host)
}

export function mountBasicTool() {
  const host = document.createElement("div")
  host.dataset.testid = "basic-tool-fixture"
  document.body.appendChild(host)
  render(() => {
    const [state, setState] = createStore({ label: "Initial title", titles: 0, details: 0 })

    function Title() {
      // Count construction, including JSX created by unused trigger getter reads.
      setState("titles", (value) => value + 1)

      return <span title={state.label}>{state.label}</span>
    }

    function Details() {
      setState("details", (value) => value + 1)

      return <p>Tool details</p>
    }

    return (
      <>
        <output data-testid="trigger-constructions">{state.titles}</output>
        <output data-testid="detail-mounts">{state.details}</output>
        <input
          aria-label="Trigger label"
          value={state.label}
          onInput={(event) => setState("label", event.currentTarget.value)}
        />
        <BasicTool icon="glasses" hasContent trigger={<Title />}>
          <Details />
        </BasicTool>
        <BasicTool icon="glasses" trigger={{ title: state.label, subtitle: "Tool subtitle", args: ["path=src"] }} />
        <BasicTool icon="glasses" trigger={(open) => <span>Function: {open() ? "open" : "closed"}</span>}>
          <p>Function details</p>
        </BasicTool>
      </>
    )
  }, host)
}
