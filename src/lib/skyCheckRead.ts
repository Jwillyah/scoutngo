import { bandStats, type BandStats } from '../core/skyCheck.ts'

/*
 * THE ONE PLACE A CAMERA PIXEL IS READ (Batch J, Section 7: the sky check,
 * asked for "on-device, stays on the phone, never uploaded").
 *
 * The rule of the viewfinder is that the picture never leaves the <video>
 * (tests/viewfinderPrivacy.test.ts). This reads only what the check needs and
 * keeps none of it: the frame shrunk to SAMPLE_W x SAMPLE_H pixels on a
 * canvas made here and dropped here, never on the page, never encoded, never
 * stored, never sent; out come three numbers (src/core/skyCheck.ts). Only on
 * a tap of "Check the gap". tests/skyCheckPrivacy.test.ts holds all of that.
 */
export const SAMPLE_W = 32
export const SAMPLE_H = 24

/** The band, in fractions of the picture as shown (object-fit: cover), 0-1. */
export interface Band {
  x0: number
  x1: number
  y0: number
  y1: number
}

export function readBand(video: HTMLVideoElement, band: Band): BandStats | null {
  const vw = video.videoWidth
  const vh = video.videoHeight
  const ew = video.clientWidth
  const eh = video.clientHeight
  if (vw === 0 || vh === 0 || ew === 0 || eh === 0) return null
  const tiny = new OffscreenCanvas(SAMPLE_W, SAMPLE_H)
  const ctx = tiny.getContext('2d', { willReadFrequently: true })
  if (ctx === null) return null
  /* What the screen shows of the video (cover): the middle of it, scaled. */
  const scale = Math.max(ew / vw, eh / vh)
  const sw = ew / scale
  const sh = eh / scale
  const sx = (vw - sw) / 2
  const sy = (vh - sh) / 2
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, SAMPLE_W, SAMPLE_H)
  const all = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data
  const clamp = (v: number, n: number) => Math.max(0, Math.min(n - 1, Math.floor(v * n)))
  const x0 = clamp(band.x0, SAMPLE_W)
  const x1 = Math.max(x0 + 1, clamp(band.x1, SAMPLE_W))
  const y0 = clamp(band.y0, SAMPLE_H)
  const y1 = Math.max(y0 + 1, clamp(band.y1, SAMPLE_H))
  const inBand: number[] = []
  for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) for (let k = 0; k < 4; k += 1) inBand.push(all[(y * SAMPLE_W + x) * 4 + k])
  return bandStats(inBand, all)
}
