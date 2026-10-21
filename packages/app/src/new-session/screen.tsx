import { createPromptProjectController } from "@/new-session/project/selector"
import { useSettingsSurface } from "@/settings/surface"
import { useTabs, type DraftTab } from "@/shell/tabs/tabs"
import { useSettingsServers } from "@/settings/servers/inventory"
import { useSearchParams } from "@solidjs/router"
import { Show, createEffect, createMemo, createResource, on, untrack } from "solid-js"
import { createComposerModel } from "@/composer/model"
import { useComposerCommands } from "@/composer/commands"
import { createNewSessionComposerAdapter } from "./composer-adapter"
import { NewSessionView } from "./view"
import { createNewSessionWorkspaceController } from "./workspace/controller"
import { useNewSessionCommands } from "./commands"
import { createDraftMcpControls } from "./mcp"
import { useCommand } from "@/shell/commands/command"
import { useLanguage } from "@/runtime/i18n/language"
import { createStore } from "solid-js/store"
import { InlineInput } from "@opencode/ui/inline-input"
import { SessionTitleHeader, SessionProjectMenu } from "@/session/session-identity-header"
import { SessionOptionsMenu } from "@/session/header/session-options-menu"
import { SessionHeaderSpacer } from "@/session/header/session-header"
import { ExtensionSlot } from "@/runtime/extension/render"
import { useServer } from "@/runtime/server/current"
import { useWorkspaceLocation } from "@/workspaces/location"
import { createMediaQuery } from "@solid-primitives/media"
import { SessionHeaderActions } from "@/session/header/session-header-actions"

