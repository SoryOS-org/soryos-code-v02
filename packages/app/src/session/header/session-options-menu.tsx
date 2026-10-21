import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { Menu } from "@opencode/ui/menu"
import { useLanguage } from "@/runtime/i18n/language"

export function SessionOptionsMenu(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onRename: () => void
  onExport?: () => void
  onDelete: () => void
  onCloseAutoFocus?: (event: Event) => void
  disabled?: boolean
}) {
  const language = useLanguage()

  return (
    <Menu gutter={6} placement="bottom-start" open={props.open} onOpenChange={props.onOpenChange}>
      <Menu.Trigger
        as={IconButton}
        icon={<Icon name="outline-dots" />}
        variant="ghost-muted"
        size="large"
        class="shrink-0"
        aria-label={language.t("common.moreOptions")}
        aria-expanded={props.open}
        disabled={props.disabled}
      />
      <Menu.Portal>
        <Menu.Content
          class="session-options-menu w-max"
          style={{ "min-width": "0" }}
          onCloseAutoFocus={props.onCloseAutoFocus}
        >
          <Menu.Item onSelect={props.onRename}>{language.t("common.rename")}</Menu.Item>
          <Menu.Item disabled={!props.onExport} onSelect={props.onExport}>
            {language.t("common.export")}…
          </Menu.Item>
          <Menu.Separator />
          <Menu.Item onSelect={props.onDelete}>{language.t("common.delete")}…</Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu>
  )
}
