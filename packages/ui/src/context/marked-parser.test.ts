import { expect, test } from "bun:test"
import { createMarkdownParser } from "./marked-parser"

const parser = createMarkdownParser((code, language) => `<pre data-language="${language}">${code}</pre>`)

test("renders links with application attributes", async () => {
  expect(await parser.parse("[OpenCode](https://opencode.ai)")).toBe(
    '<p><a href="https://opencode.ai" class="external-link" target="_blank" rel="noopener noreferrer">OpenCode</a></p>\n',
  )
})

test("keeps in-document links in the current document", async () => {
  expect(await parser.parse("[Install](#install)")).toBe(
    '<p><a href="#install" class="external-link">Install</a></p>\n',
  )
})

test("adds unique ids to headings", async () => {
  expect(await parser.parse("# Install\n\n## Install\n\n## API & Usage\n\n## Install")).toBe(
    '<h1 id="install">Install</h1>\n<h2 id="install-1">Install</h2>\n<h2 id="api-usage">API &amp; Usage</h2>\n<h2 id="install-2">Install</h2>\n',
  )
})

test("renders inline and block math", async () => {
  expect(await parser.parse("\\(x^2\\)")).toContain('<span class="katex">')
  expect(await parser.parse("$$\nx^2\n$$\n")).toContain('<span class="katex-display">')
})

test("uses the configured code highlighter", async () => {
  expect(await parser.parse("```ts\nconst value = 1\n```\n")).toBe('<pre data-language="ts">const value = 1</pre>\n')
})
