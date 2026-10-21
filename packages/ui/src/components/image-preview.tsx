import { Dialog as Kobalte, useDialogContext } from "@kobalte/core/dialog"
import { makeEventListener } from "@solid-primitives/event-listener"
import { createResizeObserver } from "@solid-primitives/resize-observer"
import { animate, type AnimationPlaybackControls } from "motion"
import { createEffect, createMemo, createSignal, on, onCleanup } from "solid-js"
import { useDialogLayer } from "../context/dialog"
import { useI18n } from "../context/i18n"
import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { frameLoop, prefersReducedMotion, Spring, type DurationOptions } from "../motion"
import {
  createFlight,
  elementFrame,
  FLIGHT_SPRING,
  flightStyle,
  intersect,
  KICK,
  type Box,
  type FlightFrame,
} from "./image-flight"
import { clampView, detailScale, FIT_VIEW, maxScale, panBy, wheelZoomFactor, zoomAt, type ZoomView } from "./image-zoom"

export interface ImagePreviewProps {
  src: string
  alt?: string
  /** The image on the page that the preview grows out of and shrinks back into. */
  origin?: HTMLElement
}

const STEP = Math.SQRT2

// One spring carries the open and the close, and the backdrop dims on it too.
const OPEN_SPRING = { duration: 0.3, bounce: 0 }

// Without a flight (reduced motion, or no thumbnail to fly to), the preview only fades.
const fade = { duration: 0.15, bounce: 0 }

// How long the dialog stays mounted after a close starts, in milliseconds: the flight lands and hands the image back
// to the page well within this.
const exitDuration = Math.max(OPEN_SPRING.duration, fade.duration) * 3200

const CENTER = { x: 0, y: 0 }

