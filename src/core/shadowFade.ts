/*
 * HOW FAR A SHADOW IS DRAWN, AND HOW IT FADES (Batch Polish 2, Section 3).
 * Dark at the building, lighter with distance from it, gone at FADE_HEIGHTS
 * times the building's height: a midday shadow (under twice the height) ends
 * still dark; a low sun's, two hundred metres long, dissolves into the ground
 * long before its geometric tip, and the drawing says so rather than a slab.
 */
export const FADE_HEIGHTS = 6
/** Of the shadow's darkness at the building, what the drawing keeps (the old flat fill was 0.45 all along). */
export const SHADOW_OPACITY = 0.5
/** Along the shadow (0 the building, 1 the fade's end): its darkness, 0-255. Dark most of the way, then fading. */
export const FADE_STOPS: readonly [number, number][] = [
  [0, 255],
  [0.5, 217],
  [1, 0],
]
/** Metres of soft edge. */
export const FEATHER_M = 1

/** Metres from the building at which the drawn shadow has faded out (it is drawn no further than its own length). */
export function fadeLength(heightMeters: number): number {
  return Math.max(0, FADE_HEIGHTS * heightMeters)
}

/** Metres of shadow actually drawn: its length, or where it has faded out. */
export const drawnLength = (lengthMeters: number, heightMeters: number): number => Math.max(0, Math.min(lengthMeters, fadeLength(heightMeters)))

/** The drawn darkness (0-1 of SHADOW_OPACITY) at `d` metres along a shadow that fades out at `fade`. */
export function fadeAt(d: number, fade: number): number {
  if (fade <= 0) return 0
  const t = Math.max(0, Math.min(1, d / fade))
  for (let i = 1; i < FADE_STOPS.length; i += 1) {
    const [a, va] = FADE_STOPS[i - 1]
    const [b, vb] = FADE_STOPS[i]
    if (t <= b) return (va + ((vb - va) * (t - a)) / (b - a)) / 255
  }
  return 0
}

/** Metres per pixel for a shadow raster covering `extentMeters` across, at most `maxPx` pixels and no finer than `finest`. */
export function rasterScale(extentMeters: number, maxPx = 1024, finest = 0.25): number {
  return Math.max(finest, extentMeters / maxPx)
}
