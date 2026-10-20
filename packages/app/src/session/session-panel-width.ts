// The review pane has no width of its own: it takes whatever the chat panel
// leaves behind. Instead of capping the chat panel at a fraction of the window
// (which forces the review pane to grow with the monitor), reserve a fixed
// minimum for the review pane and let the chat panel take everything else.
// Until the user drags the divider, the default width keeps roomier minimums
// (wider still for split diffs); a drag can take either side down to the hard
// minimum.
export const SESSION_PANEL_WIDTH_MIN = 320

const SIDE_PANE_WIDTH_MIN = 320

const SESSION_PANEL_WIDTH_FIT = 450

const REVIEW_PANE_WIDTH_FIT = 480

const REVIEW_PANE_WIDTH_FIT_SPLIT = 800

export function sessionPanelWidthMax(input: { available: number; split: boolean; resized: boolean }) {
  if (input.resized) return Math.max(SESSION_PANEL_WIDTH_MIN, input.available - SIDE_PANE_WIDTH_MIN)
  const pane = input.split ? REVIEW_PANE_WIDTH_FIT_SPLIT : REVIEW_PANE_WIDTH_FIT

  return Math.max(SESSION_PANEL_WIDTH_FIT, input.available - pane)
}

// `available` is undefined until the layout row is first measured; render the
// stored width untouched until then to avoid a first-frame snap.
export function clampSessionPanelWidth(input: {
  width: number
  available: number | undefined
  split: boolean
  resized: boolean
}) {
  if (input.available === undefined) return input.width

  return Math.min(input.width, sessionPanelWidthMax({ ...input, available: input.available }))
}