export function ImagePreview(props: ImagePreviewProps) {
  const i18n = useI18n()
  const dialog = useDialogContext()
  let root!: HTMLDivElement
  let scrim!: HTMLDivElement
  let content!: HTMLDivElement
  let viewport!: HTMLDivElement
  let image!: HTMLImageElement
  let standIn!: HTMLImageElement
  let surface!: HTMLDivElement
  let edge!: HTMLDivElement
  let close: HTMLButtonElement | undefined
  // Nothing shows until the image has loaded and the preview knows where it lands; while flying, a stand-in image and
  // its shadow travel above the dialog in place of the real one.
  const [stage, setStage] = createSignal<"pending" | "flying" | "rest">("pending")

  // The flight under way: where the stand-in is laid out (the flight only transforms and clips it), the springs, and
  // what happens when it lands.
  let course: { at: Box; flight: ReturnType<typeof createFlight>; landed: () => void } | undefined

  const dim = Spring.fromDuration(0, FLIGHT_SPRING)
  // Once a close lands, the stand-in fades out over the image the page shows again, so whatever the page draws over
  // its own image (a fade under a sticky bar, say) comes in softly instead of in one frame.
  const veil = Spring.fromDuration(1, FLIGHT_SPRING)

  // How far the flight has lifted off the page, as last painted: the origin's outline fades out as it rises.
  let lift = 0
  // Without a flight (reduced motion, or nothing on the page to fly to) the preview only fades with the backdrop.
  let plain = false
  let stop: (() => void) | undefined
  const [view, setView] = createSignal(FIT_VIEW)
  const [fitRatio, setFitRatio] = createSignal(1)
  const [drag, setDrag] = createSignal<{ id: number; x: number; y: number }>()
  // Whether the press that ends in a click began on the backdrop around the image and stayed put. A pan captures the
  // pointer, so its click lands on the backdrop wherever it began.
  let backdrop = false
  // Where an eased zoom is heading, so repeated steps build on the destination rather than the frame in flight.
  let goal = FIT_VIEW
  let animation: AnimationPlaybackControls | undefined

  const percent = createMemo(() => new Intl.NumberFormat(i18n.locale(), { style: "percent", maximumFractionDigits: 0 }))

  const bounds = () => ({
    width: image.offsetWidth,
    height: image.offsetHeight,
    viewportWidth: viewport.clientWidth,
    viewportHeight: viewport.clientHeight,
    maxScale: maxScale(fitRatio()),
  })

  // Pinch, wheel and drag follow the hand directly and take over from an eased zoom mid-flight.
  const follow = (next: ZoomView) => {
    animation?.stop()
    animation = undefined
    goal = next
    setView(next)
  }

  const ease = (target: ZoomView) => {
    animation?.stop()
    goal = target

    if (prefersReducedMotion()) return setView(target)
    const from = view()
    animation = animate(0, 1, {
      type: "spring",
      visualDuration: 0.25,
      bounce: 0,
      onUpdate: (progress) =>
        setView({
          scale: from.scale + (target.scale - from.scale) * progress,
          x: from.x + (target.x - from.x) * progress,
          y: from.y + (target.y - from.y) * progress,
        }),
    })
  }

  const step = (factor: number) => ease(zoomAt(goal, goal.scale * factor, CENTER, bounds()))

  // Kobalte keeps the content mounted while an exit animation runs; the dialog stack waits for the flight too.
  const layer = useDialogLayer()
  const [exit, setExit] = createSignal(0)

  const holdExit = () => {
    setExit(exitDuration)
    layer?.setExitDuration(exit())
  }

  holdExit()

  const reveal = async () => {
    await Promise.all([image.decode(), standIn.decode()]).catch(() => undefined)

    if (stage() !== "pending" || !dialog.isOpen()) return
    const from = prefersReducedMotion() ? undefined : originFrame()
    holdExit()
    dimTo(1, from ? OPEN_SPRING : fade)

    if (!from) {
      plain = true
      paint()
      setStage("rest")

      return run()
    }

    const flight = createFlight(from)
    const rest = restFrame()
    flight.to(rest, KICK.open, OPEN_SPRING)
    course = { at: place(fitted()), flight, landed: () => setStage("rest") }
    hideOrigin()
    paint()
    setStage("flying")
    run()
  }

  const dismiss = () => {
    animation?.stop()

    if (stage() === "pending") return
    const to = prefersReducedMotion() ? undefined : originFrame()
    dimTo(0, to ? OPEN_SPRING : fade)

    if (!to) {
      plain = true

      return run()
    }

    // A close mid-open turns the flight around where it is, keeping its velocity.
    if (!course) {
      const rest = restFrame()
      course = { at: place(fitted()), flight: createFlight(rest), landed: showOrigin }
    }

    course.flight.to(to, KICK.close, OPEN_SPRING)
    course.landed = () => {
      showOrigin()
      veil.omega = (2 * Math.PI) / (OPEN_SPRING.duration * 0.75)
      veil.set(0)
    }

    hideOrigin()
    paint()
    setStage("flying")
    run()
  }

  const dimTo = (target: number, spring: DurationOptions) => {
    dim.omega = (2 * Math.PI) / spring.duration
    dim.zeta = 1 - spring.bounce
    dim.set(target)
  }

  // One job on the shared frame loop steps the flight and the backdrop together and writes them straight to the DOM.
  const run = () => {
    stop ??= frameLoop.add((dt) => {
      const flying = course?.flight.step(dt)
      dim.step(dt)
      veil.step(dt)
      paint()

      // The real image takes over only once the panel holding it is fully opaque, so its brightness doesn't step.
      if (course && !flying && dim.resting) {
        const landed = course.landed
        course = undefined
        landed()
      }

      if (course || !dim.resting || !veil.resting) return true
      stop = undefined

      return false
    })
  }

  const paint = () => {
    scrim.style.opacity = String(dim.value)
    standIn.style.opacity = String(plain ? dim.value : veil.value)
    surface.style.opacity = course ? "1" : "0"

    if (course) {
      const frame = course.flight.frame()
      const style = flightStyle(course.at, frame)
      standIn.style.transform = style.transform
      standIn.style.clipPath = style.clipPath
      // The shadow and the outline are leaf boxes, so sizing them every frame stays cheap; scaling them instead would
      // stretch their corners and shadow.
      layout(surface, frame.surface, frame.surfaceRadius)
      surface.style.setProperty("--image-preview-lift", String(frame.lift))
      layout(edge, frame.clip, frame.radius)
      lift = frame.lift
    }

    // Flying, the controls arrive as the image lifts; without a flight they fade with the backdrop.
    content.style.opacity = String(plain ? dim.value : course ? lift ** 2 : dim.value ** 2)
    edge.style.opacity = String((1 - lift) * veil.value)
  }

  const place = (box: Box) => {
    Object.assign(standIn.style, {
      left: `${box.x}px`,
      top: `${box.y}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
    })

    return box
  }

  // The image as shown now, zoomed and panned and cropped to the viewport. There is no panel: the image is the surface.
  const restFrame = (): FlightFrame => {
    const shown = image.getBoundingClientRect()
    const clip = intersect(shown, viewport.getBoundingClientRect())
    const cropped = clip.width < shown.width - 0.5 || clip.height < shown.height - 0.5
    const radius = cropped ? 0 : parseFloat(getComputedStyle(image).borderTopLeftRadius) * view().scale

    return { image: shown, clip, radius, surface: clip, surfaceRadius: radius, lift: 1 }
  }

  // The origin's frame, cropped to the part the page shows, or nothing when it is gone or out of sight.
  const originFrame = () => {
    const origin = props.origin

    if (!origin?.isConnected || !image.naturalWidth) return
    const rect = origin.getBoundingClientRect()

    if (!rect.width || !rect.height) return
    // The dialog stack portals the preview with its overlay; both sit over the page it looks through.
    const visible = visibleBox(origin, root.closest("[data-dialog-layer]")?.parentElement ?? root)

    if (!visible) return
    const style = getComputedStyle(origin)
    // An image's outline is often an overlay, since an inset shadow does not paint over an <img>.
    edge.style.boxShadow =
      [style.boxShadow, getComputedStyle(origin, "::after").boxShadow].find((shadow) => shadow !== "none") ?? "none"

    return elementFrame(
      rect,
      { width: image.naturalWidth, height: image.naturalHeight },
      style.objectFit,
      parseFloat(style.borderTopLeftRadius) || 0,
      visible,
    )
  }

  // The image's fitted layout box, wherever zoom has moved it.
  const fitted = (): Box => {
    const shown = image.getBoundingClientRect()

    return {
      x: shown.x + shown.width / 2 - view().x - image.offsetWidth / 2,
      y: shown.y + shown.height / 2 - view().y - image.offsetHeight / 2,
      width: image.offsetWidth,
      height: image.offsetHeight,
    }
  }

  const hideOrigin = () => props.origin?.setAttribute("data-image-preview-origin", "")
  const showOrigin = () => props.origin?.removeAttribute("data-image-preview-origin")

  onCleanup(() => {
    stop?.()
    showOrigin()
  })

  createEffect(
    on(
      () => dialog.isOpen(),
      (open) => {
        if (!open) dismiss()
      },
      { defer: true },
    ),
  )

  const point = (event: MouseEvent) => {
    const rect = viewport.getBoundingClientRect()

    return { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 }
  }

  const measure = () => {
    if (!image.naturalWidth) return
    setFitRatio(image.offsetWidth / image.naturalWidth)
    follow(clampView(view(), bounds()))
  }

  createResizeObserver(() => [viewport, image], measure)

  createEffect(
    on(
      () => props.src,
      () => follow(FIT_VIEW),
      { defer: true },
    ),
  )

  onCleanup(() => animation?.stop())

  // The preview owns zoom gestures while it is open: the page behind must neither scroll nor zoom the whole window.
  makeEventListener(
    window,
    "wheel",
    (event: WheelEvent) => {
      const inside = event.target instanceof Node && viewport.contains(event.target)
      const zoom = event.ctrlKey || event.metaKey

      if (!inside && !zoom) return
      event.preventDefault()
      event.stopPropagation()

      if (!inside) return
      const current = view()

      if (zoom) {
        follow(zoomAt(current, current.scale * wheelZoomFactor(pixels(event, event.deltaY)), point(event), bounds()))

        return
      }

      const horizontal = event.shiftKey && event.deltaX === 0
      follow(
        panBy(
          current,
          {
            x: -pixels(event, horizontal ? event.deltaY : event.deltaX),
            y: horizontal ? 0 : -pixels(event, event.deltaY),
          },
          bounds(),
        ),
      )
    },
    { passive: false, capture: true },
  )

  // Captured ahead of the desktop shell, which zooms the whole window on the same shortcuts.
  makeEventListener(
    window,
    "keydown",
    (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return
      const action = shortcut(event.key)

      if (!action) return
      event.preventDefault()
      event.stopPropagation()

      if (action === "fit") return ease(FIT_VIEW)
      step(action === "in" ? STEP : 1 / STEP)
    },
    { capture: true },
  )

  return (
    <div
      ref={root}
      data-component="image-preview"
      data-stage={stage()}
      style={{ "--image-preview-exit": `${exit()}ms` }}
    >
      <div ref={scrim} data-slot="image-preview-scrim" />
      <Kobalte.Content
        ref={content}
        data-slot="image-preview-content"
        onOpenAutoFocus={(event) => {
          // Open with focus on Close, as before, rather than on the zoom controls that precede it.
          event.preventDefault()
          close?.focus()
        }}
        onPointerDown={(event: PointerEvent) => {
          backdrop = event.target === content || event.target === viewport
        }}
        onClick={(event: MouseEvent) => {
          // The preview fills the window, so a click on the backdrop around the image lands here rather than outside.
          if (!backdrop || (event.target !== content && event.target !== viewport)) return
          dialog.close()
        }}
      >
        <div
          ref={viewport}
          data-slot="image-preview-body"
          data-zoomed={view().scale > 1 ? "" : undefined}
          data-dragging={drag() ? "" : undefined}
          onDblClick={(event) => {
            if (goal.scale > 1) return ease(FIT_VIEW)
            ease(zoomAt(goal, detailScale(fitRatio()), point(event), bounds()))
          }}
          onPointerDown={(event) => {
            if (event.button !== 0 || view().scale <= 1) return
            event.preventDefault()
            viewport.setPointerCapture(event.pointerId)
            setDrag({ id: event.pointerId, x: event.clientX, y: event.clientY })
          }}
          onPointerMove={(event) => {
            const current = drag()

            if (current?.id !== event.pointerId) return
            backdrop = false
            setDrag({ id: current.id, x: event.clientX, y: event.clientY })
            follow(panBy(view(), { x: event.clientX - current.x, y: event.clientY - current.y }, bounds()))
          }}
          onPointerUp={(event) => {
            if (drag()?.id === event.pointerId) setDrag(undefined)
          }}
          onPointerCancel={(event) => {
            if (drag()?.id === event.pointerId) setDrag(undefined)
          }}
        >
          <img
            ref={image}
            src={props.src}
            alt={props.alt ?? i18n.t("ui.imagePreview.alt")}
            data-slot="image-preview-image"
            draggable={false}
            onLoad={() => {
              measure()
              void reveal()
            }}
            onError={() => void reveal()}
            style={{ transform: `translate(${view().x}px, ${view().y}px) scale(${view().scale})` }}
          />
        </div>
        <div data-slot="image-preview-controls">
          <IconButton
            data-slot="image-preview-zoom-out"
            icon={<Icon name="minus" />}
            variant="ghost"
            aria-label={i18n.t("ui.imagePreview.zoomOut")}
            onClick={() => step(1 / STEP)}
          />
          <Button
            data-slot="image-preview-zoom-level"
            variant="ghost-muted"
            size="small"
            aria-label={i18n.t("ui.imagePreview.zoomToFit")}
            title={i18n.t("ui.imagePreview.zoomToFit")}
            onClick={() => ease(FIT_VIEW)}
          >
            {percent().format(view().scale * fitRatio())}
          </Button>
          <IconButton
            data-slot="image-preview-zoom-in"
            icon={<Icon name="plus" />}
            variant="ghost"
            aria-label={i18n.t("ui.imagePreview.zoomIn")}
            onClick={() => step(STEP)}
          />
          <div data-slot="image-preview-divider" />
          <Kobalte.CloseButton
            ref={close}
            data-slot="image-preview-close"
            as={IconButton}
            icon={<Icon name="close" />}
            variant="ghost"
            aria-label={i18n.t("ui.common.close")}
          />
        </div>
      </Kobalte.Content>
      <div data-slot="image-preview-surface" ref={surface} />
      <img data-slot="image-preview-flight" src={props.src} alt="" aria-hidden="true" ref={standIn} />
      <div data-slot="image-preview-edge" ref={edge} />
    </div>
  )
}

// The part of `origin` the page under `preview` shows: inside its clipping ancestors and the window, and clear of
// anything drawn over its top or bottom, such as a sticky title bar. Nothing when none of it shows.
function visibleBox(origin: HTMLElement, preview: Element): Box | undefined {
  const clipped = ancestors(origin).reduce(
    (box: Box, element) => {
      const style = getComputedStyle(element)

      if (style.overflowX === "visible" && style.overflowY === "visible") return box

      return intersect(box, element.getBoundingClientRect())
    },
    intersect(origin.getBoundingClientRect(), { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight }),
  )

  const rows = Math.floor(clipped.height)

  if (!clipped.width || rows < 1) return
  const x = clipped.x + clipped.width / 2

  // The origin is hidden while the preview flies, so the page shows it where the topmost element under the preview
  // holds it.
  const shows = (y: number) =>
    document
      .elementsFromPoint(x, y)
      .find((element) => !preview.contains(element))
      ?.contains(origin) ?? false

  const top = covered(rows, (row) => shows(clipped.y + row + 0.5))

  if (top === rows) return
  const bottom = covered(rows - top, (row) => shows(clipped.y + clipped.height - row - 0.5))

  return { x: clipped.x, y: clipped.y + top, width: clipped.width, height: clipped.height - top - bottom }
}

function ancestors(element: HTMLElement) {
  const list: HTMLElement[] = []

  for (let parent = element.parentElement; parent; parent = parent.parentElement) list.push(parent)

  return list
}

// How many of `rows`, counted in from an edge, are covered before the first that shows; a covering bar is one piece.
function covered(rows: number, shows: (row: number) => boolean) {
  let low = 0
  let high = rows

  while (low < high) {
    const middle = Math.floor((low + high) / 2)

    if (shows(middle)) {
      high = middle
      continue
    }

    low = middle + 1
  }

  return low
}

function layout(element: HTMLElement, frame: Box, radius: number) {
  Object.assign(element.style, {
    left: `${frame.x}px`,
    top: `${frame.y}px`,
    width: `${frame.width}px`,
    height: `${frame.height}px`,
    borderRadius: `${radius}px`,
  })
}

function shortcut(key: string) {
  if (key === "=" || key === "+") return "in"

  if (key === "-" || key === "_") return "out"

  if (key === "0") return "fit"
}

function pixels(event: WheelEvent, delta: number) {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return delta * 16

  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return delta * window.innerHeight

  return delta
}
