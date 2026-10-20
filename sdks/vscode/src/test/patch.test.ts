import * as assert from "node:assert"
import { fileChanges, parseHunks, revertChanges } from "../review/patch"

suite("review patch", () => {
  test("reconstructs hunk regions byte-exact across CRLF and no-newline ends", () => {
    const patch = [
      "Index: f",
      "===================================================================",
      "--- f",
      "+++ f",
      "@@ -1,4 +1,4 @@",
      " a\r",
      "-b\r",
      "-x\r",
      " c\r",
      "+y\r",
      "+c\r",
    ].join("\n")
    const [hunk] = parseHunks(patch)
    assert.strictEqual(hunk?.before, "a\r\nb\r\nx\r\nc\r\n")
    assert.strictEqual(hunk?.after, "a\r\nc\r\ny\r\nc\r\n")
    assert.strictEqual(hunk?.newStart, 1)

    const deletion = parseHunks("@@ -1,3 +0,0 @@\n-a\n-b\n-c\n")[0]
    assert.strictEqual(deletion?.before, "a\nb\nc\n")
    assert.strictEqual(deletion?.after, "")
  })

  test("indexes changes in metadata.files then hunk order", () => {
    const files = [
      {
        file: "one.txt",
        status: "modified" as const,
        patch: "@@ -1,2 +1,2 @@\n a\n-b\n+B\n@@ -10,2 +10,2 @@\n j\n-k\n+K\n",
      },
      { file: "two.txt", status: "added" as const, patch: "@@ -0,0 +1,1 @@\n+created\n" },
    ]
    const changes = fileChanges(files)
    assert.deepStrictEqual(
      changes.map((change) => [change.index, change.file.file]),
      [
        [0, "one.txt"],
        [1, "one.txt"],
        [2, "two.txt"],
      ],
    )
  })

  test("rewinds selected changes while keeping the rest applied", () => {
    const file = { file: "code.txt", status: "modified" as const, patch: "@@ -1,2 +1,2 @@\n a\n-b\n+B\n" }
    const [change] = fileChanges([file])
    assert.ok(change)
    const reverted = revertChanges("a\nB\n", [{ entry: file, changes: [change] }])
    assert.strictEqual(reverted?.text, "a\nb\n")
    assert.strictEqual(revertChanges("drifted\n", [{ entry: file, changes: [change] }]), undefined)
  })

  test("removes a discarded creation and refuses to destroy user content", () => {
    const file = { file: "new.txt", status: "added" as const, patch: "@@ -0,0 +1,1 @@\n+hello\n" }
    const [change] = fileChanges([file])
    assert.ok(change)
    assert.deepStrictEqual(revertChanges("hello\n", [{ entry: file, changes: [change] }]), {
      text: "",
      remove: true,
    })
    assert.strictEqual(revertChanges("hello\nmore\n", [{ entry: file, changes: [change] }])?.remove, false)
    assert.strictEqual(revertChanges("user wrote this\n", [{ entry: file, changes: [change] }]), undefined)
  })
})
