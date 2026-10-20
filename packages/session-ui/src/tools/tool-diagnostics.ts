import type { FileDiffInfo } from "@opencode/client/promise"

export type DiagnosticsByFile = Readonly<Record<string, readonly unknown[]>> | undefined

/** A file entry the group renders, tagged with the part that produced it. */
export type GroupedFile = {
  readonly toolID: string
  readonly value: FileDiffInfo
}

/** One part of the group, with the diagnostics its own result carried. */
export type GroupedFilePart = {
  readonly id: string
  readonly diagnostics?: DiagnosticsByFile
}

// File-grouped tools render through the patch renderer, which reads a single metadata record and keys
// diagnostics by the path it renders. Each part carries diagnostics under the path it ran against, so
// they are re-keyed onto the file entries that part produced before they are merged.
export function fileToolGroupMetadata(files: readonly GroupedFile[], parts: readonly GroupedFilePart[]) {
  return { files: files.map((entry) => entry.value), diagnostics: groupDiagnostics(files, parts) }
}

// Diagnostics are a snapshot of a file after that tool ran, so the newest part for a path replaces the
// older ones: stacking would keep errors a later edit already fixed, and the renderer keeps only the
// first three entries it finds.
function groupDiagnostics(files: readonly GroupedFile[], parts: readonly GroupedFilePart[]) {
  // `Object.fromEntries` keeps the last value for a repeated key, which is the replacement rule above.
  return Object.fromEntries(
    parts.flatMap((part) => {
      const own = files.filter((entry) => entry.toolID === part.id)

      return Object.entries(part.diagnostics ?? {}).map(
        ([path, diagnostics]) => [groupedPath(path, own), diagnostics] as const,
      )
    }),
  )
}

// A part keys its diagnostics by the path it ran against, which a plugin usually takes from its input
// and is therefore often absolute. The entry the part produced carries what the tool reported instead,
// which `edit` makes project-relative, so the two only meet through the entry.
function groupedPath(path: string, own: readonly GroupedFile[]) {
  if (own.some((entry) => entry.value.file === path)) return path

  return own.length === 1 ? own[0].value.file : path
}
