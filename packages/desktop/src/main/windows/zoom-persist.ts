export type ZoomPersister = {
  push: (value: number) => void
  flush: () => void
}

type Options = {
  write: (value: number) => void
  delay?: number
  now?: () => number
  schedule?: (callback: () => void, delay: number) => unknown
  cancel?: (timer: unknown) => void
}

// Coalesces zoom changes before writing them. The first change is written immediately (keyboard and
// menu actions are one-shot), while a continuous pinch is collapsed into at most one trailing write
// per `delay`, so the settings file is not rewritten on every event.
export function createZoomPersister({
  write,
  delay = 250,
  now = Date.now,
  schedule = (callback, ms) => setTimeout(callback, ms),
  cancel = (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
}: Options): ZoomPersister {
  let lastWritten: number | undefined
  let pending: number | undefined
  let timer: unknown = undefined
  let lastAt = Number.NEGATIVE_INFINITY

  function emit(value: number) {
    if (value === lastWritten) return
    lastWritten = value
    write(value)
  }

  function flush() {
    if (timer !== undefined) {
      cancel(timer)
      timer = undefined
    }

    const value = pending
    pending = undefined

    if (value === undefined) return
    lastAt = now()
    emit(value)
  }

  function push(value: number) {
    if (value === lastWritten && pending === undefined) return
    pending = value

    if (timer !== undefined) return

    const elapsed = now() - lastAt

    if (elapsed >= delay) {
      lastAt = now()
      pending = undefined
      emit(value)

      return
    }

    timer = schedule(flush, delay - elapsed)
  }

  return { push, flush }
}
