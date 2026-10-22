import { chromium, expect } from "@playwright/test"
import { mkdir, rm } from "node:fs/promises"
import path from "node:path"
import { build } from "vite"
import solid from "vite-plugin-solid"
import tailwind from "@tailwindcss/vite"
import type {} from "../../app/src/session/composer/activity-chips.fixture"

// Production components and the story server's service mocks, bundled without a dev server.
const out = path.resolve("captures/chip-orb-flag")
const verify = process.argv.includes("--verify-only")
const root = path.resolve("packages/stories/node_modules/.cache/chip-orb-proof")
const mocks = path.resolve("packages/stories/mocks")
await mkdir(out, { recursive: true })
await mkdir(root, { recursive: true })
await Bun.write(
  path.join(root, "index.html"),
  `<div id="root"></div><script type="module" src="${path.resolve("packages/app/src/session/composer/activity-chips.fixture.tsx")}"></script>`,
)
await build({
  configFile: false,
  root,
  publicDir: path.resolve("packages/app/public"),
  plugins: [solid(), tailwind()],
  resolve: {
    dedupe: ["solid-js", "solid-js/web", "@solidjs/meta", "@tanstack/solid-query"],
    alias: [
      { find: "@solidjs/router", replacement: path.join(mocks, "solid-router.tsx") },
      ...Object.entries({
        "providers/models/selection": "context/local.ts",
        "workspaces/files/model": "context/file.ts",
        "shell/state/layout": "context/layout.ts",
        "workspaces/location": "context/location.ts",
        "composer/comments": "context/comments.ts",
        "shell/commands/command": "context/command.ts",
        "runtime/platform/platform": "context/platform.ts",
        "runtime/server/global-sync": "context/global-sync.ts",
        "runtime/server/sync": "context/server-sync.ts",
        "runtime/server/client": "context/server-sdk.ts",
        "runtime/server/current": "context/server-current.ts",
        "providers/catalog/providers": "hooks/use-providers.ts",
        "providers/models/unpaid": "components/dialog-select-model-unpaid.tsx",
      }).map(([find, file]) => ({ find: `@/${find}`, replacement: path.join(mocks, "app", file) })),
      { find: "@", replacement: path.resolve("packages/app/src") },
    ],
  },
  build: { outDir: "dist", minify: true },
  worker: { format: "es" },
})
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch: (request) => {
    const pathname = new URL(request.url).pathname
    return new Response(Bun.file(path.join(root, "dist", pathname === "/" ? "index.html" : pathname)))
  },
})
const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1200, height: 800 },
  deviceScaleFactor: 2,
  recordVideo: verify ? undefined : { dir: path.join(out, "video"), size: { width: 1200, height: 800 } },
})
const page = await context.newPage()
const errors: string[] = []
const orbRequests: string[] = []
page.on("request", (request) => {
  if (request.url().includes("css-agent-orb")) orbRequests.push(request.url())
})
page.on("pageerror", (error) => {
  errors.push(error.message)
  console.error(error.message)
})
try {
  await page.goto(String(server.url))
  const chip = page.locator('[data-slot="session-activity-chip"]')
  await chip.waitFor({ timeout: 30_000 }).catch(async (error) => {
    console.error(await page.locator("body").innerHTML())
    throw error
  })
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  await page.getByText("Chip corners", { exact: true }).waitFor()
  const choose = (mode: string, corners: string) =>
    page.evaluate(({ mode, corners }) => window.chipExperiment(mode, corners), { mode, corners })
  const initial = await chip.evaluate((chip) => ({
    transition: getComputedStyle(chip).transitionProperty,
    duration: getComputedStyle(chip).transitionDuration,
    orbs: document.querySelectorAll('[data-component="css-agent-orb"]').length,
    animations: document
      .getAnimations()
      .filter((animation) => animation instanceof CSSAnimation && animation.animationName.startsWith("css-orb")).length,
  }))
  if (
    initial.transition !== "all" ||
    initial.duration !== "0.15s" ||
    initial.orbs ||
    initial.animations ||
    orbRequests.length
  )
    throw new Error(`Default changed: ${JSON.stringify({ initial, orbRequests })}`)
  const geometry = []
  for (const mode of ["today", "orb"]) {
    for (const corners of ["capsule", "composer"]) {
      await choose(mode, corners)
      if (mode === "orb") await chip.locator('[data-component="css-agent-orb"]').waitFor()
      await expect(chip).toHaveCSS(
        "border-top-left-radius",
        mode === "today" ? "12px" : corners === "capsule" ? "9999px" : "10px",
      )
      geometry.push({
        mode,
        corners,
        ...(await page.evaluate(() => {
          const chip = document.querySelector<HTMLElement>('[data-slot="session-activity-chip"]')!
          const composer = document.querySelector<HTMLElement>('[data-component="composer"]')!
          const rect = chip.getBoundingClientRect()
          return {
            height: rect.height,
            radius: getComputedStyle(chip).borderTopLeftRadius,
            composerRadius: getComputedStyle(composer).borderTopLeftRadius,
            composerY: composer.getBoundingClientRect().y,
            glyphOffset:
              chip.querySelector('[data-slot="activity-glyph"]')!.getBoundingClientRect().x +
              8 -
              rect.x -
              rect.height / 2,
            orb: chip.dataset.orb,
          }
        })),
      })
      if (!verify) await page.screenshot({ path: path.join(out, `${mode}-${corners}.png`) })
    }
  }
  await page.reload()
  await chip.waitFor()
  if ((await chip.getAttribute("data-orb")) !== "true") throw new Error("Choice did not persist")
  await choose("today", "capsule")
  await page.waitForTimeout(250)
  if ((await chip.locator('[data-component="css-agent-orb"]').count()) !== 1)
    throw new Error("Opted-in orb was unmounted")
  const fade = await page.evaluate(async () => {
    const chip = document.querySelector('[data-slot="session-activity-chip"]')!
    const orb = chip.querySelector('[data-slot="activity-glyph-orb"]')!
    const today = chip.querySelector('[data-slot="activity-glyph-today"]')!
    window.chipExperiment("orb", "capsule")
    const frames: number[][] = []
    await new Promise<void>((resolve) => {
      const frame = () => {
        frames.push([Number(getComputedStyle(today).opacity), Number(getComputedStyle(orb).opacity)])
        if (frames.length === 20) return resolve()
        requestAnimationFrame(frame)
      }
      requestAnimationFrame(frame)
    })
    return frames
  })
  if (!fade.some(([a, b]) => a > 0 && b > 0) || fade.some(([a, b]) => a + b < 0.99))
    throw new Error("Glyph swap popped or blanked")
  if (!verify) await page.waitForTimeout(5000)
  await page.evaluate(() => (document.documentElement.dataset.motion = "reduce"))
  const explicitReduced = await chip
    .locator('[data-component="css-agent-orb"]')
    .evaluate((orb) => orb.getAnimations({ subtree: true }).length)
  if (explicitReduced !== 0) throw new Error("Explicit reduced motion orb still animates")
  await page.evaluate(() => delete document.documentElement.dataset.motion)
  await page.emulateMedia({ reducedMotion: "reduce" })
  const reduced = await chip
    .locator('[data-component="css-agent-orb"]')
    .evaluate((orb) => orb.getAnimations({ subtree: true }).length)
  if (reduced !== 0) throw new Error("Reduced motion orb still animates")
  if (!verify) await page.screenshot({ path: path.join(out, "reduced.png") })
  await Bun.write(
    path.join(out, verify ? "verification.json" : "proof.json"),
    JSON.stringify({ initial, orbRequests, geometry, fade, reduced, explicitReduced, errors }, null, 2),
  )
  console.log(JSON.stringify({ initial, orbRequests, geometry, reduced, explicitReduced, errors }, null, 2))
  if (errors.length) throw new Error(errors.join("\n"))
} finally {
  const video = page.video()
  await context.close()
  await video?.saveAs(path.join(out, "real-time.webm"))
  await browser.close()
  server.stop()
  await rm(root, { recursive: true, force: true })
}
if (!verify) {
  const video = Bun.spawn(
    [
      "ffmpeg",
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      path.join(out, "real-time.webm"),
      "-an",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      path.join(out, "real-time.mp4"),
    ],
    { stdout: "ignore", stderr: "inherit" },
  )
  if (await video.exited) throw new Error("Video encode failed")
}
