import { comparablePath, containsDirectory } from "@opencode/util/path"
import type { OpenCodeClient } from "@opencode/client/promise"

const types = new Map([
  ["png", "image/png"],
  ["jpeg", "image/jpeg"],
  ["jpg", "image/jpeg"],
  ["gif", "image/gif"],
  ["webp", "image/webp"],
  ["svg", "image/svg+xml"],
  ["avif", "image/avif"],
  ["bmp", "image/bmp"],
  ["ico", "image/x-icon"],
])

export async function readLocalImage(
  api: Pick<OpenCodeClient, "file">,
  directory: string,
  path: string,
  signal: AbortSignal,
): Promise<Blob | undefined> {
  const drive = /^[a-z]:\//i.test(path)

  if (/^[\\/]{2}/.test(path) || (!drive && /^[a-z][a-z\d+.-]*:/i.test(path))) return
  const type = types.get(path.match(/\.([^./]+)$/)?.[1]?.toLowerCase() ?? "")

  if (!type) return
  const absolute = drive || path.startsWith("/")

  // Any other location would be booted and persisted as a project, so images outside the session are not read.
  if (absolute && !containsDirectory(directory, path)) return
  const bytes = await api.file.read(
    {
      path: absolute ? comparablePath(path).slice(comparablePath(directory).length).replace(/^\//, "") : path,
      location: { directory },
    },
    { signal },
  )

  return new Blob([new Uint8Array(bytes)], { type })
}
