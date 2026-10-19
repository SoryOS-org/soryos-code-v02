import type { FileDiffInfo } from "@opencode/client/promise"

export type DiagnosticsByFile = Readonly<Record<string, readonly unknown[]>> | undefined

// File-grouped tools render through the patch renderer, which reads a single metadata record.
// Each part's own diagnostics stay keyed by path, so several parts touching one file stack up.
export function fileToolGroupMetadata(files: readonly FileDiffInfo[], diagnostics: readonly DiagnosticsByFile[]) {
  return { files, diagnostics: mergeDiagnostics(diagnostics) }
}

function mergeDiagnostics(values: readonly DiagnosticsByFile[]) {
  const entries = values.flatMap((value) => Object.entries(value ?? {}))

  return entries.reduce<Record<string, unknown[]>>((result, [path, diagnostics]) => {
    result[path] = [...(result[path] ?? []), ...diagnostics]

    return result
  }, {})
}
