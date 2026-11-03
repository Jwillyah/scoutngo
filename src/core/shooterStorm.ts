/*
 * STORMS IN SHOOTER TERMS (Batch K, Section 4): what a weather app does not
 * say. All from the tracked cells (src/core/stormCells.ts), the lightning
 * cells (src/core/lightning.ts) and the sun (suncalc); arithmetic only,
 * each a condition, never an instruction (ux-rules 28).
 *
 *   CLEARING LIGHT  the cell over you, or arriving, ends before sunset, by
 *                   no more than CLEAR_BEFORE_MIN, moving away from the sun's
 *                   side, with no tracked cell on the sun's line (SUN_LINE_DEG
 *                   either side, out to SUN_LINE_KM) at sunset: the light can
 *                   come in under the back of the storm.
 *   RAINBOW         the sun up and under 42°, a shower (a cell) within
 *                   BOW_KM of you in the half of the sky opposite the sun
 *                   (ANTI_DEG either side of the antisolar point), and no
 *                   cell over you (the sun must reach you): its window in
 *                   5-minute steps over the next 90 minutes, cells carried.
 *   SHELF CLOUD     a strong cell (SHELF_DBZ or more) arriving within
 *                   SHELF_LEAD_MIN at SHELF_KMH or more: the leading edge's
 *                   outflow is what builds a shelf.
 *   LIGHTNING VIEW  after civil dusk (sun below -6°), strikes LIGHTNING_MIN_KM
 *                   to LIGHTNING_MAX_KM away: far enough to frame, near
 *                   enough to see.
 */
import { getTimes } from 'suncalc'
import { getSunPosition } from './sun.ts'
import { compassPoint } from './field.ts'
import { bearingBetween, destinationPoint, distanceMeters, type LatLon } from './geo.ts'
import type { CellCall } from './stormCells.ts'
import type { Strike } from './lightning.ts'
import { MAX_LEAD_MIN } from './stormCells.ts'

export const CLEAR_BEFORE_MIN = 90
export const SUN_LINE_DEG = 20
export const SUN_LINE_KM = 80
export const BOW_KM = 30
export const ANTI_DEG = 45
export const BOW_MAX_ALT = 42
export const SHELF_DBZ = 50
export const SHELF_LEAD_MIN = 60
export const SHELF_KMH = 25
export const LIGHTNING_MIN_KM = 8
export const LIGHTNING_MAX_KM = 80
const STEP_MIN = 5

/** Compass degrees and degrees up (src/core/sun.ts: suncalc 2.0 already reports both in degrees). */
export const sunAzimuth = (at: Date, p: LatLon) => getSunPosition(at, p.lat, p.lon).azimuth
export const sunAltitude = (at: Date, p: LatLon) => getSunPosition(at, p.lat, p.lon).altitude
const apart = (a: number, b: number) => Math.abs((((a - b) % 360) + 540) % 360 - 180)

/** Where a cell will be `min` minutes after the scan. */
export function carried(c: CellCall, min: number): LatLon {
  return c.towardDeg === null ? c.at : destinationPoint(c.at, c.towardDeg, (c.kmh * min * 1000) / 60)
}

export interface Clearing {
  clears: Date
  sunset: Date
  /** Toward the sun. */
  look: string
}

export function clearingLight(venue: LatLon, cells: readonly CellCall[], scanAt: Date): Clearing | null {
  const sunset = getTimes(scanAt, venue.lat, venue.lon).sunset as Date | null
  if (sunset === null || !(sunset > scanAt)) return null
  const ours = cells.filter((c) => (c.over || c.arrives !== null) && c.ends !== null).sort((a, b) => (b.ends as Date).getTime() - (a.ends as Date).getTime())[0]
  if (ours === undefined || ours.ends === null) return null
  const before = (sunset.getTime() - ours.ends.getTime()) / 60_000
  if (before < 0 || before > CLEAR_BEFORE_MIN) return null
  const sunAz = sunAzimuth(sunset, venue)
  if (ours.towardDeg !== null && apart(ours.towardDeg, sunAz) < 90) return null
  const lead = (sunset.getTime() - scanAt.getTime()) / 60_000
  if (lead > MAX_LEAD_MIN) return null
  for (const c of cells) {
    const p = carried(c, lead)
    const km = distanceMeters(venue, p) / 1000
    if (km <= SUN_LINE_KM && apart(bearingBetween(venue, p), sunAz) <= SUN_LINE_DEG) return null
  }
  return { clears: ours.ends, sunset, look: compassPoint(sunAz) }
}

