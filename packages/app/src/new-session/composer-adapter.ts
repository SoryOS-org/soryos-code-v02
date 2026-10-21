import { Predicate } from "effect"
import { base64Encode } from "@opencode/util/encode"
import { useCommand, type CommandOption } from "@/shell/commands/command"
import { Session } from "@opencode/schema/session"
import { createEffect, createRoot, startTransition } from "solid-js"
import { useExtensionAttachment } from "@/runtime/extension/host-apis"
import type { SessionMessageUser } from "@opencode/client/promise"
import { createStore } from "solid-js/store"
import type { ComposerSelection, NewSessionComposerAdapter } from "@/composer/adapter"
import type { createComposerSubmission } from "@/composer/submission-state"
import { createTabComposerState, useComposerState } from "@/composer/persistence"
import { createComposerControls, createComposerModelSelection } from "@/composer/selection"
import { createComposerProjectControls } from "./project/controller"
import { useLanguage } from "@/runtime/i18n/language"
import { useLocal } from "@/providers/models/selection"
import { useData, useServer } from "@/runtime/server/current"
import { useServerSDK } from "@/runtime/server/client"
import { useTabs } from "@/shell/tabs/tabs"
import { useWorkspaceLocation } from "@/workspaces/location"
import { createWorktree } from "@/workspaces/create"
import { showToast } from "@/shell/notifications/toast"
import { SessionRouteKey, SessionStateKey } from "@/runtime/server/scope"
import { createSessionMessageHandoff } from "@/session/handoff"
import type { DraftMcpControls } from "./mcp"

