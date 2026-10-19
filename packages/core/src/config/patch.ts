export * as ConfigPatch from "./patch.js"

import { applyEdits, modify, parse, type ParseError } from "jsonc-parser"
import type { ConfigProvider } from "@opencode/schema/config/provider"

export function apply(
  text: string,
  patch: {
    readonly shell?: string | null
    readonly providers?: Readonly<Record<string, ConfigProvider.Info>>
  },
) {
  const errors: ParseError[] = []
  const document: unknown = parse(text, errors, { allowTrailingComma: true })
  if (errors.length || document === null || typeof document !== "object" || Array.isArray(document))
    throw new Error("Cannot update malformed config: expected a JSONC object")

  const edits = [
    ...(patch.shell === undefined || (patch.shell === null && !Object.hasOwn(document, "shell"))
      ? []
      : [{ path: ["shell"], value: patch.shell ?? undefined }]),
    ...Object.entries(patch.providers ?? {}).map(([id, provider]) => ({
      path: ["providers", id],
      value: provider,
    })),
  ]

  // Apply each edit to the latest text so offsets account for earlier edits.
  return edits.reduce(
    (current, edit) =>
      applyEdits(
        current,
        modify(current, edit.path, edit.value, {
          formattingOptions: { tabSize: 2, insertSpaces: true },
        }),
      ),
    text,
  )
}
