import { fileURLToPath } from "node:url"
import { openPath, openUrl } from "@opencode/util/open"

export async function openLink(input: string) {
  const url = URL.canParse(input) ? new URL(input) : undefined
  if (url?.protocol === "file:") return openPath(fileURLToPath(url))
  return openUrl(input)
}
