import { Plugin } from "@lutungcode/plugin/tui"
import { createMermaidCodeBlockRenderer } from "./markdown.js"
import { resolveLutungCodeDiagramPalette } from "./palette.js"

export default Plugin.define({
  id: "lutungcode.merman",
  setup(context) {
    context.markdown.registerCodeBlockRenderer(
      "mermaid",
      createMermaidCodeBlockRenderer(context.renderer, () => ({
        colors: resolveLutungCodeDiagramPalette(context.theme, context.themeMode),
      })),
    )
  },
})
