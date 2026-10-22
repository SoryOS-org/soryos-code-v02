import { For, Show } from "solid-js"
import { Option } from "effect"
import { Button } from "@opencode/ui/button"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { useExtension, type DialogHandle, type SetupContext } from "../sdk"
import { betaBuild, decodeEmbeddedNotes, sliceBetaNotes, type BetaNote, type BetaNotes } from "./beta-notes"
import type definition from "./index"

/**
 * Shows the features and fixes this beta build carries since the commit of the build the user saw last, and remembers
 * this build as seen. Everything comes from the build itself; only the links reach the network, when clicked.
 */
export function showBetaNotes(
  ctx: SetupContext<typeof definition>,
  input: { readonly previous: string; readonly previousCommit: string | undefined; readonly markSeen: () => void },
) {
  const notes = Option.flatMap(decodeEmbeddedNotes(import.meta.env.OPENCODE_BETA_NOTES), (embedded) =>
    sliceBetaNotes(embedded, input.previousCommit),
  )

  input.markSeen()

  if (Option.isNone(notes)) return

  ctx.dialogs.open(
    (dialog) => (
      <DialogBetaNotes
        notes={notes.value}
        previous={input.previous}
        dialog={dialog}
        open={(href) => ctx.system.openExternal(href)}
      />
    ),
    { replace: true },
  )
}

/** What's new in beta: the listed features and fixes, and a link to the whole range when some are not listed. */
export function DialogBetaNotes(props: {
  notes: BetaNotes
  previous: string
  dialog: DialogHandle
  open: (href: string) => void
}) {
  const ctx = useExtension<typeof definition>()

  return (
    <Dialog fit containerClass="w-[min(calc(100vw-32px),520px)]!">
      <DialogHeader>
        <DialogTitleGroup
          title={ctx.t("beta.title")}
          description={ctx.plural("beta.since", props.notes.total, { build: betaBuild(props.previous) })}
        />
      </DialogHeader>
      <DialogBody class="max-h-[min(calc(100vh-220px),440px)] !overflow-y-auto gap-4 px-4 pb-1">
        <Section title={ctx.t("beta.added")} notes={props.notes.added} open={props.open} />
        <Section title={ctx.t("beta.fixed")} notes={props.notes.fixed} open={props.open} />
      </DialogBody>
      <DialogFooter>
        <Show when={props.notes.more}>
          {(href) => (
            <Button type="button" variant="ghost" class="me-auto" onClick={() => props.open(href())}>
              {ctx.t("beta.viewAll")}
            </Button>
          )}
        </Show>
        <Button type="button" variant="contrast" autofocus onClick={() => props.dialog.close()}>
          {ctx.t("beta.done")}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}

function Section(props: { title: string; notes: readonly BetaNote[]; open: (href: string) => void }) {
  return (
    <Show when={props.notes.length > 0}>
      <section class="flex flex-col gap-1.5">
        <h2 class="m-0 text-12-medium leading-[var(--line-height-compact)] text-v2-text-text-muted">{props.title}</h2>
        <ul class="m-0 flex list-none flex-col gap-1 p-0">
          <For each={props.notes}>
            {(note) => (
              <li class="flex min-w-0 items-start gap-2 text-13-regular leading-[var(--line-height-base)] text-v2-text-text-base">
                <span aria-hidden="true" class="mt-[9px] size-1 shrink-0 rounded-full bg-v2-icon-icon-muted" />
                <span class="min-w-0 flex-1 [overflow-wrap:anywhere]">
                  {note.summary}
                  <Show when={note.scope}>
                    {(scope) => <span class="ms-1.5 text-12-regular text-v2-text-text-faint">{scope()}</span>}
                  </Show>
                  <Show when={note.pr}>
                    {(pr) => (
                      <a
                        href={pr().url}
                        class="ms-1.5 rounded-[4px] text-12-regular text-v2-text-text-muted underline-offset-2 hover:text-v2-text-text-base hover:underline focus-visible:underline focus-visible:outline-none"
                        onClick={(event) => {
                          event.preventDefault()
                          props.open(pr().url)
                        }}
                      >
                        #{pr().number}
                      </a>
                    )}
                  </Show>
                </span>
              </li>
            )}
          </For>
        </ul>
      </section>
    </Show>
  )
}
