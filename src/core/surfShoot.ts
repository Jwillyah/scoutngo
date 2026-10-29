/*
 * SURF FOR SOMEONE SHOOTING IT: the arithmetic behind the Surf page.
 *
 * Every answer here is computed from the forecast's numbers and the sun's
 * position; the page only words and draws them.
 *
 *   rating        in words and in plain sizes: "Fun · waist to chest"
 *   hour quality  good, ok or poor, for the coloured strip (never red)
 *   face light    the sun on the wave face: front-lit, side-lit or backlit
 *                 (a glowing lip), from the sun's bearing against the way the
 *                 wave travels
 *   best window   hours that are Fun or bigger, clean, and in low sun
 *   where to stand which side of the peak keeps the light on the face, and
 *                 how far off each lens in the bag frames a wave and rider
 *   drone         the wind at height against the aircraft's rating, and
 *                 whether the ceiling leaves room for a lineup shot
 */
import { angleApart } from './coastFacing.ts'
import type { SurfShape } from './surf.ts'

/** Plain sizes for a face height, the way surfers say it. */
export function sizeWords(faceFt: number): string {
  if (faceFt < 1) return 'flat'
  if (faceFt < 2) return 'ankle to knee'
  if (faceFt < 3) return 'knee to waist'
  if (faceFt < 4) return 'waist to chest'
  if (faceFt < 5) return 'chest to shoulder'
  if (faceFt < 6.5) return 'head high'
  if (faceFt < 8) return 'overhead'
  return 'well overhead'
}

export type HourQuality = 'good' | 'ok' | 'poor'

/**
 * Good: Fun or bigger (2 ft faces and up) and clean. Ok: something to ride
 * (1 ft and up) and not blown out. Poor: flat, or messy. Shape unknown (no
 * wind forecast) can be ok at best: it is never called good on a guess.
 */
export function hourQuality(faceFt: number, shape: SurfShape | null): HourQuality {
  if (faceFt >= 2 && shape === 'Clean') return 'good'
  if (faceFt >= 1 && shape !== 'Messy') return 'ok'
  return 'poor'
}

/** The rating in words: Flat, Poor, Fair, Fun, Good. */
export function ratingWord(faceFt: number, shape: SurfShape | null): string {
  if (faceFt < 1) return 'Flat'
  const q = hourQuality(faceFt, shape)
  if (q === 'poor') return 'Poor'
  if (q === 'ok') return 'Fair'
  return faceFt < 4 ? 'Fun' : 'Good'
}

export type FaceLight = 'front' | 'side' | 'back' | 'dark'

/**
 * The sun on the wave's face. The face looks the way the wave travels: to
 * shore, the opposite of where the swell comes from. With the sun on that
 * side of the wave the face is lit (front); with the sun out to sea behind it
 * the face is in shadow and the lip glows (back); between, side-lit. Within
 * 60 degrees of each end.
 */
export function faceLight(sunAzimuth: number, sunAltitude: number, swellFromDeg: number): FaceLight {
  if (sunAltitude <= 0) return 'dark'
  const faceLooks = (swellFromDeg + 180) % 360
  const d = angleApart(sunAzimuth, faceLooks)
  if (d <= 60) return 'front'
  if (d >= 120) return 'back'
  return 'side'
}

/* Low sun: under this the light rakes across the water and the faces carry colour. */
export const LOW_SUN_DEG = 35

export interface ShootHour {
  at: Date
  faceFt: number
  shape: SurfShape | null
  light: FaceLight
  sunAltitude: number
}

/** The longest run of hours that are Fun or bigger, clean, and in low sun; null when there is none. */
export function bestWindow(hours: readonly ShootHour[]): { from: Date; to: Date; light: FaceLight; shape: SurfShape; faceFt: number } | null {
  let best: ShootHour[] = []
  let run: ShootHour[] = []
  const good = (h: ShootHour) => hourQuality(h.faceFt, h.shape) === 'good' && h.light !== 'dark' && h.sunAltitude < LOW_SUN_DEG
  for (const h of hours) {
    if (good(h)) run.push(h)
    else run = []
    if (run.length > best.length) best = [...run]
  }
  if (best.length === 0) return null
  /* The light most of the window has; its biggest faces. */
  const count = new Map<FaceLight, number>()
  for (const h of best) count.set(h.light, (count.get(h.light) ?? 0) + 1)
  const light = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0]
  return { from: best[0].at, to: new Date(best[best.length - 1].at.getTime() + 3_600_000), light, shape: 'Clean', faceFt: Math.max(...best.map((h) => h.faceFt)) }
}

/**
 * Which way along the beach to walk from the peak so the sun lights the face
 * you see: toward the sun's side. `beachFacing` is the way the beach looks
 * out to sea. Returns the bearing along the beach to stand toward, or null
 * with the sun straight behind or ahead (either side works).
 */
export function standToward(sunAzimuth: number, beachFacing: number): number | null {
  const left = (beachFacing + 270) % 360
  const right = (beachFacing + 90) % 360
  const dl = angleApart(sunAzimuth, left)
  const dr = angleApart(sunAzimuth, right)
  if (Math.abs(dl - dr) < 20) return null
  return dl < dr ? left : right
}

/* A wave and its rider, about 3 m tall, filling the frame's short side. */
export const FRAME_SUBJECT_M = 3

/** Where you stand to frame a wave and rider with a lens, and where that is: in the water, on the beach, or out on a pier or jetty. */
export function lensDistance(focalMm: number, sensorShortMm: number): { metres: number; from: 'water' | 'beach' | 'pier or jetty' } {
  const metres = (focalMm * FRAME_SUBJECT_M) / sensorShortMm
  return { metres, from: metres < 40 ? 'water' : metres <= 250 ? 'beach' : 'pier or jetty' }
}

/* A lineup shot: the drone straight over the peak, high enough to see the set lines. */
export const LINEUP_FT: readonly [number, number] = [150, 250]

/** The drone over the lineup: the wind at lineup height against the rating, and the ceiling against the shot. */
export function droneOverLineup(windAtHeightMps: number | null, ratedMps: number | null, ceilingFt: number | null): { wind: 'within' | 'over' | 'unknown'; ceiling: 'room' | 'tight' | 'none' | 'unknown' } {
  const wind = windAtHeightMps === null || ratedMps === null ? 'unknown' : windAtHeightMps <= ratedMps ? 'within' : 'over'
  const ceiling = ceilingFt === null ? 'unknown' : ceilingFt >= LINEUP_FT[1] ? 'room' : ceilingFt >= LINEUP_FT[0] ? 'tight' : 'none'
  return { wind, ceiling }
}
