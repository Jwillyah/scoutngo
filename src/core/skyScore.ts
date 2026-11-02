/*
 * WHAT A SUNRISE OR SUNSET PHOTO SHOWS OF ITS SKY (Batch F, Section 7).
 *
 * The truth loop asked "It fired, Meh, Nothing?" and the answer was typed by
 * hand. Now the photo is read on the phone and the answer is SUGGESTED from
 * what is in its sky; the shooter can change it. Nothing about the picture
 * is kept but these numbers (and, if asked, a tiny thumbnail).
 *
 * WHAT IS READ, on the photo scaled to 96 px wide, in its top part (the
 * sky: above the horizon row when one is found, else the top 45%):
 *
 *   cloud     a pixel is cloud where the picture has texture (its brightness
 *             differs from its neighbours' by more than CLOUD_TEXTURE) or
 *             where it stands out from its own row (by more than ROW_OFF from
 *             the row's median brightness). A clear twilight sky is a smooth
 *             gradient, the same across each row, and has neither, however
 *             colourful it is.
 *   lit       cloud that is warm (hue within 50° of red), saturated and
 *             bright: cloud the low sun is colouring.
 *   sky       the mean saturation and the circular mean hue of the sky.
 *
 * THE SUGGESTION, from the fractions of the sky:
 *
 *   Clear     cloud under 8% and colour in the sky: nothing for the sun to light
 *   Nothing   a featureless grey lid (cloud under 8% but the sky grey, mean
 *             saturation under GREY_SKY): overcast is not clear
 *   Fired     lit cloud 20% of the sky or more
 *   Meh       lit cloud 6% or more
 *   Nothing   cloud, but hardly any of it lit
 *
 * Thresholds set on drawn skies (skyScore.test.ts); the real check is the
 * owner's own photos, on the phone.
 */

export type SkyVerdict = 'fired' | 'meh' | 'nothing' | 'clear'

export interface SkyScore {
  /** Share of the sky region that is cloud, 0..1. */
  cloud: number
  /** Share of the sky region that is lit cloud, 0..1. */
  lit: number
  /** Mean saturation of the sky region, 0..1. */
  saturation: number
  /** Circular mean hue of the sky region, degrees, or null when grey. */
  hue: number | null
  /** The rows looked at, of the scaled picture. */
  rows: number
  suggest: SkyVerdict
}

export const SCORE_WIDTH = 96
export const SKY_SHARE = 0.45
export const CLOUD_TEXTURE = 0.035
export const ROW_OFF = 0.06
export const GREY_SKY = 0.12
export const CLEAR_BELOW = 0.08
export const FIRED_AT = 0.2
export const MEH_AT = 0.06

function hsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d < 1e-6) return { h: 0, s: 0, l }
  const s = d / (1 - Math.abs(2 * l - 1) + 1e-6)
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: h * 60, s: Math.min(1, s), l }
}

/**
 * Score a picture already scaled to SCORE_WIDTH wide: `data` is RGBA, `width`
 * by `height`. `horizonRow` (in the scaled picture's rows) limits the sky
 * when it is known.
 */
export function scoreSky(data: Uint8ClampedArray | Uint8Array, width: number, height: number, horizonRow: number | null = null): SkyScore {
  const rows = Math.max(4, Math.min(height, horizonRow !== null && horizonRow > 4 ? Math.floor(horizonRow) - 2 : Math.floor(height * SKY_SHARE)))
  const L = new Float32Array(width * rows)
  for (let y = 0; y < rows; y += 1)
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4
      L[y * width + x] = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255
    }
  const rowMedian = new Float32Array(rows)
  for (let y = 0; y < rows; y += 1) {
    const r = Array.from(L.subarray(y * width, (y + 1) * width)).sort((a, b) => a - b)
    rowMedian[y] = r[Math.floor(r.length / 2)]
  }
  let n = 0
  let cloud = 0
  let lit = 0
  let satSum = 0
  let hx = 0
  let hy = 0
  for (let y = 1; y < rows - 1; y += 1)
    for (let x = 1; x < width - 1; x += 1) {
      const i = (y * width + x) * 4
      const { h, s, l } = hsl(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255)
      n += 1
      satSum += s
      hx += Math.cos((h * Math.PI) / 180) * s
      hy += Math.sin((h * Math.PI) / 180) * s
      /* Texture: the pixel against the mean of its eight neighbours. */
      let m = 0
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) if (dx !== 0 || dy !== 0) m += L[(y + dy) * width + x + dx]
      const isCloud = Math.abs(L[y * width + x] - m / 8) > CLOUD_TEXTURE || Math.abs(L[y * width + x] - rowMedian[y]) > ROW_OFF
      if (!isCloud) continue
      cloud += 1
      const warm = h <= 50 || h >= 310
      if (warm && s > 0.35 && l > 0.3) lit += 1
    }
  const cloudShare = n === 0 ? 0 : cloud / n
  const litShare = n === 0 ? 0 : lit / n
  const hue = Math.hypot(hx, hy) / Math.max(1, n) < 0.02 ? null : ((Math.atan2(hy, hx) * 180) / Math.PI + 360) % 360
  const saturation = n === 0 ? 0 : satSum / n
  const suggest: SkyVerdict = cloudShare < CLEAR_BELOW ? (saturation < GREY_SKY ? 'nothing' : 'clear') : litShare >= FIRED_AT ? 'fired' : litShare >= MEH_AT ? 'meh' : 'nothing'
  return { cloud: cloudShare, lit: litShare, saturation, hue, rows, suggest }
}

/*
 * IS IT A SUNRISE OR SUNSET PHOTO AT ALL. The file's time against the
 * nearest sunrise or sunset there (truthLog.ts works that out): within an
 * hour either side. And when the file says which way the camera pointed,
 * within 100° of the sun's bearing, or opposite it for the pink of the
 * anti-twilight; otherwise it is said, not refused.
 */
export const NEAR_EVENT_MIN = 60
export function photoTiming(minutesFromEvent: number, heading: number | null, sunAzimuth: number): { near: boolean; facing: 'toward' | 'away' | 'side' | null; note: string | null } {
  const near = Math.abs(minutesFromEvent) <= NEAR_EVENT_MIN
  let facing: 'toward' | 'away' | 'side' | null = null
  if (heading !== null) {
    const off = Math.abs(((heading - sunAzimuth + 540) % 360) - 180)
    facing = off <= 100 ? 'toward' : off >= 150 ? 'away' : 'side'
  }
  const note = !near
    ? `Taken ${Math.abs(minutesFromEvent)} min ${minutesFromEvent < 0 ? 'before' : 'after'} the nearest sunrise or sunset: the suggestion may not mean much.`
    : facing === 'side'
      ? 'The camera faced side-on to the sun: the sky toward it may have looked different.'
      : null
  return { near, facing, note }
}