/** The draft-only Session page. Submitting or opening review promotes it into a real Session. */
export default function NewSessionPage(props: { draftId: string }) {
  const [search, setSearch] = useSearchParams<{ draftId?: string; prompt?: string }>()
  const tabs = useTabs()
  const servers = useSettingsServers()
  const settingsSurface = useSettingsSurface()
  const command = useCommand()
  const language = useLanguage()
  const server = useServer()
  const location = useWorkspaceLocation()
  const [header, setHeader] = createStore({ editing: false, title: "", menu: false, rename: false })
  let titleInput: HTMLInputElement | undefined
  const isDesktop = createMediaQuery("(min-width: 768px)")

  const draftTab = createMemo(() =>
    tabs.store.find((tab): tab is DraftTab => tab.type === "draft" && tab.draftID === search.draftId),
  )

  const editTitle = () => {
    setHeader({ editing: true, title: draftTab()?.title ?? language.t("command.session.new") })
    requestAnimationFrame(() => {
      titleInput?.focus()
      titleInput?.select()
    })
  }

  const saveTitle = () => {
    if (!header.editing) return
    const value = header.title.trim()

    if (value) tabs.updateDraft(props.draftId, { title: value })
    setHeader("editing", false)
  }

  const openWorkspaces = () => {
    const draft = draftTab()

    if (servers().length > 1 && draft) {
      settingsSurface.openServer(draft.server, "workspaces")

      return
    }

    settingsSurface.open("workspaces")
  }

  const workspace = createNewSessionWorkspaceController({
    selectedWorktree: () => draftTab()?.worktree,
    selectedBranch: () => draftTab()?.branch,
    setSelectedWorktree: (worktree) => {
      if (search.draftId) tabs.updateDraft(search.draftId, { worktree })
    },
    setSelectedBranch: (branch) => {
      if (search.draftId) tabs.updateDraft(search.draftId, { branch })
    },
    onViewAll: openWorkspaces,
  })

  const mcp = createDraftMcpControls({ draftID: props.draftId, worktree: workspace.selection.value })

  const composer = createNewSessionComposerAdapter({
    draftID: props.draftId,
    worktree: workspace.selection.value,
    branch: workspace.bar.branch,
    submitted: workspace.selection.remember,
    mcp,
  })

  const model = createComposerModel(composer.adapter)
  useComposerCommands({ model: composer.model })

  const project = createPromptProjectController({
    controls: composer.project,
    onDone: model.restoreFocus,
  })

  useNewSessionCommands({
    restoreFocus: model.restoreFocus,
    review: composer.review,
    project: {
      empty: project.empty,
      open: () => project.setOpen(true),
    },
    workspace: {
      enabled: workspace.bar.visible,
      cycle: workspace.selection.cycle,
    },
  })
  // Focus once the draft loads. restoreFocus reads the stored cursor, so tracking it here would reapply
  // a stale cursor a frame after every key-up and yank the caret from a key pressed in that frame.
  createEffect(
    on(composer.ready, (ready) => {
      if (ready) model.restoreFocus()
    }),
  )
  createEffect(() => {
    if (!composer.ready()) return
    untrack(() => {
      const text = search.prompt

      if (!text) return
      composer.adapter.state.set([{ type: "text", content: text, start: 0, end: text.length }], text.length)
      setSearch({ ...search, prompt: undefined })
    })
  })
  const ready = Promise.resolve()

  const [suspendUntilPromptReady] = createResource(
    () => composer.ready.promise ?? ready,
    (promise) => promise.then(() => true),
  )

  return (
    <div class="relative size-full overflow-hidden flex flex-col">
      {suspendUntilPromptReady()}
      <div class="flex-1 min-h-0 flex flex-col gap-2 px-[var(--shell-inline-inset,8px)] pb-[var(--shell-bottom-inset,8px)] pt-[var(--shell-top-inset,8px)]">
        <div class="relative flex-1 min-h-0 flex flex-col">
          <Show when={isDesktop()}>
            <div class="absolute end-3 top-0 z-40 h-12 flex items-center">
              <SessionHeaderActions
                state={{
                  reviewLabel: language.t("command.review.toggle"),
                  reviewKeybind: command.keybindParts("review.toggle"),
                  reviewVisible: true,
                  reviewOpened: false,
                  reviewDisabled: composer.review.opening(),
                  onReviewToggle: () => void composer.review.open(),
                }}
              />
            </div>
          </Show>
          <NewSessionView
            composer={model}
            project={project}
            workspace={workspace}
            header={
              <Show when={isDesktop()}>
                <SessionTitleHeader>
                  <div class="flex h-12 w-full items-center justify-between gap-2">
                    <div class="flex min-w-0 flex-1 items-center gap-0.5">
                      <SessionProjectMenu
                        project={server.ctx.projects.list().find((item) => item.worktree === workspace.project.root())}
                        directory={location().directory}
                        workspace={workspace.selection.workspace()}
                      />
                      <Show
                        when={header.editing}
                        fallback={
                          <h1
                            data-slot="session-title-child"
                            class="w-fit truncate rounded-[6px] px-1 py-1 text-[13px] font-[530] leading-4 tracking-[-0.04px] text-v2-text-text-base hover:bg-v2-overlay-simple-overlay-hover"
                            onClick={editTitle}
                          >
                            {draftTab()?.title ?? language.t("command.session.new")}
                          </h1>
                        }
                      >
                        <InlineInput
                          ref={(element) => (titleInput = element)}
                          dir="auto"
                          value={header.title}
                          class="block field-sizing-content rounded-[6px] px-1 py-1 text-[13px] font-[530] leading-4 tracking-[-0.04px] text-v2-text-text-base"
                          style={{ "--inline-input-shadow": "none", "text-align": "start" }}
                          onInput={(event) => setHeader("title", event.currentTarget.value)}
                          onBlur={saveTitle}
                          onKeyDown={(event) => {
                            event.stopPropagation()

                            if (event.isComposing || event.keyCode === 229) return

                            if (event.key === "Enter") {
                              event.preventDefault()
                              saveTitle()

                              return
                            }

                            if (event.key === "Escape") {
                              event.preventDefault()
                              setHeader("editing", false)
                            }
                          }}
                        />
                      </Show>
                      <SessionOptionsMenu
                        open={header.menu}
                        disabled={composer.review.opening()}
                        onOpenChange={(open) => setHeader("menu", open)}
                        onRename={() => setHeader({ rename: true, menu: false })}
                        onCloseAutoFocus={(event) => {
                          if (!header.rename) return
                          event.preventDefault()
                          setHeader("rename", false)
                          editTitle()
                        }}
                        onDelete={() => {
                          const index = tabs.store.findIndex(
                            (tab) => tab.type === "draft" && tab.draftID === props.draftId,
                          )

                          if (index !== -1) tabs.closeTab(index)
                        }}
                      />
                    </div>
                    <div class="flex shrink-0 items-center gap-2">
                      <ExtensionSlot
                        at="new-session.header"
                        input={{
                          get opening() {
                            return composer.review.opening()
                          },
                          start: (action) => composer.review.open(action),
                        }}
                      />
                      <SessionHeaderSpacer visible />
                    </div>
                  </div>
                </SessionTitleHeader>
              </Show>
            }
          />
        </div>
      </div>
    </div>
  )
}
