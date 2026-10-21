import type { Page } from "@playwright/test"
import { expect, story } from "../../storybook/playwright/story"

const paths = {
  Escape: (page) => page.keyboard.press("Escape"),
  "a backdrop click": (page) => page.mouse.click(8, 8),
  "the close button": (page) => page.getByRole("button", { name: "Close" }).click(),
} satisfies Record<string, (page: Page) => Promise<void>>

for (const [path, close] of Object.entries(paths)) {
  story(`takes the page's clicks as soon as the image preview closes with ${path}`, async ({ mount, page }) => {
    await mount("components-image-preview--from-message")
    await open(page)
    await page.locator('[data-component="image-preview"][data-stage="rest"]').waitFor()
    await close(page)
    await expect(clickPage(page)).resolves.toBe(true)
  })
}

story("takes the page's clicks as soon as the image preview closes mid-flight", async ({ mount, page }) => {
  await mount("components-image-preview--from-message")
  await open(page)
  await page.locator('[data-component="image-preview"][data-stage="flying"]').waitFor()
  await page.keyboard.press("Escape")
  await expect(clickPage(page)).resolves.toBe(true)
})

async function open(page: Page) {
  await page.locator('[data-story-image="inline"]').click()
}

// A raw click, without Playwright waiting for the point to be clear, as a hand would make it while the image flies home.
async function clickPage(page: Page) {
  const text = page.getByText("Here is the poster")
  const box = await text.boundingBox()

  if (!box) throw new Error("the page text is not laid out")
  await text.evaluate((element) => {
    element.addEventListener("click", () => element.setAttribute("data-clicked", ""), { once: true })
  })
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)

  return text.evaluate((element) => element.hasAttribute("data-clicked"))
}

story("the first Escape zooms the image preview back to fit and the next closes it", async ({ mount, page }) => {
  await mount("components-image-preview--from-message")
  await open(page)
  const preview = page.locator('[data-component="image-preview"]')
  const level = page.locator('[data-slot="image-preview-zoom-level"]')
  await expect(preview).toHaveAttribute("data-stage", "rest")
  const fit = (await level.textContent()) ?? ""

  await page.locator('[data-slot="image-preview-image"]').dblclick()
  await expect(level).not.toHaveText(fit)
  await page.keyboard.press("Escape")
  await expect(level).toHaveText(fit)
  await expect(preview).toHaveAttribute("data-stage", "rest")
  await page.keyboard.press("Escape")
  await expect(preview).toHaveCount(0)
})
