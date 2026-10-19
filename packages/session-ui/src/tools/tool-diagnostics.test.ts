import { describe, expect, test } from "bun:test"
import { fileToolGroupMetadata } from "./tool-diagnostics"

const file = {
  file: "probe.go",
  patch: "",
  additions: 1,
  deletions: 0,
  status: "modified" as const,
}

describe("file tool group metadata", () => {
  test("keeps diagnostics each part carries for its file", () => {
    const metadata = fileToolGroupMetadata(
      [file],
      [
        {
          "probe.go": [
            { range: { start: { line: 5, character: 13 } }, message: "cannot use string as int", severity: 1 },
          ],
        },
        undefined,
      ],
    )

    expect(metadata.files).toEqual([file])
    // `getDiagnostics` in the patch renderer looks diagnostics up by the file's own path, so the
    // grouped record has to keep the key the part was written with.
    expect(metadata.diagnostics?.["probe.go"]?.[0]).toMatchObject({ message: "cannot use string as int" })
    expect(metadata.diagnostics).toEqual({
      "probe.go": [{ range: { start: { line: 5, character: 13 } }, message: "cannot use string as int", severity: 1 }],
    })
  })

  test("stacks diagnostics from several parts that touch the same file", () => {
    const first = { "probe.go": [{ message: "first", severity: 1 }] }
    const second = { "probe.go": [{ message: "second", severity: 1 }], "other.ts": [{ message: "other", severity: 1 }] }

    expect(fileToolGroupMetadata([], [first, second]).diagnostics).toEqual({
      "probe.go": [
        { message: "first", severity: 1 },
        { message: "second", severity: 1 },
      ],
      "other.ts": [{ message: "other", severity: 1 }],
    })
  })

  test("reports no diagnostics when no part carries any", () => {
    expect(fileToolGroupMetadata([file], [undefined, undefined]).diagnostics).toEqual({})
  })
})
