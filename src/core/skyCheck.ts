/*
 * THE VIEWFINDER'S SKY CHECK (Batch J, Section 7): point at the horizon
 * under the sun's line and the phone says how the gap looks, "gap looks
 * bright and warm", from the camera's own picture, on the phone. Only two
 * numbers come out of the picture (src/lib/skyCheckRead.ts): the band's
 * brightness against the whole frame's (the camera's exposure moves both),
 * and its warmth, red over blue.
 */
/** The band is bright when this much brighter than the frame; dim under DIM_RATIO. */
export const BRIGHT_RATIO = 1.25
export const DIM_RATIO = 0.8
/** Red over blue: warm over WARM, cool under COOL. */
export const WARM = 1.2
export const COOL = 0.95

export interface BandStats {
  /** Mean luminance of the band and of the whole frame, 0-255. */
  bandLuma: number
  frameLuma: number
  /** Mean red over mean blue in the band. */
  redOverBlue: number
}

export function skyCheckWords(s: BandStats): string {
  const ratio = s.frameLuma <= 0 ? 1 : s.bandLuma / s.frameLuma
  const light = ratio >= BRIGHT_RATIO ? 'bright' : ratio <= DIM_RATIO ? 'dim' : 'no brighter than the rest'
  const tint = s.redOverBlue >= WARM ? 'warm' : s.redOverBlue <= COOL ? 'grey-blue' : 'neutral'
  return `Gap looks ${light} and ${tint}`
}

/** Luminance (Rec. 709) of one pixel. */
export const luma = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b

/** The stats from RGBA pixels: the band's and the frame's. */
export function bandStats(band: ArrayLike<number>, frame: ArrayLike<number>): BandStats {
  const mean = (px: ArrayLike<number>) => {
    let l = 0
    let r = 0
    let b = 0
    const n = Math.max(1, px.length / 4)
    for (let i = 0; i < px.length; i += 4) {
      l += luma(px[i], px[i + 1], px[i + 2])
      r += px[i]
      b += px[i + 2]
    }
    return { l: l / n, r: r / n, b: b / n }
  }
  const a = mean(band)
  const f = mean(frame)
  return { bandLuma: a.l, frameLuma: f.l, redOverBlue: a.b <= 0 ? 2 : a.r / a.b }
}
