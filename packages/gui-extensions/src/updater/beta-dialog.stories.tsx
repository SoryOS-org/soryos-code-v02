import { Button } from "@opencode/ui/button"
import { useDialog } from "@opencode/ui/context/dialog"
import { Option } from "effect"
import { onMount } from "solid-js"
import { DialogBetaNotes } from "./beta-dialog"
import { sliceBetaNotes, type EmbeddedNotes } from "./beta-notes"

const commits: [type: "feat" | "fix", scope: string, summary: string, pr?: number][] = [
  ["fix", "app", "open select dialogs at the top"],
  ["feat", "app", "merge projects across servers in the location dialog"],
  ["feat", "app", "open the right panel on a new tab", 57094],
  ["fix", "app", "open activity panel above the capsule"],
  ["fix", "desktop", "disable animated wheel scrolling on linux"],
  ["feat", "desktop", "pick models from a model dialog with favorites and recent", 55838],
  ["fix", "session-ui", "keep table frame visible over header", 57050],
  ["feat", "session-ui", "style markdown tables like generated UI tables", 57002],
  ["fix", "app", "fit connect dialog steps to their content under a fixed top edge", 57006],
  ["feat", "app", "add an experimental session inbox to the sidebar", 55647],
  ["fix", "core", "debounce compatibility skill reloads", 56260],
  ["fix", "session-ui", "restore blue user bubbles with grey pending steers", 57001],
  ["feat", "ui", "open images from their place in the message", 56896],
  ["fix", "desktop", "install each Windows channel into its own directory", 56904],
  ["feat", "app", "show MCP errors from a failed status link"],
  ["fix", "ui", "open dialogs with their input focused"],
  ["fix", "app", "default agent notifications to off"],
  ["feat", "app", "add Focus and Pro interface picker to preferences", 56898],
]

const sha = (n: number) => n.toString(16).padStart(4, "0").padEnd(40, "a")

// A build's embedded history: one commit per entry, newest first, with a chore between the notes.
const embedded = (picked: typeof commits): EmbeddedNotes => ({
  sha: sha(1000),
  commits: [sha(1000), ...picked.flatMap((_, i) => [sha(i * 2 + 1), sha(i * 2 + 2)]), sha(999)].map((value) =>
    value.slice(0, 12),
  ),
  notes: picked.map(([type, scope, summary, pr], i) => ({
    type,
    scope,
    summary,
    pr,
    sha: sha(i * 2 + 1).slice(0, 12),
  })),
})

function Fixture(props: { picked: typeof commits; previous?: string; previousCommit?: string }) {
  const dialog = useDialog()
  const notes = Option.getOrThrow(sliceBetaNotes(embedded(props.picked), props.previousCommit ?? sha(999)))

  const open = () =>
    dialog.show(() => (
      <DialogBetaNotes
        notes={notes}
        previous={props.previous ?? "0.0.0-beta-21180"}
        dialog={{ close: () => dialog.close() }}
        open={(href) => window.open(href, "_blank")}
      />
    ))

  onMount(open)

  return <Button onClick={open}>Open What's new in beta</Button>
}

export default {
  title: "Extensions/Updater/What's new in beta",
  id: "extensions-updater-beta-notes",
  parameters: {
    docs: {
      description: {
        component:
          "The dialog a beta desktop build shows after an update: the features and fixes since the build the user last saw.",
      },
    },
  },
}

/** A typical update: a few features and fixes. */
export const Typical = { render: () => <Fixture picked={commits.slice(0, 8)} /> }

/** More than ten changes: the rest are linked on GitHub. */
export const Many = {
  render: () => <Fixture picked={commits} previous="0.0.0-beta-21012" />,
}

/** Only fixes, so the New section is not shown. */
export const FixesOnly = {
  render: () => <Fixture picked={commits.filter(([type]) => type === "fix").slice(0, 4)} />,
}

/** The previous build is older than the embedded history: the newest changes stand in, and the rest are linked. */
export const PreviousBuildUnknown = {
  render: () => <Fixture picked={commits} previous="0.0.0-beta-20500" previousCommit={sha(5000)} />,
}