export function createNewSessionComposerAdapter(props: {
  draftID: string
  worktree: () => string
  branch: () => string | undefined
  submitted: () => void
  mcp: DraftMcpControls
}) {
  const command = useCommand()
  const attachment = useExtensionAttachment()
  const prompt = useComposerState()
  const state = prompt.capture()
  const local = useLocal()
  const data = useData()
  const server = useServer()
  const serverSDK = useServerSDK()
  const tabs = useTabs()
  const location = useWorkspaceLocation()
  const language = useLanguage()
  const model = createComposerModelSelection({ agent: () => local.agent.current() })
  const controls = createComposerControls({ model })
  const [review, setReview] = createStore({ opening: false })

  const adapter: NewSessionComposerAdapter = {
    kind: "new-session",
    state,
    ready: prompt.ready,
    controls,
    working: () => false,
    submitted: props.submitted,
    start: (selection, submission, message) => start(selection, { submission, message }),
  }

  async function start(
    selection: ComposerSelection | undefined,
    input?: { submission: ReturnType<typeof createComposerSubmission>; message: SessionMessageUser },
    reviewOpened = false,
  ): ReturnType<NewSessionComposerAdapter["start"]> {
    if (input && review.opening) return
    const draftID = props.draftID
    const title = tabs.draft(draftID).title
    const currentDirectory = location().directory

    const projectDirectory = data.location.info({ directory: currentDirectory })?.project.canonical ?? currentDirectory

    const worktree = props.worktree()
    const branch = props.branch()
    const mcp = props.mcp.capture()
    const id = Session.ID.create()

    const pending =
      worktree === "create" && input && selection
        ? tabs.prepareSession(draftID, { server: server.key, sessionId: id }, { message: input.message, selection })
        : undefined

    await pending?.ready

    const sessionDirectory = await resolveSessionDirectory({
      projectDirectory,
      worktree,
      branch,
      data,
      serverSDK,
      language,
    })

    if (!sessionDirectory) {
      await pending?.rollback()

      return
    }

    const rollback = async () => {
      if (!pending) return
      data.project.invalidate()
      await data.project.sync().catch(() => undefined)
      await pending.rollback(sessionDirectory)
    }

    if (!(await props.mcp.prepare(sessionDirectory, mcp))) {
      await rollback()

      if (pending) props.mcp.remember(sessionDirectory, mcp)

      return
    }

    const created = data.session.create({
      id,
      title,
      agent: selection?.agent ?? controls().agents.current,
      model: selection
        ? {
            id: selection.model.modelID,
            providerID: selection.model.providerID,
            variant: selection.variant,
          }
        : undefined,
      location: { directory: sessionDirectory },
    })

    const creation = created.request.then(
      () => ({ ok: true as const }),
      (error) => {
        showToast({
          title: language.t("prompt.toast.sessionCreateFailed.title"),
          description: errorMessage(language, error),
        })

        return { ok: false as const, error }
      },
    )

    if ((pending || !input) && !(await creation).ok) {
      await rollback()

      return
    }

    const afterCreation = async <T>(run: () => Promise<T>) => {
      const result = await creation

      if (!result.ok) throw result.error

      return run()
    }

    const sessionKey = SessionStateKey.from(
      serverSDK.scope,
      SessionRouteKey.fromRoute(base64Encode(sessionDirectory), created.id),
    )

    const target = createTabComposerState(
      tabs,
      { type: "session", server: server.key, sessionId: created.id },
      serverSDK.scope,
      { dir: base64Encode(sessionDirectory), id: created.id },
    )

    // Opening review promotes the draft without submitting or clearing any of its contents.
    if (!input) {
      await target.ready.promise
      target.set(state.current(), state.cursor())
      target.mode.set(state.mode.current())
      target.model.set(state.model.current())
      target.context.replace(state.context.items())
    }

    const cleanupReady = startTransition(() => {
      if (!pending) tabs.updateDraft(draftID, { worktree: undefined, branch: undefined })
      local.session.promote(
        sessionDirectory,
        created.id,
        selection
          ? {
              agent: selection.agent,
              model: selection.model,
              variant: selection.variant ?? null,
              choices: model.remembered(),
            }
          : undefined,
      )

      if (reviewOpened) tabs.setRegion({ type: "session", server: server.key, sessionId: created.id }, "side", true)

      if (!pending) tabs.promoteDraft(draftID, { server: server.key, sessionId: created.id })
      input?.submission.retarget(target, { preserveDraft: !!pending })
    })

    return {
      cleanupReady,
      complete: pending && input ? () => pending.complete(input.submission.target()) : undefined,
      session: {
        id: created.id,
        directory: sessionDirectory,
        handoff: createSessionMessageHandoff(sessionKey, created.id, serverSDK.event),
        api: {
          command: (input) => afterCreation(() => serverSDK.api.session.command(input)),
          shell: (input) => afterCreation(() => serverSDK.api.session.shell(input)),
          switchAgent: (input) => afterCreation(() => serverSDK.api.session.switchAgent(input)),
          switchModel: (input) => afterCreation(() => serverSDK.api.session.switchModel(input)),
          revert: { commit: (input) => afterCreation(() => serverSDK.api.session.revert.commit(input)) },
        },
        data: {
          location: data.location,
          session: {
            setStatus: data.session.setStatus,
            prompt: (input) =>
              data.session.prompt({
                ...input,
                gate: Promise.all([input.gate, afterCreation(async () => undefined)]),
              }),
          },
        },
        current: () => data.session.get(created.id),
        admitted: (messageID) =>
          data.session.input.has(created.id, messageID) || !!data.session.message.get(created.id, messageID),
      },
    }
  }

  return {
    adapter,
    review: {
      opening: () => review.opening,
      async open(action?: string) {
        if (review.opening || !prompt.ready()) return
        setReview("opening", true)
        const selected = model.current()

        const started = await start(
          selected
            ? {
                agent: controls().agents.current,
                model: { providerID: selected.provider.id, modelID: selected.id },
                variant: model.variant.current(),
              }
            : undefined,
          undefined,
          !action,
        ).finally(() => setReview("opening", false))

        if (!started) return

        await started.cleanupReady

        if (!action) return

        // Draft promotion commits before the extension attachment and its commands finish mounting.
        const option = await new Promise<CommandOption>((resolve) =>
          createRoot((dispose) => {
            createEffect(() => {
              const current = attachment.current()

              if (current?.server.id !== server.key || current.id !== started.session.id) return
              const option = command.options.find((item) => item.id === action)

              if (!option || option.disabled) return
              queueMicrotask(dispose)
              resolve(option)
            })
          }),
        )

        await option.onSelect?.()
      },
    },
    project: createComposerProjectControls({ draftId: props.draftID, worktree: props.worktree }),
    model,
    ready: prompt.ready,
  }
}

async function resolveSessionDirectory(input: {
  projectDirectory: string
  worktree: string
  branch?: string
  data: ReturnType<typeof useData>
  serverSDK: ReturnType<typeof useServerSDK>
  language: ReturnType<typeof useLanguage>
}) {
  if (input.worktree === "main") return input.projectDirectory

  if (input.worktree !== "create") return input.worktree

  return createWorktree({
    api: input.serverSDK.api,
    data: input.data,
    directory: input.projectDirectory,
    project: input.data.location.info({ directory: input.projectDirectory })?.project,
    branch: input.branch,
  }).catch((error) => {
    showToast({
      title: input.language.t("prompt.toast.worktreeCreateFailed.title"),
      description: errorMessage(input.language, error),
    })
  })
}

function errorMessage(language: ReturnType<typeof useLanguage>, cause: unknown) {
  if (Predicate.hasProperty(cause, "message") && Predicate.isString(cause.message)) return cause.message

  if (
    Predicate.hasProperty(cause, "data") &&
    Predicate.hasProperty(cause.data, "message") &&
    Predicate.isString(cause.data.message) &&
    cause.data.message
  )
    return cause.data.message

  return language.t("common.requestFailed")
}
