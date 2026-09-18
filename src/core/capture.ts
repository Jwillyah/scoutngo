/*
 * How big the map image sent to the model should be.
 *
 * WHY THIS IS A KNOB AND NOT A CONSTANT BURIED IN MapView. The image is the
 * single largest thing in a generate request, and its size trades two things
 * against each other that cannot both be maximised: latency and cost on one
 * side, and how well the model can read the ground on the other. That trade has
 * to be MEASURED at a real venue, not guessed, and re-measured whenever the
 * model changes. So the resolution is one named value with a documented way to
 * A/B it.
 *
 * HOW TO A/B IT. Append `?captureEdge=1568` to the app URL. That overrides the
 * default for that page load only, changes nothing on disk, and lets the same
 * venue be generated at two resolutions back to back. Compare the resulting
 * plans on whether positions still land on real ground, still spread across
 * bearing sectors, and still avoid water and roadways. Do not decide on timing
 * alone: a faster plan that puts someone in a river is not a better plan.
 *
 * WHAT THE NUMBERS MEAN. Claude reads an image as 28x28 pixel patches, so an
 * image costs ceil(w/28) * ceil(h/28) visual tokens, and each model has a long
 * edge limit above which the API downscales server side. Sonnet 5 is on the
 * high resolution tier: 2576px long edge, 4784 visual tokens. A 1170x2532
 * capture is 42 x 91 = 3822 tokens and is under both limits, so it is sent at
 * full size and nothing is being wasted on an image the API would have shrunk
 * anyway. Lowering this is a real reduction in what the model sees, which is
 * exactly why it has to be justified by measurement.
 */

export interface PixelSize {
  width: number
  height: number
}

/**
 * The default long edge, in device pixels.
 *
 * 2532 is the natural height of a 390pt phone canvas at 3x, which is to say
 * "whatever the screen already is, unscaled".
 *
 * MEASURED AGAINST 1568, AND KEPT. Three generates per arm at the calibration
 * venue, interleaved, on 2026-09-17:
 *
 *   model leg      2532: mean 11622ms   1568: mean 11795ms
 *   positions placed ON the subject, where there is no bearing and no sightline
 *                  2532: 0 of 18        1568: 5 of 18   (Fisher exact p = 0.046)
 *
 * Two findings, and they point the same way. The smaller image was NOT faster:
 * the generate is dominated by the model composing its answer, not by reading
 * the picture, so removing 2366 visual tokens of input bought nothing. And it
 * placed worse: at 1568 the model repeatedly collapsed positions onto the
 * subject itself, which the coverage check in src/core/coverage.ts then had to
 * exclude for having no bearing. At 2532 that never happened once.
 *
 * So the resolution stays. The only thing 1568 wins is about half a cent of
 * input tokens per generate, which is not worth giving the model 62 percent less
 * ground to read in a tool whose entire job is reading the ground.
 *
 * Caveat worth keeping: three runs per arm can only catch a difference this
 * large. It found one. It could not have ruled out a subtle one.
 */
export const CAPTURE_MAX_LONG_EDGE = 2532

/** A candidate this was measured against. Kept so the comparison is repeatable. */
export const CAPTURE_LONG_EDGE_CANDIDATES = [1568, 2532] as const

/** Claude reads images in 28x28 patches; this is the resulting token cost. */
export const VISUAL_TOKEN_PATCH = 28

export function visualTokens(size: PixelSize): number {
  return (
    Math.ceil(size.width / VISUAL_TOKEN_PATCH) * Math.ceil(size.height / VISUAL_TOKEN_PATCH)
  )
}

/**
 * Scales a size down so its long edge is at most `maxLongEdge`, preserving the
 * aspect ratio. Never scales UP: enlarging a canvas invents detail that was
 * never captured, which costs tokens and tells the model nothing.
 */
export function fitLongEdge(size: PixelSize, maxLongEdge: number): PixelSize {
  const longest = Math.max(size.width, size.height)
  if (longest <= 0 || maxLongEdge <= 0 || longest <= maxLongEdge) return size

  const scale = maxLongEdge / longest
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  }
}

/**
 * The long edge to use for this page load.
 *
 * `?captureEdge=1568` overrides it, for the A/B described at the top of this
 * file. Anything unparseable or out of range falls back to the default rather
 * than failing: a mistyped query string must not silently send a one pixel
 * image to the model.
 */
export function resolveCaptureLongEdge(search: string): number {
  const raw = new URLSearchParams(search).get('captureEdge')
  if (raw === null) return CAPTURE_MAX_LONG_EDGE
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 256 || value > 8000) return CAPTURE_MAX_LONG_EDGE
  return Math.round(value)
}
