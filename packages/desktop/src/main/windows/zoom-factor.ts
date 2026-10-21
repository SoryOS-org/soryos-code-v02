export const MIN_ZOOM_LEVEL = 0.2

export const MAX_ZOOM_LEVEL = 10

// Values outside the supported range, or of the wrong type, fall back to 100%.
export function normalizeZoomFactor(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= MIN_ZOOM_LEVEL && value <= MAX_ZOOM_LEVEL
    ? value
    : 1
}
