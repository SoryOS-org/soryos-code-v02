import { DiffChanges } from "@opencode/ui/diff-changes"
import { Icon } from "@opencode/ui/icon"
import { Menu } from "@opencode/ui/menu"
import { containsDirectory, getFilename } from "@opencode/util/path"
import { createMemo, Show } from "solid-js"
import { useExtension, type Project, type MountedSession } from "../sdk"
import { workspaceDirectories } from "./paths"
import { SessionServerPanel } from "./server-panel"
import { SessionWorkspaceMenu } from "./workspace-menu"

export type DetailsPanelProps = {
  session: MountedSession
  project: Project
  shown?: boolean
  mobile?: boolean
  /** Renders the details as items of an enclosing `Menu`, as the desktop header does. */
  menu?: boolean
  diffs?: readonly { additions: number; deletions: number }[]
  moveDismissed: boolean
  onMoveDismiss: () => void
  /** Absent while the review extension is disabled, which also leaves `diffs` undefined. */
  onReview?: () => void
}

export default function SessionDetailsPanel(props: DetailsPanelProps) {
  const ctx = useExtension()
  const locale = ctx.locale
  const data = () => props.session.server.data

  const placement = createMemo(() =>
    props.mobile ? "top-end" : locale.direction() === "rtl" ? "right-start" : "left-start",
  )

  const location = () => {
    if (props.session.local) return ctx.t("workspace.local")

    const workspace = workspaceDirectories(props.project).find((item) =>
      containsDirectory(item, props.session.directory),
    )

    return getFilename(workspace ?? props.session.directory)
  }

  // A subagent shares its parent's workspace, so it shows where it runs but cannot move on its own.
  const subagent = () => !!data().session.get(props.session.id)?.parentID

  const workspace = () => (
    <>
      <Icon name={props.session.local ? "monitor" : "outline-worktree"} class="shrink-0 text-v2-icon-icon-muted" />
      <span dir="auto" class="session-summary-label">
        {location()}
      </span>
    </>
  )

  const changes = () => (
    <Show when={props.diffs} fallback={<span class="truncate text-v2-text-text-muted">{ctx.t("loadingChanges")}</span>}>
      {(diffs) => (
        <Show
          when={diffs().length > 0}
          fallback={<span class="truncate text-v2-text-text-muted">{ctx.t("noChanges")}</span>}
        >
          <span class="min-w-0 truncate">{ctx.plural("ui.sessionTurn.diffs.changed", diffs().length)}</span>
          <span class="shrink-0 text-v2-text-text-muted">·</span>
          <DiffChanges appearance="standard" changes={[...diffs()]} />
        </Show>
      )}
    </Show>
  )

  if (props.menu)
    return (
      <>
        <Show
          when={!subagent()}
          fallback={
            <Menu.Item disabled>
              <Icon name={props.session.local ? "monitor" : "outline-worktree"} />
              <span dir="auto" class="min-w-0 truncate">
                {location()}
              </span>
            </Menu.Item>
          }
        >
          <SessionWorkspaceMenu sub session={props.session} project={props.project} directory={props.session.directory}>
            <Icon name={props.session.local ? "monitor" : "outline-worktree"} />
            <span dir="auto" class="min-w-0 truncate">
              {location()}
            </span>
          </SessionWorkspaceMenu>
        </Show>
        <Show when={props.onReview}>
          <Menu.Item onSelect={() => props.onReview?.()}>
            <Icon name="review" />
            <span class="flex min-w-0 items-center gap-2">{changes()}</span>
          </Menu.Item>
        </Show>
        <Show when={!subagent()}>
          <Menu.Item onSelect={() => ctx.layout.command("session.export")}>
            <Icon name="outline-share" />
            {ctx.t("common.export")}…
          </Menu.Item>
          <Menu.Item data-variant="critical" onSelect={() => ctx.layout.command("session.delete")}>
            <Icon name="outline-trash" />
            {ctx.t("common.delete")}…
          </Menu.Item>
        </Show>
        <Menu.Separator />
        <Menu.Group>
          {/* With several servers, the extensions name the session's server. */}
          <Show when={ctx.servers.list().length > 1}>
            <Menu.GroupLabel>{props.session.server.name}</Menu.GroupLabel>
          </Show>
          <SessionServerPanel
            session={props.session}
            directory={props.session.directory}
            shown={props.shown !== false}
            sub
          />
        </Menu.Group>
      </>
    )

  return (
    <div data-component="session-summary-panel" data-mobile={props.mobile || undefined}>
      <div class="session-summary-card">
        <Show when={!subagent()} fallback={<div class="session-summary-row">{workspace()}</div>}>
          <SessionWorkspaceMenu
            session={props.session}
            project={props.project}
            directory={props.session.directory}
            placement={placement()}
            class="session-summary-row"
          >
            {workspace()}
            <Icon name="fill-triangle-down" class="session-summary-menu-indicator shrink-0 text-v2-icon-icon-muted" />
          </SessionWorkspaceMenu>
        </Show>
        <Show when={props.onReview}>
          <button type="button" class="session-summary-row" onClick={() => props.onReview?.()}>
            <Icon name="review" class="shrink-0 text-v2-icon-icon-muted" />
            <span class="session-summary-label flex items-center gap-2">{changes()}</span>
          </button>
        </Show>
        <Show when={!subagent() && props.session.local && props.diffs?.length && !props.moveDismissed}>
          <div class="session-summary-move">
            <SessionWorkspaceMenu
              session={props.session}
              project={props.project}
              directory={props.session.directory}
              placement={placement()}
              class="session-summary-row"
            >
              <Icon name="outline-worktree" class="shrink-0 text-v2-icon-icon-muted" />
              <span class="min-w-0 truncate">{ctx.t("move.title")}</span>
            </SessionWorkspaceMenu>
            <button
              type="button"
              class="session-summary-dismiss"
              aria-label={ctx.t("common.dismiss")}
              onClick={props.onMoveDismiss}
            >
              <Icon name="xmark-small" />
            </button>
          </div>
        </Show>
        <SessionServerPanel
          session={props.session}
          directory={props.session.directory}
          shown={props.shown !== false}
          mobile={props.mobile}
        />
      </div>
    </div>
  )
}
