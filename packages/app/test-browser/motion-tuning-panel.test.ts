import { afterEach, expect, it } from "bun:test"
import { motionTuning } from "@opencode/ui/motion-tuning"
import { mountMotionPanel } from "@opencode/ui/motion-tuning-panel"

const cleanups: (() => void)[] = []

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  document.body.replaceChildren()
})

it("offers Snappy, Smooth and Calm for every spring, with one card per section", async () => {
  const panels = motionTuning.spring("test.panels", {
    label: "Spring",
    group: "Panels",
    presets: {
      snappy: { duration: 0.15, bounce: 0 },
      smooth: { duration: 0.25, bounce: 0 },
      calm: { duration: 0.4, bounce: 0 },
    },
  })

  const image = motionTuning.spring("test.image", {
    label: "Spring",
    group: "Image open",
    presets: {
      snappy: { duration: 0.2, bounce: 0 },
      smooth: { duration: 0.3, bounce: 0 },
      calm: { duration: 0.4, bounce: 0 },
    },
  })

  cleanups.push(motionTuning.action({ id: "test.replay", label: "Replay", group: "Panels", run: () => {} }))

  const container = document.createElement("div")
  document.body.append(container)
  cleanups.push(mountMotionPanel(container, { section: "Panels" }))

  const chip = await waitFor(() =>
    [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Smooth"),
  )

  const labels = [...container.querySelectorAll("button")].map((button) => button.textContent?.trim())

  expect(labels).toContain("Snappy")
  expect(labels).toContain("Calm")
  expect(labels).not.toContain("default")

  // Global once, then the section's knobs and its replay button in one card.
  const cards = [...container.querySelectorAll(".knobs-group-label")].filter(
    (label) => label.closest("[hidden]") === null,
  )

  expect(cards.map((label) => label.textContent)).toEqual(["Global", "Panels"])
  expect(panels()).toEqual({ duration: 0.15, bounce: 0 })

  chip.click()
  expect(panels()).toEqual({ duration: 0.25, bounce: 0 })
  expect(image()).toEqual({ duration: 0.3, bounce: 0 })
})

async function waitFor<T>(find: () => T | undefined) {
  for (let i = 0; i < 200; i++) {
    const found = find()

    if (found) return found
    await new Promise((resolve) => setTimeout(resolve, 10))
  }

  throw new Error("timed out")
}
