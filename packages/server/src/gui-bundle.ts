import { createRequire } from "node:module"

/** Compiles browser JSX with Solid's DOM transform before bundling a configured GUI entry. */
export async function buildGuiBundle(entrypoint: string) {
  const require = createRequire(import.meta.url)
  const { transformAsync } = require("@babel/core")

  return Bun.build({
    entrypoints: [entrypoint],
    target: "browser",
    format: "cjs",
    external: ["@opencode/plugin/gui", "solid-js", "solid-js/store", "solid-js/web"],
    plugins: [
      {
        name: "solid-gui",
        setup(build) {
          build.onLoad({ filter: /\.[jt]sx$/ }, async (args) => {
            const transformed = await transformAsync(await Bun.file(args.path).text(), {
              filename: args.path,
              babelrc: false,
              configFile: false,
              presets: [
                [require.resolve("babel-preset-solid"), { generate: "dom", hydratable: false }],
                [require.resolve("@babel/preset-typescript"), { allExtensions: true, isTSX: true }],
              ],
            })

            if (!transformed?.code) throw new Error(`Solid compilation produced no code: ${args.path}`)

            return { contents: transformed.code, loader: "js" }
          })
        },
      },
    ],
  })
}
