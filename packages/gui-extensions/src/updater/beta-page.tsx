import { For, Show } from "solid-js"
import { Option } from "effect"
import { Button } from "@opencode/ui/button"
import { useExtension } from "../sdk"
import { Meta, Visual } from "./beta-dialog"
import { allBetaNotes, betaHistory, decodeEmbeddedNotes, type BetaNote, type EmbeddedNotes } from "./beta-notes"
import type definition from "./index"

/** Settings > What's new in beta: every change this build carries, in the host's settings list markup. */
export default function BetaNotesPage() {
  const ctx = useExtension<typeof definition>()

  return (
    <BetaNotesView
      embedded={Option.getOrUndefined(decodeEmbeddedNotes(import.meta.env.OPENCODE_BETA_NOTES))}
      open={(href) => ctx.system.openExternal(href)}
    />
  )
}

export function BetaNotesView(props: { embedded: EmbeddedNotes | undefined; open: (href: string) => void }) {
  const ctx = useExtension<typeof definition>()

  return (
    <Show when={props.embedded}>
      {(embedded) => {
        const notes = allBetaNotes(embedded())

        return (
          <>
            <div class="settings-tab-header">
              <div class="settings-tab-header-row">
                <div class="flex min-w-0 flex-col gap-1">
                  <h2 class="settings-tab-title">{ctx.t("beta.title")}</h2>
                  <span class="text-11-regular text-v2-text-text-muted">{ctx.t("beta.page.description")}</span>
                </div>
                <div class="settings-tab-header-actions">
                  <Button
                    type="button"
                    variant="ghost-muted"
                    class="whitespace-nowrap"
                    onClick={() => props.open(betaHistory(embedded()))}
                  >
                    {ctx.t("beta.github")}
                  </Button>
                </div>
              </div>
            </div>
            <div class="settings-tab-body settings-tab-body--sectioned">
              <Notes title={ctx.t("beta.added")} notes={notes.added} open={props.open} />
              <Notes title={ctx.t("beta.fixed")} notes={notes.fixed} open={props.open} />
            </div>
          </>
        )
      }}
    </Show>
  )
}

// A change's visual sits in the row's control slot, inside the list; narrow windows, where the slot wraps under the
// title, leave it to the dialog.
function Notes(props: { title: string; notes: readonly BetaNote[]; open: (href: string) => void }) {
  return (
    <Show when={props.notes.length > 0}>
      <section class="settings-section" aria-label={props.title}>
        <h3 class="settings-section-title">{props.title}</h3>
        <div data-component="settings-list" data-variant="catalog">
          <For each={props.notes}>
            {(note) => (
              <div data-component="settings-row">
                <div data-slot="settings-row-copy">
                  <div data-slot="settings-row-title" class="[overflow-wrap:anywhere]">
                    {note.summary}
                  </div>
                  <Show when={note.author || note.pr}>
                    <div data-slot="settings-row-description">
                      <Meta note={note} open={props.open} class="" />
                    </div>
                  </Show>
                </div>
                <Show when={note.visual}>
                  {(visual) => (
                    <div data-slot="settings-row-control" class="max-sm:hidden">
                      <Visual visual={visual()} label={note.description} />
                    </div>
                  )}
                </Show>
              </div>
            )}
          </For>
        </div>
      </section>
    </Show>
  )
}
