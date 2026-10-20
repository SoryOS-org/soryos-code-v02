import { describe, expect, test } from "bun:test"
import { fileToolGroupMetadata } from "./tool-diagnostics"

const file = {
  file: "probe.go",
  patch: "",
  additions: 1,
  deletions: 0,
  status: "modified" as const,
}

const diagnostic = (message: string) => ({ range: { start: { line: 5, character: 13 } }, message, severity: 1 })

describe("file tool group metadata", () => {
  test("keeps diagnostics each part carries for its file", () => {
    const metadata = fileToolGroupMetadata(
      [{ toolID: "tool-1", value: file }],
      [{ id: "tool-1", diagnostics: { "probe.go": [diagnostic("cannot use string as int")] } }, { id: "tool-2" }],
    )

    expect(metadata.files).toEqual([file])
    // `getDiagnostics` in the patch renderer looks diagnostics up by the file's own path.
    expect(metadata.diagnostics).toEqual({ "probe.go": [diagnostic("cannot use string as int")] })
  })

  test("re-keys diagnostics the part stored under its absolute input path", () => {
    // A completed `edit` reports a project-relative file, while the part's diagnostics are keyed by the
    // absolute path it ran against, so the entry is the only place the two meet.
    const edited = { ...file, file: "src/probe.go" }

    const metadata = fileToolGroupMetadata(
      [{ toolID: "tool-1", value: edited }],
      [{ id: "tool-1", diagnostics: { "/project/src/probe.go": [diagnostic("cannot use string as int")] } }],
    )

    expect(metadata.diagnostics).toEqual({ "src/probe.go": [diagnostic("cannot use string as int")] })
  })

  test("lets the newest part replace an older part's diagnostics for the same file", () => {
    // Diagnostics are a snapshot after each tool ran, and the renderer keeps only the first three, so an
    // old failure must not survive an edit that fixed it.
    const metadata = fileToolGroupMetadata(
      [],
      [
        { id: "tool-1", diagnostics: { "probe.go": [diagnostic("first")] } },
        { id: "tool-2", diagnostics: { "probe.go": [diagnostic("second")], "other.ts": [diagnostic("other")] } },
      ],
    )

    expect(metadata.diagnostics).toEqual({ "probe.go": [diagnostic("second")], "other.ts": [diagnostic("other")] })
  })

  test("reports no diagnostics when no part carries any", () => {
    expect(
      fileToolGroupMetadata([{ toolID: "tool-1", value: file }], [{ id: "tool-1" }, { id: "tool-2" }]).diagnostics,
    ).toEqual({})
  })
})
