/*
 * THE BUOYS PAGE v2's WORDS AND ROWS (Batch N, Section 4; src/components/BuoysPageV2.tsx).
 * The arithmetic is in src/core/swellTravel.ts; this only says it.
 */
import type { LatLon } from '../core/geo.ts'
import { swellTravel, type SwellTravel } from '../core/swellTravel.ts'
import type { BuoyReading } from './buoy.ts'
import { metresToFeet } from './tideWords.ts'
import type { Units } from './units.ts'

export type OkBuoy = Extract<BuoyReading, { status: 'ok' }>

/** A wave height in the chosen system: "2.3 ft", "0.7 m". A dash where it is not known. */
export function waveHeight(m: number | null, units: Units): string {
  if (m === null || !Number.isFinite(m)) return '—'
  return units.distance === 'ft' ? `${metresToFeet(m).toFixed(1)} ft` : `${m.toFixed(1)} m`
}

/** "Cape Henry" from "Cape Henry, VA (147)"; the number when the name is empty. */
export function shortBuoyName(b: OkBuoy): string {
  const n = b.buoy.name.replace(/\s*\(\d+\)\s*$/, '').replace(/,\s*[A-Z]{2}$/, '').trim()
  return n === '' ? `Buoy ${b.buoy.id}` : n
}

/** "~40 min", "~1 h 25 min". */
export function travelWords(minutes: number): string {
  const m = Math.round(minutes)
  if (m < 60) return `~${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r === 0 ? `~${h} h` : `~${h} h ${r} min`
}

export interface BuoyRow {
  b: OkBuoy
  leg: SwellTravel
}

/** The buoys that read, each with its leg to the spot, in the order they came (nearest first). */
export const buoyRows = (buoys: BuoyReading[] | null, venue: LatLon): BuoyRow[] =>
  (buoys ?? []).filter((b): b is OkBuoy => b.status === 'ok').map((b) => ({ b, leg: swellTravel(b.buoy.at, venue, b.periodS, b.fromDeg) }))

/** The biggest reading of the buoys shown (all on the water the beach faces, src/lib/buoy.ts); the nearer one on a tie. */
export function headlineRow(rows: BuoyRow[]): BuoyRow | null {
  return rows.reduce<BuoyRow | null>((best, r) => (best === null || r.b.waveM > best.b.waveM ? r : best), null)
}
