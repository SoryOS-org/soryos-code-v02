import katex from "katex"
import { Marked, type MarkedExtension, type Tokens } from "marked"
import markedShiki from "marked-shiki"

export function createMarkdownParser(highlight: (code: string, language: string) => string | Promise<string>) {
  const headingCounts = new WeakMap<object, Map<string, number>>()

  return new Marked(
    {
      renderer: {
        heading({ tokens, depth }) {
          const text = this.parser.parseInline(tokens, this.parser.textRenderer)
          const base = slugifyHeading(text)
          const counts = headingCounts.get(this.parser) ?? new Map<string, number>()
          const count = counts.get(base) ?? 0
          counts.set(base, count + 1)
          headingCounts.set(this.parser, counts)
          const id = count === 0 ? base : `${base}-${count}`
          return `<h${depth} id="${id}">${this.parser.parseInline(tokens)}</h${depth}>\n`
        },
        link({ href, title, tokens }) {
          const titleAttr = title ? ` title="${title}"` : ""
          const externalAttrs = href.trim().startsWith("#") ? "" : ' target="_blank" rel="noopener noreferrer"'
          return `<a href="${href}"${titleAttr} class="external-link"${externalAttrs}>${this.parser.parseInline(tokens)}</a>`
        },
      },
    },
    katexExtension,
    markedShiki({ highlight }),
  )
}

function slugifyHeading(text: string) {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .replace(/\s+/g, "-") || "section"
  )
}

const inlineMathRegex = /^\\\(((?:\\.|[^\\\n])*?)\\\)/
const blockMathRegex = /^\$\$\n([\s\S]+?)\n\$\$(?:\n|$)/

const katexExtension: MarkedExtension = {
  extensions: [
    {
      name: "inlineKatex",
      level: "inline",
      start(src) {
        const index = src.indexOf("\\(")
        if (index === -1) return
        return index
      },
      tokenizer(src) {
        const match = src.match(inlineMathRegex)
        if (!match) return
        return {
          type: "inlineKatex",
          raw: match[0],
          text: match[1].trim(),
          displayMode: false,
        }
      },
      renderer: renderKatexToken,
    },
    {
      name: "blockKatex",
      level: "block",
      tokenizer(src) {
        const match = src.match(blockMathRegex)
        if (!match) return
        return {
          type: "blockKatex",
          raw: match[0],
          text: match[1].trim(),
          displayMode: true,
        }
      },
      renderer: renderKatexToken,
    },
  ],
}

function renderKatexToken(token: Tokens.Generic) {
  return katex.renderToString(typeof token.text === "string" ? token.text : "", {
    displayMode: token.displayMode === true,
    throwOnError: false,
  })
}
