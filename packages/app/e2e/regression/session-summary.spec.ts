import { expect, test, type Locator, type Page } from "@playwright/test"
import { SERVER, holdRoute, seed, sessionHref } from "../utils/app"
import { openWithDirection } from "../utils/direction"
import { mockOpenCodeServer } from "../utils/mock-server"
import { fixture, installStressSessionTabs, mockStressTimeline, pageMessages } from "../utils/session-fixture"

const cors = { "access-control-allow-origin": "*" }

for (const custom of [false, true]) {
  test(`summary toggle ${custom ? "custom" : "default"} shortcut follows the active session`, async ({ page }) => {
    await mockStressTimeline(page)
    await installStressSessionTabs(page)

    // The legacy command ID; the keybind migration renames it to `details.toggle`.
    if (custom) await seed(page, { settings: { keybinds: { "session.summary.toggle": "alt+f8" } } })
    await page.goto(sessionHref(fixture.sourceID))
    const trigger = page.getByRole("button", { name: "Session details", exact: true })
    const summary = page.getByRole("menu", { name: "Session details", exact: true })
    await expect(page.locator('[data-component="composer-editor"]')).toBeEditable()
    await expect(trigger).toBeEnabled()
    // The trigger scrolls with the timeline under its sticky header, and Kobalte closes a tooltip whenever its
    // trigger scrolls. A cold timeline keeps scrolling to its bottom until it reveals its rows, so hover after that.
    await expect(
      page.locator(`[data-timeline-row="UserMessage"][data-message-id="${fixture.expected.sourceMessageIDs.at(-1)}"]`),
    ).toBeVisible()
    await trigger.hover()
    const tooltip = page.getByRole("tooltip")
    await expect(tooltip).toContainText("Session details")
    const mac = await page.evaluate(() => /(Mac|iPod|iPhone|iPad)/.test(navigator.platform))
    const shortcut = custom ? "Alt+F8" : mac ? "Meta+Shift+Y" : "Control+Shift+Y"
    await expect(tooltip.locator('[data-slot="keybind-v2-label"]')).toHaveText(
      custom ? (mac ? ["⌥", "F8"] : ["Alt", "F8"]) : mac ? ["⇧", "⌘", "Y"] : ["Ctrl", "Shift", "Y"],
    )

    for (const id of [fixture.sourceID, fixture.targetID, fixture.sourceID]) {
      await page.locator(`[data-titlebar-tab-link][href="${sessionHref(id)}"]`).click()
      const messages = id === fixture.sourceID ? fixture.expected.sourceMessageIDs : fixture.expected.targetMessageIDs
      await expect(
        page.locator(`[data-timeline-row="UserMessage"][data-message-id="${messages.at(-1)}"]`),
      ).toBeInViewport()
      await page.keyboard.press(shortcut)
      await expect(trigger).toHaveAttribute("aria-expanded", "true")
      await expect(summary.getByRole("menuitem", { name: "MCP", exact: true })).toBeVisible()
      await expect.poll(() => summary.evaluate((element) => element.contains(document.activeElement))).toBe(true)
      await expect(tooltip).toBeHidden()
      await page.keyboard.press(shortcut)
      await expect(trigger).toHaveAttribute("aria-expanded", "false")
      await expect(summary).toBeHidden()
      await expect(trigger).toBeFocused()
    }

    if (!custom) return

    // The override moved, so storage keeps only its new id and Shortcuts lists no row titled with the old one.
    const keybinds = () => page.evaluate(() => JSON.parse(localStorage.getItem("settings.v3") ?? "null")?.keybinds)
    await expect.poll(keybinds).toEqual({ "details.toggle": "alt+f8" })
    await page.goto("/settings")
    const settings = page.getByTestId("settings-screen")
    await settings.getByRole("tab", { name: "Shortcuts", exact: true }).click()
    await expect(settings.getByText("Toggle session details", { exact: true })).toBeVisible()
    await expect(settings.getByText("session.summary.toggle", { exact: true })).toHaveCount(0)
    expect(await keybinds()).toEqual({ "details.toggle": "alt+f8" })
  })
}

