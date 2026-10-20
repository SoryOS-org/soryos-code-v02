import { createMemo } from "solid-js"
import { Command } from "@opencode/gui-extensions/sdk"
import { useCommand, type CommandSource } from "@/shell/commands/command"
import { useSettings } from "@/settings/model"
import { migrateKeybinds } from "@/settings/keybinds/migration"
import { useExtensionHost } from "./host"

/** Publishes extension commands as `${extension}.${id}` in the host command registry. */
export function ExtensionCommands() {
  const host = useExtensionHost()
  const command = useCommand()
  migrateKeybinds(useSettings())
  // Extensions activate in whatever order their entries load; list them in definition order, then registration order.
  const rank = createMemo(() => new Map(host.definitions().map((definition, index) => [definition.id, index])))
  const order = (extension: string) => rank().get(extension) ?? rank().size
  command.register("extensions", () =>
    host
      .items(Command)
      .toSorted((a, b) => order(a.extension) - order(b.extension))
      .map((item) => ({
        id: `${item.extension}.${item.value.id}`,
        title: item.value.title,
        description: item.value.description,
        keywords: item.value.keywords,
        category: item.value.group,
        section: item.value.section,
        keybind: item.value.bind,
        slash: item.value.slash?.name,
        slashArguments: item.value.slash?.arguments,
        slashAfter: item.value.slash?.after,
        suggested: item.value.suggested,
        featured: item.value.featured,
        disabled: item.value.enabled === false,
        hidden: item.value.hidden,
        editable: item.value.editable,
        when: item.value.scope ? scopedTo(item.value.scope) : undefined,
        onSelect: (_source?: CommandSource, input?: string) => item.value.run(input),
      })),
  )

  return null
}

const scopedTo = (scope: string) => (event: KeyboardEvent) =>
  event.target instanceof Element && !!event.target.closest(scope)

/** Focus inside an extension command's scope belongs to that extension, which binds its own shortcuts there. */
export function useExtensionScoped() {
  const host = useExtensionHost()

  return (target: EventTarget | null) =>
    target instanceof Element &&
    host.items(Command).some((item) => !!item.value.scope && !!target.closest(item.value.scope))
}
