import { createMemo } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import type { CommandPaletteEntry } from "@/shell/commands/palette"
import { createSettingsSearchCatalog } from "./search"
import { rankSettings } from "./search-results"
import { useSettingsSurface } from "./surface"

const LIMIT = 5

/** Settings rows for the command palette; selecting one opens Settings at that row. */
export function createSettingsPaletteEntries() {
  const language = useLanguage()
  const surface = useSettingsSurface()
  const catalog = createSettingsSearchCatalog()
  // Servers and projects already have their own palette rows.
  const settings = createMemo(() => catalog().filter((item) => !item.entity))

  return {
    items(query: string): CommandPaletteEntry[] {
      const value = query.trim().toLocaleLowerCase()
      const category = language.t("palette.group.settings")

      return rankSettings(value, settings())
        .slice(0, LIMIT)
        .map((item) => ({
          id: `setting:${item.id}`,
          type: "setting",
          title: item.title,
          description: item.page === item.title ? undefined : item.page,
          category,
          strong: value.length >= 3 && item.title.toLocaleLowerCase().startsWith(value),
          setting: item,
        }))
    },
    select(entry: CommandPaletteEntry) {
      if (entry.setting) surface.search.open(entry.setting.view, entry.setting.id)
    },
  }
}