test("a session in a worktree subfolder names its worktree and lists cached worktrees at once", async ({ page }) => {
  const root = "C:/OpenCode/SmokeWorktrees"
  await mockStressTimeline(page, {
    sessions: fixture.sessions.map((item) =>
      item.id === fixture.targetID ? { ...item, directory: `${root}/feature/packages/app` } : { ...item },
    ),
    // Found on disk: the project's stored sandboxes stay empty.
    worktrees: [
      { directory: fixture.directory },
      { directory: `${root}/feature`, strategy: "git" },
      { directory: `${root}/other`, strategy: "git" },
    ],
  })
  await page.goto(sessionHref(fixture.targetID))
  const trigger = page.getByRole("button", { name: "Session details", exact: true })
  const summary = page.getByRole("menu", { name: "Session details", exact: true })
  const location = summary.getByRole("menuitem", { name: "feature", exact: true })
  await trigger.click()
  await expect(location).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(summary).toBeHidden()

  // The reopened summary's menu lists the cached inventory while its own refresh stays held.
  const list = await holdRoute(page, (url) => url.pathname === "/api/worktree", { method: "GET" })
  await trigger.click()
  await location.click()
  await enter(page, location, page.getByRole("menu").filter({ hasText: "Move session to" }))
  await list.arrived
  await page.getByRole("menuitem", { name: "Worktree", exact: true }).click()
  const existing = page.getByRole("menu").filter({ has: page.getByRole("menuitem", { name: "other", exact: true }) })
  await expect(existing.getByRole("menuitem", { name: "other", exact: true })).toBeVisible()
  await expect(existing.getByRole("menuitem", { name: "feature", exact: true })).toHaveCount(0)
  list.release()
})

test("a subagent shows its details but cannot move to another worktree", async ({ page }) => {
  const root = "C:/OpenCode/SmokeWorktrees"

  await mockStressTimeline(page, {
    sessions: fixture.sessions.map((item) =>
      item.id === fixture.targetID
        ? { ...item, parentID: fixture.sourceID, directory: `${root}/feature` }
        : { ...item },
    ),
    worktrees: [{ directory: fixture.directory }, { directory: `${root}/feature`, strategy: "git" }],
  })
  await page.goto(sessionHref(fixture.targetID))

  const summary = page.getByRole("menu", { name: "Session details", exact: true })

  await page.getByRole("button", { name: "Session details", exact: true }).click()
  await expect(summary.getByRole("menuitem", { name: "feature", exact: true })).toHaveAttribute("aria-disabled", "true")
  await expect(summary.getByRole("menuitem", { name: "Export…", exact: true })).toHaveCount(0)
  await expect(summary.getByRole("menuitem", { name: "Delete…", exact: true })).toHaveCount(0)
  await expect(summary.getByRole("menuitem", { name: "MCP", exact: true })).toBeVisible()
})

test("the details follow the routed session when it moves to another worktree", async ({ page }) => {
  const root = "C:/OpenCode/SmokeWorktrees"

  const sessions = fixture.sessions.map((item) =>
    item.id === fixture.targetID ? { ...item, directory: `${root}/feature` } : { ...item },
  )

  const mock = await mockStressTimeline(page, {
    sessions,
    worktrees: [
      { directory: fixture.directory },
      { directory: `${root}/feature`, strategy: "git" },
      { directory: `${root}/other`, strategy: "git" },
    ],
  })

  await page.goto(sessionHref(fixture.targetID))
  const trigger = page.getByRole("button", { name: "Session details", exact: true })
  const summary = page.getByRole("menu", { name: "Session details", exact: true })
  const location = (name: string) => summary.getByRole("menuitem", { name, exact: true })
  await trigger.click()
  await expect(location("feature")).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(summary).toBeHidden()

  // The server moves the session; the screen stays mounted while its extensions read the new worktree.
  const moved = sessions.find((item) => item.id === fixture.targetID)

  if (moved) moved.directory = `${root}/other`
  await mock.push([
    {
      id: "evt_details_session_moved",
      type: "session.moved",
      created: 2,
      durable: { aggregateID: fixture.targetID, seq: 1, version: 1 },
      data: { sessionID: fixture.targetID, location: { directory: `${root}/other` }, projectID: fixture.project.id },
    },
  ])
  await trigger.click()
  await expect(location("other")).toBeVisible()
  await expect(location("feature")).toHaveCount(0)
})

