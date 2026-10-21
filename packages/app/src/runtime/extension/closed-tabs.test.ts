import { expect, test } from "bun:test"
import type {
  MountedSession,
  Panel,
  PanelProps,
  PanelTab,
  SessionRef,
  SessionScreen,
} from "@opencode/gui-extensions/sdk"
import { CLOSED_TABS_LIMIT, closedEntry, createClosedTabs } from "./closed-tabs"

// SAFETY: the in-memory store reads only `key`; the rest of a session reference is never touched.
const session = (key: string) => ({ key }) as SessionRef

// SAFETY: `closedEntry` reads only the tab's fields; the session and screen pass through untouched.
const props = (tab: Partial<PanelTab>): PanelProps => ({
  tab: { id: "main", title: "Tab", ...tab },
  session: {} as MountedSession,
  screen: {} as SessionScreen,
})

const panel = (fields: Partial<Panel>): Panel => ({
  id: "main",
  region: "side",
  list: () => [],
  render: () => null,
  ...fields,
})

test("keeps a session's closed tabs newest first, once each, up to the limit", () => {
  const closed = createClosedTabs()
  const a = session("a")

  for (const index of Array.from({ length: CLOSED_TABS_LIMIT + 2 }, (_, value) => value))
    closed.push(a, { key: `file://${index}.ts`, title: `${index}.ts` })
  closed.push(a, { key: "file://5.ts", title: "5.ts" })
  closed.push(session("b"), { key: "file://b.ts", title: "b.ts" })

  const keys = closed.list(a).map((entry) => entry.key)

  expect(keys).toHaveLength(CLOSED_TABS_LIMIT)
  expect(keys.slice(0, 3)).toEqual([
    "file://5.ts",
    `file://${CLOSED_TABS_LIMIT + 1}.ts`,
    `file://${CLOSED_TABS_LIMIT}.ts`,
  ])
  expect(keys.filter((key) => key === "file://5.ts")).toHaveLength(1)
  expect(closed.list(session("b")).map((entry) => entry.key)).toEqual(["file://b.ts"])
})

test("takes the newest closed tab, or the one asked for", () => {
  const closed = createClosedTabs()
  const a = session("a")

  closed.push(a, { key: "file://one.ts", title: "one.ts" })
  closed.push(a, { key: "file://two.ts", title: "two.ts", file: "two.ts" })
  closed.push(a, { key: "file://three.ts", title: "three.ts" })

  expect(closed.take(a, "file://two.ts")?.file).toBe("two.ts")
  expect(closed.take(a)?.key).toBe("file://three.ts")
  expect(closed.list(a).map((entry) => entry.key)).toEqual(["file://one.ts"])
  expect(closed.take(a, "missing")).toBeUndefined()
})

test("lists only closing file tabs, by their panel's word or their title, and never a transient one unasked", () => {
  expect(closedEntry("file://a.ts", panel({}), props({ title: "a.ts", file: "a.ts" }))).toEqual({
    key: "file://a.ts",
    title: "a.ts",
    icon: undefined,
    file: "a.ts",
    detail: undefined,
    data: undefined,
  })
  expect(
    closedEntry("file://a.ts", panel({ closed: () => ({ title: "A" }) }), props({ title: "a.ts", file: "a.ts" })),
  ).toMatchObject({ title: "A", file: "a.ts" })
  expect(closedEntry("context:main", panel({}), props({ title: "Context" }))).toBeUndefined()
  expect(closedEntry("review:changes", panel({ closed: () => ({ title: "Review" }) }), props({}))).toBeUndefined()
  expect(closedEntry("file://a.ts", panel({ closed: () => false }), props({ file: "a.ts" }))).toBeUndefined()
  expect(closedEntry("file:open", panel({}), props({ transient: true, file: "a.ts" }))).toBeUndefined()
})
