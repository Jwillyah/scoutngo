/*
 * THE RECORDED SEA, AS THE PHONE HAD IT (Batch FIX, Section 3): the same
 * reading of tests/data/surf-* that scripts/measure-surf-fix.mjs does, for
 * the tests. Buoys: what NDBC had posted BUOY_LAG_MIN before the look, with
 * the spectral split /api/buoy sends; the station: Cape Henry (CO-OPS
 * 8638999) STATION_LAG_MIN before, carried to 10 m (src/core/stationWind.ts).
 */
import { readFileSync } from 'node:fs'
import { parseHourly, MARINE_NAMES, BRIEF_WIND_NAMES, type Hourly } from '../src/lib/tideSheetData.ts'
import { beachFactorAt } from '../src/core/beachFactor.ts'
import { normalizeWind } from '../src/core/stationWind.ts'
import { jettyOf } from '../src/core/jettyFactor.ts'
import { SURF_SPOTS } from '../src/data/surfSpots.ts'
import type { BuoyReading } from '../src/lib/buoy.ts'
import type { SurfSea } from '../src/lib/useSurfSea.ts'
import type { StationObs } from '../src/core/nowcast.ts'

export const BUOY_LAG_MIN = 20
export const STATION_LAG_MIN = 6
export const TZ = 'America/New_York'
const KT = 0.514444
const num = (x: string | undefined) => (x === undefined || x === 'MM' ? null : Number(x))
const stamp = (f: string[]) => new Date(`${f[0]}-${f[1]}-${f[2]}T${f[3]}:${f[4]}:00Z`)

export interface Place {
  name: string
  id: string | null
  at: { lat: number; lon: number }
  facing: number
}
export const VB: Place = { name: 'VB', id: null, at: { lat: 36.83, lon: -75.97 }, facing: 100 }
export const spotPlace = (id: string): Place => {
  const s = SURF_SPOTS.find((x) => x.id === id)
  if (s === undefined) throw new Error(`no listed spot ${id}`)
  return { name: s.name, id, at: s.at, facing: s.facing as number }
}

export function recordedDay(dir: string): { marine: Hourly; wind: Hourly; buoyAt: (id: string, t: Date) => BuoyReading | null } {
  const marine = parseHourly(JSON.parse(readFileSync(`${dir}/marine.json`, 'utf8')), MARINE_NAMES)
  const wind = parseHourly(JSON.parse(readFileSync(`${dir}/wind.json`, 'utf8')), BRIEF_WIND_NAMES)
  if (marine === null || wind === null) throw new Error(`${dir}: the recorded forecast did not parse`)
  const rows = (b: string, ext: string) => readFileSync(`${dir}/${b}.${ext}`, 'utf8').split('\n').filter((l) => !l.startsWith('#') && l.trim() !== '').map((l) => l.trim().split(/\s+/))
  const buoyAt = (id: string, t: Date): BuoyReading | null => {
    const f = rows(id, 'txt').filter((r) => stamp(r).getTime() <= t.getTime() - BUOY_LAG_MIN * 60_000 && r[8] !== 'MM').sort((a, b) => stamp(b).getTime() - stamp(a).getTime())[0]
    if (f === undefined) return null
    const s = rows(id, 'spec').find((g) => stamp(g).getTime() === stamp(f).getTime())
    const split = s === undefined ? null : { swellM: num(s[6]), swellS: num(s[7]), windWaveM: num(s[8]), windWaveS: num(s[9]), swellFrom: s[10] === 'MM' ? null : s[10], windWaveFrom: s[11] === 'MM' ? null : s[11] }
    return { status: 'ok', buoy: { id, name: id, at: { lat: 0, lon: 0 }, km: 0 }, at: stamp(f), waveM: Number(f[8]), periodS: num(f[9]), fromDeg: num(f[11]), split }
  }
  return { marine, wind, buoyAt }
}

/** The sea the phone holds at `t` for a place: the recorded forecast, the three buoys, the region's factor times a jetty's. */
export function seaAt(day: ReturnType<typeof recordedDay>, place: Place, t: Date): SurfSea {
  const j = place.id === null ? null : jettyOf(place.id)
  const buoys = ['44099', '44014', '44100'].map((id) => day.buoyAt(id, t)).filter((b): b is BuoyReading => b !== null)
  return { status: 'ready', facingState: 'ok', marine: day.marine, wind: day.wind, facing: place.facing, buoy: buoys.find((b) => b.status === 'ok' && b.buoy.id === '44099') ?? null, buoys, factor: beachFactorAt(place.at) * (j?.sizeFactor ?? 1), shelter: j?.shelter ?? null }
}

const capeHenry = JSON.parse(readFileSync('tests/data/surf-2026-11-17/8638999-wind.json', 'utf8')) as { data: { t: string; s: string; d: string; g: string }[] }

/** Cape Henry's report the phone had at `t`, carried to 10 m over a beach facing `facing`; its raw knots beside it. */
export function capeHenryAt(t: Date, facing: number): { obs: StationObs; rawKt: number; fromDeg: number } | null {
  const r = capeHenry.data
    .map((x) => ({ at: new Date(`${x.t.replace(' ', 'T')}:00Z`), kt: Number(x.s), g: Number(x.g), d: Number(x.d) }))
    .filter((x) => Number.isFinite(x.kt) && x.at.getTime() <= t.getTime() - STATION_LAG_MIN * 60_000)
    .sort((a, b) => b.at.getTime() - a.at.getTime())[0]
  if (r === undefined) return null
  const n = normalizeWind({ id: '8638999', kind: 'coastal', mps: r.kt * KT, gustMps: r.g > r.kt ? r.g * KT : null, fromDeg: r.kt === 0 ? null : r.d }, facing)
  return { obs: { at: r.at, mps: n.mps, fromDeg: r.kt === 0 ? null : r.d, gustMps: n.gustMps }, rawKt: r.kt, fromDeg: r.d }
}
