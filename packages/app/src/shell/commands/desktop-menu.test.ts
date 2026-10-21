import { expect, test } from "bun:test"
import path from "node:path"
import { DESKTOP_MENU } from "./desktop-menu"

const root = path.resolve(import.meta.dir, "../../../..")

const sources = (dir: string) =>
  Array.from(new Bun.Glob("**/*.{ts,tsx}").scanSync(path.join(root, dir)), (file) => file.replaceAll("\\", "/")).filter(
    (file) => !file.includes(".test.") && !file.startsWith("runtime/i18n/"),
  )

const ids = async (dir: string, file: string) =>
  Array.from((await Bun.file(path.join(root, dir, file)).text()).matchAll(/\bid: "([\w.-]+)"/g), (match) => match[1])

test("every desktop menu command is registered by the app or a GUI extension", async () => {
  const app = await Promise.all(sources("app/src").map((file) => ids("app/src", file)))

  // GUI extensions publish commands as `${extension}.${id}`.
  const extensions = await Promise.all(
    sources("gui-extensions/src").map(async (file) =>
      (await ids("gui-extensions/src", file)).map((id) => `${file.split("/")[0]}.${id}`),
    ),
  )

  const registered = new Set([...app.flat(), ...extensions.flat()])

  const commands = DESKTOP_MENU.flatMap((menu) => menu.items ?? []).flatMap((entry) =>
    entry.type === "item" && entry.command ? [entry.command] : [],
  )

  expect(commands.filter((command) => !registered.has(command))).toEqual([])
})
