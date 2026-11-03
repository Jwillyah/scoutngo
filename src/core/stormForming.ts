/*
 * STORMS THAT FORM IN PLACE (Batch L, Section 3). The straight-line tracker
 * (stormCells.ts) carries a cell along its motion; a storm that grows out of
 * nothing overhead has no motion to carry and was invisible until it rained
 * (the 4 Aug replay: "over you" 13 minutes before the rain, nothing before).
 *
 * THE SIGNAL, all three read on the phone:
 *
 *   radar     new cells: a cell of CELL_DBZ or more in the newest scan with no
 *             match in the scans before it, or born one scan back (followed
 *             through 2 scans or fewer), within FORM_KM of the venue
 *   HRRR      the model's own forecast reflectivity an hour or so ahead (the
 *             same colour scale as the radar, read by the same code): cells of
 *             CELL_DBZ within FORM_KM
 *   air       today's CAPE (energy for rising air) at CAPE_MIN or more with
 *             CIN (the lid) at CIN_MAX or less, from stormRisk.ts
 *
 * Said when the radar has new cells AND either the HRRR or the air backs
 * them; when neither of those could be read, MIN_ALONE new cells on radar
 * alone. A fact line, never advice: "New cells forming within 20 mi · moving
 * slowly".
 */
import { compassPoint } from './field.ts'
import { bearingBetween, distanceMeters, type LatLon } from './geo.ts'
import { CAPE_MIN, CIN_MAX } from './stormRisk.ts'
import type { Cell, Track } from './stormCells.ts'

export const FORM_KM = 48.28 /* 30 mi */
/** Followed through this many scans or fewer: new. */
export const NEW_SCANS = 2
/** Slower than this is "moving slowly", km/h (10 mph). */
export const SLOW_KMH = 16
/** New cells on radar alone, when the model and the air could not be read. */
export const MIN_ALONE = 2

export interface Forming {
  /** New cells within FORM_KM. */
  cells: number
  nearestKm: number
  bearingDeg: number
  /** Their motion: the flow they borrow, or their own; null when none could be measured. */
  speedKmh: number | null
  towardDeg: number | null
  /** The HRRR's cells within FORM_KM at its valid time; null when not read. */
  hrrr: { cells: number; nearestKm: number | null; validAt: Date } | null
  /** Whether the air is unstable enough with a weak enough lid; null when not read. */
  air: { cape: number; cin: number | null; ok: boolean } | null
}

const kmTo = (venue: LatLon, c: Cell) => distanceMeters(venue, c.at) / 1000

/** The new cells near the venue, nearest first. */
export function newCellsNear(venue: LatLon, tracks: readonly Track[], km = FORM_KM): Track[] {
  return tracks
    .filter((t) => t.scans <= NEW_SCANS && kmTo(venue, t.cell) <= km)
    .sort((a, b) => kmTo(venue, a.cell) - kmTo(venue, b.cell))
}

export function forming(
  venue: LatLon,
  tracks: readonly Track[],
  hrrr: { cells: readonly Cell[]; validAt: Date } | null,
  air: { cape: number | null; cin: number | null } | null,
): Forming | null {
  const fresh = newCellsNear(venue, tracks)
  if (fresh.length === 0) return null
  const hr = hrrr === null ? null : (() => {
    const near = hrrr.cells.map((c) => kmTo(venue, c)).filter((k) => k <= FORM_KM)
    return { cells: near.length, nearestKm: near.length === 0 ? null : Math.min(...near), validAt: hrrr.validAt }
  })()
  const airRead = air === null || air.cape === null ? null : { cape: air.cape, cin: air.cin, ok: air.cape >= CAPE_MIN && (air.cin === null || Math.abs(air.cin) <= CIN_MAX) }
  const backed = (hr !== null && hr.cells > 0) || (airRead !== null && airRead.ok)
  const unread = hr === null && airRead === null
  if (!backed && !(unread && fresh.length >= MIN_ALONE)) return null
  const first = fresh[0]
  const v = first.v
  return {
    cells: fresh.length,
    nearestKm: kmTo(venue, first.cell),
    bearingDeg: bearingBetween(venue, first.cell.at),
    speedKmh: v === null ? null : Math.hypot(v.e, v.n),
    towardDeg: v === null || Math.hypot(v.e, v.n) < 1 ? null : ((Math.atan2(v.e, v.n) * 180) / Math.PI + 360) % 360,
    hrrr: hr,
    air: airRead,
  }
}

/** "New cells forming within 20 mi · moving slowly", or "· moving NE 15 mph". */
export function formingLine(f: Forming, dist: 'mi' | 'km'): string {
  const d = dist === 'mi' ? f.nearestKm / 1.609344 : f.nearestKm
  const within = Math.max(5, Math.ceil(d / 5) * 5)
  const say = (kmh: number) => `${Math.round(dist === 'mi' ? kmh / 1.609344 : kmh)} ${dist === 'mi' ? 'mph' : 'km/h'}`
  const motion = f.speedKmh === null ? '' : f.speedKmh < SLOW_KMH || f.towardDeg === null ? ' · moving slowly' : ` · moving ${compassPoint(f.towardDeg)} ${say(f.speedKmh)}`
  return `New cells forming within ${within} ${dist}${motion}`
}

/** What backs it, for the line under: "HRRR has storms within 15 mi by 2:00 PM · CAPE 2,100". */
export function formingWhy(f: Forming, dist: 'mi' | 'km', clock: (d: Date) => string): string | null {
  const parts: string[] = []
  if (f.hrrr !== null && f.hrrr.cells > 0 && f.hrrr.nearestKm !== null) {
    const d = dist === 'mi' ? f.hrrr.nearestKm / 1.609344 : f.hrrr.nearestKm
    parts.push(`HRRR has storms within ${Math.max(5, Math.ceil(d / 5) * 5)} ${dist} by ${clock(f.hrrr.validAt)}`)
  }
  if (f.air !== null && f.air.ok) parts.push(`CAPE ${Math.round(f.air.cape).toLocaleString('en-US')} J/kg`)
  return parts.length === 0 ? null : parts.join(' · ')
}