for (const direction of ["ltr", "rtl"] as const) {
  test(`summary overlays the view and submenus follow ${direction}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await mockStressTimeline(page)
    await openWithDirection(page, sessionHref(fixture.targetID), direction)
    const trigger = page.getByRole("button", { name: "Session details", exact: true })
    await expect(trigger).toBeEnabled()
    await expect(page.locator("html")).toHaveAttribute("dir", direction)
    await expect(page.locator("html")).toHaveAttribute("lang", "en")
    const warnings = ownerWarnings(page)

    const row = page.locator(
      `[data-timeline-row="UserMessage"][data-message-id="${fixture.expected.targetMessageIDs.at(-1)}"]`,
    )

    const composer = page.locator('[data-component="session-composer-dock"] > div')
    const timeline = page.locator('[data-slot="session-timeline-scroll"]')
    const summary = page.getByRole("menu", { name: "Session details", exact: true })
    await expect(row).toBeInViewport()
    const before = { row: (await row.boundingBox())!, composer: (await composer.boundingBox())! }

    await trigger.click()
    await expect(summary).toBeVisible()
    await expect
      .poll(async () => {
        const message = (await row.boundingBox())!
        const input = (await composer.boundingBox())!

        return Math.max(Math.abs(message.x - before.row.x), Math.abs(input.x - before.composer.x))
      })
      .toBeLessThan(1)
    // The capped session column can end before the menu, so the overlay is measured against the whole timeline.
    await expect
      .poll(async () => {
        const view = (await timeline.boundingBox())!
        const details = (await summary.boundingBox())!

        return Math.min(view.x + view.width, details.x + details.width) - Math.max(view.x, details.x)
      })
      .toBeGreaterThan(0)
    await expectAlignedWithTrigger(page)

    const mcp = summary.getByRole("menuitem", { name: "MCP", exact: true })
    const submenu = page.getByRole("menu", { name: "MCP", exact: true })
    await mcp.click()
    await expect(submenu.getByText("No MCP servers configured", { exact: true })).toBeVisible()
    await expect(submenu.getByText("Configuration file")).toBeVisible()
    await expect(summary).toBeVisible()
    // The submenu opens beside its row, never over it.
    await expect
      .poll(async () => {
        const item = (await mcp.boundingBox())!
        const menu = (await submenu.boundingBox())!

        return menu.x + menu.width <= item.x + 1 || menu.x >= item.x + item.width - 1
      })
      .toBe(true)

    for (const [name, empty] of [
      ["Plugins", "No plugins configured"],
      ["Skills", "No skills configured"],
      ["LSP", "No LSP servers configured"],
    ]) {
      await summary.getByRole("menuitem", { name, exact: true }).click()
      await expect(page.getByRole("menu", { name, exact: true }).getByText(empty, { exact: true })).toBeVisible()
      await expect(submenu).toBeHidden()
    }

    await page.keyboard.press("Escape")
    await expect(summary).toBeHidden()

    await page.getByRole("button", { name: "Toggle review", exact: true }).click()
    await trigger.click()
    await expectAlignedWithTrigger(page)
    expect(warnings).toEqual([])
  })
}

test("summary catalogs load, refresh while cached, and tell errors from empty", async ({ page }) => {
  const state = { fail: true, extra: false, empty: false }
  const pluginDirectories: string[] = []

  const lsp = [
    {
      type: "document",
      info: {
        lsp: {
          typescript: { command: ["typescript-language-server", "--stdio"] },
          rust: { command: ["rust-analyzer"] },
        },
      },
    },
    { type: "document", info: { lsp: { rust: { disabled: true } } } },
  ]

  await mockStressTimeline(page, {
    mcp: () => (state.empty ? [] : [{ name: "summary-mcp", status: { status: "connected" } }]),
    plugins: () =>
      state.empty
        ? []
        : [
            { id: "builtin", source: { type: "builtin" }, features: {}, state: { status: "active" } },
            {
              id: "supermemory",
              source: { type: "package", target: "opencode-supermemory" },
              features: { server: true },
              state: { status: "active" },
            },
            {
              id: "broken-plugin",
              source: { type: "local", path: "/broken.ts" },
              features: { server: true },
              state: { status: "failed", error: "Plugin failed to activate" },
            },
            ...(state.extra
              ? [
                  {
                    id: "daytona",
                    source: { type: "package", target: "opencode-daytona" },
                    features: {},
                    state: { status: "active" },
                  },
                ]
              : []),
          ],
    skills: () =>
      state.empty
        ? []
        : [
            { id: "find-skills", name: "find-skills", path: "/skills/find/SKILL.md", content: "Find skills" },
            { id: "review-animations", name: "review-animations", path: "/skills/review/SKILL.md", content: "Review" },
          ],
    configEntries: lsp,
  })
  await page.route(
    (url) => url.pathname === "/api/plugin",
    (route) => {
      if (route.request().method() === "OPTIONS") return route.fallback()
      pluginDirectories.push(new URL(route.request().url()).searchParams.get("location[directory]") ?? "")

      if (state.fail) return route.fulfill({ status: 500, headers: cors, json: { message: "Unavailable" } })

      return route.fallback()
    },
  )
  const prefetch = await holdRoute(page, (url) => url.pathname === "/api/plugin")
  const warnings = ownerWarnings(page)
  await page.goto(sessionHref(fixture.targetID))
  await page.getByRole("button", { name: "Session details", exact: true }).click()
  const summary = page.getByRole("menu", { name: "Session details", exact: true })
  const menu = (name: string) => page.getByRole("menu", { name, exact: true })

  const open = async (name: string) => {
    const item = summary.getByRole("menuitem", { name, exact: true })
    await item.click()
    await enter(page, item, menu(name))
  }

  await prefetch.arrived
  await expect(summary.getByRole("menuitem", { name: "Local repository", exact: true })).toBeVisible()
  await expect(summary.getByRole("menuitem", { name: "MCP", exact: true })).toBeVisible()
  await open("Plugins")
  await expect(menu("Plugins").getByRole("status")).toContainText("Loading")
  await expect(menu("Plugins").getByText("No plugins configured", { exact: true })).toHaveCount(0)
  prefetch.release()
  await expect(menu("Plugins").getByRole("alert")).toContainText("Request failed")
  await expect(menu("Plugins").getByText("No plugins configured", { exact: true })).toHaveCount(0)

  state.fail = false
  await menu("Plugins").getByRole("button", { name: "Retry", exact: true }).click()
  await expect(menu("Plugins").getByText("supermemory", { exact: true })).toBeVisible()
  await expect(menu("Plugins").getByText("builtin", { exact: true })).toHaveCount(0)
  await expect(menu("Plugins").getByTitle("Plugin failed to activate")).toContainText("Failed")
  expect(pluginDirectories.length).toBeGreaterThan(1)
  expect(pluginDirectories.every((directory) => directory === fixture.directory)).toBe(true)

  await open("Skills")
  await expect(menu("Skills").getByText("find-skills", { exact: true })).toBeVisible()
  await expect(menu("Skills").getByText("review-animations", { exact: true })).toBeVisible()
  await expect(menu("Plugins")).toBeHidden()
  await open("LSP")
  await expect(menu("LSP").getByText("Configured LSPs", { exact: true })).toBeVisible()
  await expect(menu("LSP").getByText("typescript", { exact: true })).toBeVisible()
  await expect(menu("LSP").getByText("rust", { exact: true })).toHaveCount(0)
  await expect(menu("LSP").locator(".session-service-dot")).toHaveCount(0)
  await open("MCP")
  await expect(
    menu("MCP").locator('[data-slot="truncated-text-label"]').filter({ hasText: "summary-mcp" }),
  ).toBeVisible()

  for (const service of [
    { name: "MCP", path: "/api/mcp", item: "summary-mcp" },
    { name: "Plugins", path: "/api/plugin", item: "supermemory" },
    { name: "Skills", path: "/api/skill", item: "find-skills" },
    { name: "LSP", path: "/api/config", item: "typescript" },
  ]) {
    await expectRefreshKeeps(page, service.name, service.path, service.item)
    await open(service.name)
  }

  state.extra = true
  await expectRefreshKeeps(page, "Plugins", "/api/plugin", "supermemory")
  await expect(menu("Plugins").getByText("daytona", { exact: true })).toBeVisible()

  state.empty = true
  lsp.length = 0

  for (const service of [
    { name: "MCP", path: "/api/mcp", empty: "No MCP servers configured" },
    { name: "Plugins", path: "/api/plugin", empty: "No plugins configured" },
    { name: "Skills", path: "/api/skill", empty: "No skills configured" },
    { name: "LSP", path: "/api/config", empty: "No LSP servers configured" },
  ]) {
    await expectRefreshKeeps(page, service.name, service.path, service.empty)
  }

  expect(warnings).toEqual([])
})

test("MCP rows show each server's state and the menu opens the MCP servers dialog", async ({ page }) => {
  await mockStressTimeline(page, {
    mcp: [
      { name: "figma", status: { status: "connected" } },
      { name: "linear", status: { status: "needs_auth" }, integrationID: "linear-oauth" },
      { name: "playwright", status: { status: "failed", error: "Connection refused" } },
      { name: "waiting", status: { status: "pending" } },
      { name: "off", status: { status: "disabled" } },
    ],
  })
  const writes: string[] = []
  page.on("request", (request) => {
    const url = new URL(request.url())

    if (request.method() === "POST" && url.pathname.startsWith("/api/experimental/mcp/")) writes.push(url.pathname)
  })
  await page.goto(sessionHref(fixture.targetID))
  await page.getByRole("button", { name: "Session details", exact: true }).click()
  const item = page.getByRole("menuitem", { name: "MCP", exact: true })
  await item.click()
  const submenu = page.getByRole("menu", { name: "MCP", exact: true })
  await enter(page, item, submenu)

  const row = (name: string) =>
    submenu.locator(".session-mcp-row").filter({ has: page.getByText(name, { exact: true }) })

  await expect(submenu.getByRole("switch")).toHaveCount(0)
  await expect(row("figma").getByText("Connected", { exact: true })).toBeVisible()
  await expect(row("waiting").getByText("Connecting…", { exact: true })).toBeVisible()
  await expect(row("off").getByText("Disabled", { exact: true })).toBeVisible()
  await expect(submenu.getByRole("button", { name: "Sign in to linear", exact: true })).toBeVisible()
  await expect(row("playwright").getByText("Failed", { exact: true })).toBeVisible()

  // A state row is information, not a toggle.
  await row("figma").click()
  await row("off").click()
  await expect(submenu).toBeVisible()
  expect(writes).toEqual([])

  await submenu.getByRole("button", { name: "Manage MCP servers", exact: true }).click()
  await expect(page.getByRole("dialog").getByText("MCPs", { exact: true })).toBeVisible()
  await expect(submenu).toBeHidden()
})

test("multiple desktop connections show the session's server name", async ({ page }) => {
  await mockStressTimeline(page)
  await page.route("http://secondary.test/**", (route) =>
    route.fulfill({
      json: { version: "2.0.0", pid: 1, urls: ["http://secondary.test"], paths: { tmp: "/tmp/opencode" } },
    }),
  )
  await seed(page, {
    servers: [
      { url: SERVER, name: "Design server" },
      { url: "http://secondary.test", name: "Other server" },
    ],
  })
  await page.goto(sessionHref(fixture.targetID))
  await page.getByRole("button", { name: "Session details", exact: true }).click()
  const summary = page.getByRole("menu", { name: "Session details", exact: true })
  await expect(summary.getByText("Design server", { exact: true })).toBeVisible()
  await expect(summary.getByRole("menuitem", { name: "MCP", exact: true })).toBeVisible()
})

test.describe("remote configuration", () => {
  test.use({ serviceWorkers: "block", permissions: ["clipboard-read", "clipboard-write"] })

  test("remote servers copy each service's configuration path", async ({ page }) => {
    const remote = "http://summary-remote.test:4096"
    const home = "/home/remote/.config/opencode"

    const entries = [
      { type: "document", path: `${home}/mcp.jsonc`, info: { mcp: { servers: {} } } },
      { type: "document", path: `${home}/plugins.json`, info: { plugins: [] } },
      { type: "document", path: `${home}/skills.jsonc`, info: { skills: [] } },
      { type: "document", path: `${home}/lsp.json`, info: { lsp: false } },
      { type: "document", path: `${fixture.directory}/opencode.json`, info: {} },
      { type: "document", path: `${fixture.directory}/.opencode/agents/review.md`, info: {} },
    ]

    await mockOpenCodeServer(page, {
      server: remote,
      sessions: fixture.sessions,
      provider: fixture.provider,
      directory: fixture.directory,
      project: fixture.project,
      pageMessages,
      configEntries: entries,
    })
    await seed(page, { servers: [{ url: remote, name: "Remote server" }] })
    await page.goto(sessionHref(fixture.targetID, remote))
    const trigger = page.getByRole("button", { name: "Session details", exact: true })
    const summary = page.getByRole("menu", { name: "Session details", exact: true })
    const tooltip = page.getByRole("tooltip")

    // Each service opens from a fresh summary: after a copy, the next submenu closes itself (reported defect).
    for (const [index, service] of [
      { name: "MCP", path: `${home}/mcp.jsonc` },
      { name: "Plugins", path: `${home}/plugins.json` },
      { name: "Skills", path: `${home}/skills.jsonc` },
      { name: "LSP", path: `${home}/lsp.json` },
    ].entries()) {
      await trigger.click()
      const item = summary.getByRole("menuitem", { name: service.name, exact: true })
      await item.click()
      const menu = page.getByRole("menu", { name: service.name, exact: true })
      await enter(page, item, menu)
      const copy = menu.getByRole("button", { name: "Copy configuration file path", exact: true })
      await expect(tooltip).toHaveCount(0)
      await copy.hover()
      await expect(tooltip).toHaveText("Copy")

      if (index === 0) {
        await expect
          .poll(async () => {
            const icon = (await copy.locator("svg").boundingBox())!
            const tip = (await tooltip.boundingBox())!

            return Math.abs(tip.x + tip.width / 2 - icon.x - icon.width / 2)
          })
          .toBeLessThanOrEqual(1)
      }

      await copy.click()
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(service.path)
      await expect(tooltip).toHaveText("Copied")
      await expect(menu).toBeVisible()
      await trigger.click()
      await expect(summary).toBeHidden()
    }

    entries.length = 0
    await page.evaluate(() => navigator.clipboard.writeText("original clipboard"))
    await trigger.click()
    const skills = summary.getByRole("menuitem", { name: "Skills", exact: true })
    await skills.click()
    await enter(page, skills, page.getByRole("menu", { name: "Skills", exact: true }))

    const copy = page
      .getByRole("menu", { name: "Skills", exact: true })
      .getByRole("button", { name: "Copy configuration file path", exact: true })

    await copy.click()
    await expect(page.getByText("No configuration file found", { exact: true })).toBeVisible()
    await expect(copy).toBeEnabled()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("original clipboard")
  })
})

test("long MCP lists stay in the viewport in a real RTL locale", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 600 })
  await mockStressTimeline(page, {
    mcp: Array.from({ length: 30 }, (_, index) => ({
      name: `server-${String(index).padStart(2, "0")}-בדיקה-${"long-name-".repeat(6)}`,
      status: { status: "connected" },
    })),
  })
  await seed(page, { locale: "he", theme: { id: "oc-2", scheme: "dark" } })
  await page.goto(sessionHref(fixture.targetID))
  await page.getByRole("button", { name: "פרטי ההפעלה", exact: true }).click()
  const summary = page.getByRole("menu", { name: "פרטי ההפעלה", exact: true })
  await summary.getByRole("menuitem", { name: "MCP", exact: true }).click()
  const menu = page.getByRole("menu", { name: "MCP", exact: true })
  await expect(menu.locator(".session-mcp-row")).toHaveCount(30)
  await expect.poll(() => menu.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
  await expect
    .poll(async () => {
      const bounds = (await menu.boundingBox())!

      return bounds.x >= 15 && bounds.y >= 15 && bounds.x + bounds.width <= 785 && bounds.y + bounds.height <= 585
    })
    .toBe(true)
  await page.keyboard.press("Escape")
  await expect(menu).toBeHidden()
})

// Moves the pointer straight across from a submenu's trigger into the open submenu, so it never crosses sibling items.
async function enter(page: Page, trigger: Locator, menu: Locator) {
  await expect(menu).toBeVisible()
  const from = (await trigger.boundingBox())!
  const to = (await menu.boundingBox())!
  await page.mouse.move(to.x + to.width / 2, from.y + from.height / 2, { steps: 5 })
}

// Solid reports reactive work created without an owner; the warning appears in dev builds only.
function ownerWarnings(page: Page) {
  const warnings: string[] = []
  page.on("console", (event) => {
    if (event.text().includes("computations created outside")) warnings.push(event.text())
  })

  return warnings
}

// The menu hangs 4px below its trigger, aligned to the trigger's inline end.
async function expectAlignedWithTrigger(page: Page) {
  const summary = page.getByRole("menu", { name: "Session details", exact: true })
  await expect(summary).toBeVisible()
  await expect
    .poll(async () => {
      const trigger = (await page.getByRole("button", { name: "Session details", exact: true }).boundingBox())!
      const menu = (await summary.boundingBox())!
      const end = Math.min(Math.abs(trigger.x + trigger.width - menu.x - menu.width), Math.abs(trigger.x - menu.x))

      return Math.max(end, Math.abs(menu.y - trigger.y - trigger.height - 4))
    })
    .toBeLessThanOrEqual(1)
}

// Reopens a service submenu while its next catalog request is held: the cached content stays, marked busy.
async function expectRefreshKeeps(page: Page, name: string, path: string, content: string) {
  const menu = page.getByRole("menu", { name, exact: true })
  const summary = page.getByRole("menu", { name: "Session details", exact: true })
  await page.keyboard.press("Escape")
  await expect(menu).toBeHidden()

  if (!(await summary.isVisible())) await page.getByRole("button", { name: "Session details", exact: true }).click()
  const refresh = await holdRoute(page, (url) => url.pathname === path, { method: "GET" })
  await summary.getByRole("menuitem", { name, exact: true }).click()
  await refresh.arrived
  await expect(menu).toHaveAttribute("aria-busy", "true")
  await expect(menu.getByText(content, { exact: true }).filter({ visible: true })).toBeVisible()
  await expect(menu.getByRole("status")).toHaveCount(0)
  await expect(summary).toBeVisible()
  refresh.release()
  await expect(menu).toHaveAttribute("aria-busy", "false")
  await expect(menu.getByText(content, { exact: true }).filter({ visible: true })).toBeVisible()
}
