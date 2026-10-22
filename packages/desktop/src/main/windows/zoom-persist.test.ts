import { expect, test } from "bun:test"
import { createZoomPersister } from "./zoom-persist"

function harness(delay = 250) {
  let now = 0
  let timer: (() => void) | undefined
  const writes: number[] = []
  const persister = createZoomPersister({
    write: (value) => writes.push(value),
    delay,
    now: () => now,
    schedule: (callback) => {
      timer = callback

      return callback
    },
    cancel: () => {
      timer = undefined
    },
  })

  return {
    persister,
    writes,
    advance(ms: number) {
      now += ms
      const callback = timer
      timer = undefined
      callback?.()
    },
  }
}

test("writes the first change immediately", () => {
  const { persister, writes } = harness()
  persister.push(1.2)

  expect(writes).toEqual([1.2])
})

test("coalesces rapid changes into one trailing write", () => {
  const { persister, writes, advance } = harness()
  persister.push(1.2)
  persister.push(1.4)
  persister.push(1.6)

  expect(writes).toEqual([1.2])

  advance(250)
  expect(writes).toEqual([1.2, 1.6])
})

test("flush writes the pending value", () => {
  const { persister, writes } = harness()
  persister.push(1.2)
  persister.push(1.4)
  persister.flush()

  expect(writes).toEqual([1.2, 1.4])
})

test("does not write an unchanged value", () => {
  const { persister, writes, advance } = harness()
  persister.push(1.2)
  persister.push(1.2)
  advance(250)
  persister.flush()

  expect(writes).toEqual([1.2])
})
