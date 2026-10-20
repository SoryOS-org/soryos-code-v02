import type { ElectronAPI } from "../api-types"

const deepLinkEvent = "lutungcode:deep-link"

export function startDeepLinks(api: ElectronAPI) {
  void api.consumeInitialDeepLinks().then(emitDeepLinks)
  api.onDeepLink(emitDeepLinks)
}

function emitDeepLinks(urls: string[]) {
  if (urls.length === 0) return
  window.__LUTUNGCODE__ ??= {}
  window.__LUTUNGCODE__.deepLinks = [...(window.__LUTUNGCODE__.deepLinks ?? []), ...urls]
  window.dispatchEvent(new CustomEvent(deepLinkEvent, { detail: { urls } }))
}
