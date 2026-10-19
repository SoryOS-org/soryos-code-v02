import { Component, createMemo } from "solid-js"
import { useNavigate, useParams } from "@solidjs/router"
import { useData } from "@/runtime/server/current"
import { useComposerState } from "@/composer/persistence"
import { useDialog } from "@opencode/ui/context/dialog"
import { Dialog, DialogBody, DialogHeader, DialogTitle } from "@opencode/ui/dialog"
import { List } from "@opencode/ui/list"
import { showToast } from "@/shell/notifications/toast"
import { useLanguage } from "@/runtime/i18n/language"
import { useServerSDK } from "@/runtime/server/client"
import { base64Encode } from "@opencode/util/encode"
import { extractPromptContext, extractPromptFromMessage } from "@/composer/prompt"
import { useWorkspaceLocation } from "@/workspaces/location"
import { useServer } from "@/runtime/server/current"
import { sessionHref } from "@/shell/routes/session"

interface ForkableMessage {
  id: string
  text: string
  time?: string
}

interface ForkOption extends ForkableMessage {
  full?: boolean
}

const FULL_SESSION_ID = "__full_session__"

function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { timeStyle: "short" })
}

export const DialogFork: Component = () => {
  const params = useParams()
  const navigate = useNavigate()
  const data = useData()
  const serverSDK = useServerSDK()
  const location = useWorkspaceLocation()
  const prompt = useComposerState()
  const dialog = useDialog()
  const language = useLanguage()
  const server = useServer()
  let pending = false

  const messages = createMemo((): ForkableMessage[] => {
    const sessionID = params.id

    if (!sessionID) return []

    const msgs = data.session.message.list(sessionID)
    const result: ForkableMessage[] = []

    for (const message of msgs) {
      if (message.type !== "user" || !message.text) continue

      result.push({
        id: message.id,
        text: message.text.replace(/\n/g, " ").slice(0, 200),
        time: formatTime(new Date(message.time.created)),
      })
    }

    return result.reverse()
  })

  const items = createMemo((): ForkOption[] => [
    {
      id: FULL_SESSION_ID,
      text: language.t("dialog.fork.fullSession"),
      full: true,
    },
    ...messages(),
  ])

  const handleSelect = (item: ForkOption | undefined) => {
    if (!item || pending) return

    const sessionID = params.id

    if (!sessionID) return

    const before = item.full ? undefined : item.id
    const message = before ? data.session.message.get(sessionID, before) : undefined

    if (before && message?.type !== "user") return

    const snapshot =
      message?.type === "user"
        ? {
            restored: extractPromptFromMessage(message, {
              directory: location().directory,
              attachmentName: language.t("common.attachment"),
            }),
            context: extractPromptContext(message, { directory: location().directory }),
            dir: base64Encode(location().directory),
          }
        : undefined

    pending = true

    serverSDK.api.session
      .fork({ sessionID, before })
      .then((forked) => {
        data.session.remember(forked)
        dialog.close()

        if (snapshot) {
          const target = prompt.capture({ dir: snapshot.dir, id: forked.id })

          target.set(snapshot.restored)
          target.context.replace([...snapshot.context.comments, ...snapshot.context.files])
        }

        navigate(sessionHref(server.key, forked.id))
      })
      .catch((cause: unknown) => {
        const message = cause instanceof Error ? cause.message : String(cause)
        showToast({ title: language.t("common.requestFailed"), description: message })
      })
      .finally(() => {
        pending = false
      })
  }

  return (
    <Dialog>
      <DialogHeader>
        <DialogTitle>{language.t("command.session.fork")}</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <List
          class="flex-1 px-3 min-h-0 [&_[data-slot=list-scroll]]:flex-1 [&_[data-slot=list-scroll]]:min-h-0"
          search={{ placeholder: language.t("common.search.placeholder"), autofocus: true }}
          emptyMessage={language.t("dialog.fork.empty")}
          key={(x) => x.id}
          items={items}
          filterKeys={["text"]}
          onSelect={handleSelect}
        >
          {(item) => (
            <div class="w-full flex items-center gap-2">
              <span class="truncate flex-1 min-w-0 text-left font-normal">{item.text}</span>
              {item.time && <span class="text-text-weak shrink-0 font-normal">{item.time}</span>}
            </div>
          )}
        </List>
      </DialogBody>
    </Dialog>
  )
}