export interface Bow {
  from: Date
  to: Date
  look: string
}

export function rainbowWindow(venue: LatLon, cells: readonly CellCall[], scanAt: Date): Bow | null {
  let from: Date | null = null
  let to: Date | null = null
  let look = ''
  for (let m = 0; m <= MAX_LEAD_MIN; m += STEP_MIN) {
    const t = new Date(scanAt.getTime() + m * 60_000)
    const alt = sunAltitude(t, venue)
    const anti = (sunAzimuth(t, venue) + 180) % 360
    const at = cells.map((c) => carried(c, m))
    const overUs = at.some((p) => distanceMeters(venue, p) / 1000 <= 4)
    const shower = at.some((p) => {
      const km = distanceMeters(venue, p) / 1000
      return km > 2 && km <= BOW_KM && apart(bearingBetween(venue, p), anti) <= ANTI_DEG
    })
    const ok = alt > 0 && alt < BOW_MAX_ALT && shower && !overUs
    if (ok) {
      if (from === null) {
        from = t
        look = compassPoint(anti)
      }
      to = new Date(t.getTime() + STEP_MIN * 60_000)
    } else if (from !== null) break
  }
  return from === null || to === null ? null : { from, to, look }
}

export function shelfLikely(cells: readonly CellCall[], scanAt: Date): { cell: CellCall; look: string } | null {
  const c = cells.find((x) => x.arrives !== null && x.maxDbz >= SHELF_DBZ && x.kmh >= SHELF_KMH && (x.arrives.getTime() - scanAt.getTime()) / 60_000 <= SHELF_LEAD_MIN)
  return c === undefined ? null : { cell: c, look: compassPoint(c.bearingDeg) }
}

export function lightningView(venue: LatLon, strikes: readonly Strike[], now: Date): { km: number; look: string; frame: Date } | null {
  if (sunAltitude(now, venue) > -6) return null
  let best: { km: number; look: string; frame: Date } | null = null
  for (const s of strikes) {
    const km = distanceMeters(venue, s.at) / 1000
    if (km < LIGHTNING_MIN_KM || km > LIGHTNING_MAX_KM) continue
    if (best === null || s.frame > best.frame || (s.frame.getTime() === best.frame.getTime() && km < best.km)) best = { km, look: compassPoint(bearingBetween(venue, s.at)), frame: s.frame }
  }
  return best
}

/** The shooter lines, each a condition: for Today, Tomorrow's card and Sky. */
export function shooterLines(venue: LatLon, cells: readonly CellCall[], strikes: readonly Strike[], scanAt: Date, clock: (d: Date) => string, dist: 'mi' | 'km'): string[] {
  const out: string[] = []
  const d = (km: number) => `${Math.round(dist === 'mi' ? km / 1.609344 : km)} ${dist}`
  const c = clearingLight(venue, cells, scanAt)
  if (c !== null) out.push(`Storm clears by ${clock(c.clears)}, sunset ${clock(c.sunset)}: dramatic light possible toward the ${c.look}`)
  const b = rainbowWindow(venue, cells, scanAt)
  if (b !== null) out.push(`Rainbow possible ${clock(b.from)}–${clock(b.to)}, toward the ${b.look}`)
  const s = shelfLikely(cells, scanAt)
  if (s !== null && s.cell.arrives !== null) out.push(`Shelf cloud possible ahead of the cell arriving ~${clock(s.cell.arrives)}, from the ${s.look}`)
  const l = lightningView(venue, strikes, scanAt)
  if (l !== null) out.push(`Lightning in view after dark: ${d(l.km)} ${l.look}, 15-min map of ${clock(l.frame)}`)
  return out
}
