import { expect, sourceURL, story } from "../../storybook/playwright/story"

const modules = {
  fixture: sourceURL(new URL("./extension-host.fixture.tsx", import.meta.url)),
  debug: sourceURL(new URL("../../gui-extensions/src/debug/index.ts", import.meta.url)),
  renderer: sourceURL(new URL("../../gui-extensions/src/debug/renderer.tsx", import.meta.url)),
}

story.beforeEach(async ({ mount }) => {
  await mount("ui-line-comment--editor")
})

// Reloads and updates are fresh mounts over the same storage, so a mount seeded with what the last one wrote is one.
story("the debug bar stays open across a remount until its close button hides it", async ({ page }) => {
  const result = await page.evaluate(async (modules) => {
    const { mountExtensions, until } = await import(modules.fixture)
    const debug = await import(modules.debug)
    const definition = { ...debug.default, renderer: () => import(modules.renderer) }
    const bar = (host: { container: HTMLElement }) => host.container.querySelector("aside")

    const close = (host: { container: HTMLElement }) =>
      host.container.querySelector<HTMLButtonElement>('button[aria-label="Hide debug bar"]')

    const first = mountExtensions({
      definitions: [definition],
      stored: { "extension.debug.bar": { visible: true, motion: false } },
    })

    first.release()
    await until(() => bar(first) !== null)

    const opened = bar(first) !== null

    close(first)?.click()
    await until(() => bar(first) === null)
    await until(() => first.saved()["extension.debug.bar"]?.visible === false)

    const saved = first.saved()
    first.unmount()

    const second = mountExtensions({ definitions: [definition], stored: saved })
    second.release()
    await until(() => second.ready())

    await new Promise((resolve) => setTimeout(resolve, 100))
    const reopened = bar(second) !== null
    second.unmount()

    return { opened, saved: saved["extension.debug.bar"], reopened }
  }, modules)

  expect(result).toEqual({ opened: true, saved: { visible: false, motion: false }, reopened: false })
})
