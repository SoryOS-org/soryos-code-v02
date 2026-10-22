// Regression tests for the composer IME guard (#39632, #49448, #38674).
//
// These drive the real createComposerEditor controller with synthetic
// composition/keyboard events, reproducing the event orders observed on
// Safari, Chrome and WKWebView without a physical IME. The guards under test
// are the exact conditions the editor's onInput / onKeyDown handlers consult:
//
//   onInput:   if (controller.imeInserting(event)) return   // editor.tsx
//   onKeyDown: if (controller.imeComposing(event)) return   // editor.tsx
import { expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { createStore } from "solid-js/store"
import type { ComposerPersistedState } from "@/composer/types"
import { createComposerEditor } from "@/composer/editor/interaction"

function setup() {
  return createRoot((dispose) => {
    const store = createStore<ComposerPersistedState>({
      prompt: [],
      cursor: 0,
      context: { items: [] },
    })
    const controller = createComposerEditor({
      store,
      commands: () => [],
      context: () => [],
      searchContextFiles: () => [],
      view: {
        submit: {
          stopping: () => false,
          onSubmit: () => {},
          onStop: () => {},
        },
      },
    })
    return { controller, dispose }
  })
}

function keydown(key: string, init: { isComposing?: boolean; keyCode?: number } = {}) {
  const event = new KeyboardEvent("keydown", { key, isComposing: init.isComposing ?? false })
  if (init.keyCode !== undefined) Object.defineProperty(event, "keyCode", { value: init.keyCode })
  return event
}

function input(init: { isComposing?: boolean } = {}) {
  return Object.assign(new Event("input"), { isComposing: init.isComposing ?? false }) as InputEvent
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// zh-CN / ja: Safari fires compositionend BEFORE the confirming Enter, so the
// keydown reports isComposing=false with keyCode 229. It must still be
// treated as part of the composition and never submit.
test("ime: the Enter that confirms a CJK candidate right after compositionend never submits", () => {
  const { controller, dispose } = setup()
  try {
    controller.onCompositionStart()
    // mid-composition keystrokes are inert
    expect(controller.imeComposing(keydown("e", { isComposing: true }))).toBe(true)
    controller.onCompositionEnd()
    // confirming Enter, Safari 26 shape
    expect(controller.imeComposing(keydown("Enter", { isComposing: false, keyCode: 229 }))).toBe(true)
    // older reports: keyCode 13, still inside the confirm window
    expect(controller.imeComposing(keydown("Enter", { isComposing: false, keyCode: 13 }))).toBe(true)
  } finally {
    dispose()
  }
})

// A user who commits a candidate and immediately presses Enter to SEND lands
// inside any window longer than the typematic minimum (~30ms). The window is
// 10ms, so a fast deliberate send still goes through.
test("ime: a fast follow-up Enter to send (typematic speed) still submits after compositionend", async () => {
  const { controller, dispose } = setup()
  try {
    controller.onCompositionStart()
    controller.onCompositionEnd()
    await sleep(35)
    expect(controller.imeComposing(keydown("Enter", { isComposing: false, keyCode: 13 }))).toBe(false)
  } finally {
    dispose()
  }
})

// ko: Korean IMEs end the current syllable and insert the next character
// (space, "?", "@", ...) in the same keystroke. That input arrives right after
// compositionend with isComposing=false and must reach the store.
test("ime: input inserted in the same keystroke as compositionend (Korean) is not dropped", () => {
  const { controller, dispose } = setup()
  try {
    controller.onCompositionStart()
    controller.onCompositionEnd()
    expect(controller.imeInserting(input({ isComposing: false }))).toBe(false)
  } finally {
    dispose()
  }
})

// ja/zh: after confirming a candidate, users keep typing immediately. The
// first input of the next composition chunk must not be gated either.
test("ime: typing that continues right after a confirmed candidate reaches the store", async () => {
  const { controller, dispose } = setup()
  try {
    controller.onCompositionStart()
    controller.onCompositionEnd()
    await sleep(5)
    expect(controller.imeInserting(input({ isComposing: false }))).toBe(false)
  } finally {
    dispose()
  }
})

// Only Enter/Tab belong to the confirm window. Escape (stop), arrows
// (history) and Ctrl+G right after a composition must keep working.
test("ime: non-confirm keys right after compositionend are not swallowed", async () => {
  const { controller, dispose } = setup()
  try {
    controller.onCompositionStart()
    controller.onCompositionEnd()
    await sleep(5)
    expect(controller.imeComposing(keydown("Escape", { isComposing: false, keyCode: 27 }))).toBe(false)
    expect(controller.imeComposing(keydown("ArrowUp", { isComposing: false, keyCode: 38 }))).toBe(false)
  } finally {
    dispose()
  }
})

// Android soft keyboards report keyCode 229 for most keys, without any
// composition events. Outside a composition only Enter/Tab may consult 229.
test("ime: keyCode 229 on a non-confirm key without composition is not treated as IME", () => {
  const { controller, dispose } = setup()
  try {
    expect(controller.imeComposing(keydown("a", { isComposing: false, keyCode: 229 }))).toBe(false)
    expect(controller.imeComposing(keydown("Backspace", { isComposing: false, keyCode: 229 }))).toBe(false)
  } finally {
    dispose()
  }
})

// While a composition is genuinely in flight the editor stays fully inert:
// input is gated and every key is guarded.
test("ime: mid-composition input and keys stay inert", () => {
  const { controller, dispose } = setup()
  try {
    controller.onCompositionStart()
    expect(controller.imeInserting(input({ isComposing: true }))).toBe(true)
    expect(controller.imeComposing(keydown("c", { isComposing: true }))).toBe(true)
    expect(controller.imeComposing(keydown("Enter", { isComposing: true }))).toBe(true)
  } finally {
    dispose()
  }
})
