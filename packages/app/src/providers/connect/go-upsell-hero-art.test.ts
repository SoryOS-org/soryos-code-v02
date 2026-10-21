import { afterEach, beforeEach, expect, test } from "bun:test"
import { mountGoUpsellHero } from "./go-upsell-hero-art"

const original = {
  matchMedia: window.matchMedia,
  requestAnimationFrame: globalThis.requestAnimationFrame,
  cancelAnimationFrame: globalThis.cancelAnimationFrame,
}

let frames: Map<number, FrameRequestCallback>
let cancelled: number[]
let mediaListeners: Set<unknown>

function prefersReducedMotion(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    addEventListener: (_: string, listener: unknown) => mediaListeners.add(listener),
    removeEventListener: (_: string, listener: unknown) => mediaListeners.delete(listener),
  })) as unknown as typeof window.matchMedia
}

function hero() {
  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")!
  const count = { frames: 0, cells: 0 }
  ctx.clearRect = () => count.frames++
  ctx.fillRect = () => count.cells++
  canvas.getContext = (() => ctx) as unknown as typeof canvas.getContext
  Object.defineProperties(canvas, { clientWidth: { value: 480 }, clientHeight: { value: 176 } })
  document.body.append(canvas)
  return { canvas, count }
}

beforeEach(() => {
  frames = new Map()
  cancelled = []
  mediaListeners = new Set()
  let id = 0
  globalThis.requestAnimationFrame = (callback) => {
    frames.set(++id, callback)
    return id
  }
  globalThis.cancelAnimationFrame = (handle) => {
    cancelled.push(handle)
    frames.delete(handle)
  }
})

afterEach(() => {
  window.matchMedia = original.matchMedia
  globalThis.requestAnimationFrame = original.requestAnimationFrame
  globalThis.cancelAnimationFrame = original.cancelAnimationFrame
  document.body.replaceChildren()
})

test("draws one still frame and runs no loop under reduced motion", () => {
  prefersReducedMotion(true)
  const { canvas, count } = hero()

  const dispose = mountGoUpsellHero(canvas)

  expect(count.frames).toBe(1)
  // GO's 140 cells plus the grid
  expect(count.cells).toBeGreaterThan(140)
  expect(canvas.width).toBe(480 * window.devicePixelRatio)
  expect(frames.size).toBe(0)
  dispose()
})

test("stops the loop and its listeners when unmounted", () => {
  prefersReducedMotion(false)
  const { canvas, count } = hero()

  const dispose = mountGoUpsellHero(canvas)
  expect(frames.size).toBe(1)
  expect(mediaListeners.size).toBe(1)

  const [id, tick] = [...frames][0]!
  frames.delete(id)
  tick(performance.now() + 16)
  expect(count.frames).toBe(1)
  expect(frames.size).toBe(1)

  dispose()
  expect(frames.size).toBe(0)
  expect(mediaListeners.size).toBe(0)

  document.dispatchEvent(new Event("visibilitychange"))
  expect(frames.size).toBe(0)
  expect(count.frames).toBe(1)
})
