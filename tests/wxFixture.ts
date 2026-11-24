/*
 * THE 21-24 NOV VIRGINIA BEACH RECORDING, READ BACK (Batch SIMPLE-3, Sections
 * 1, 1b, 1c). scripts/capture-fog-fixtures.mjs fetched it once;
 * measurements/2026-11-24-fog-fixtures.md has the run. Every reader here
 * replays a moment: only the station reports made by then are handed over,
 * as the phone would have had them.
 */
import { existsSync, readFileSync } from 'node:fs'
import { distanceMeters, type LatLon } from '../src/core/geo.ts'
import { stationFog, type FogModelHour, type FogSpot, type FogStation } from '../src/core/fogRisk.ts'
import type { RainStation } from '../src/core/rainNow.ts'
import { parseHourly, parseQuarters, type Hourly } from '../src/lib/tideSheetData.ts'
import { fogModelHours } from '../src/lib/fogInputs.ts'
import { fetchGrid, fetchRadar, type Radar } from '../src/lib/stormData.ts'
import type { Grid } from '../src/core/stormCells.ts'

export const DIR = 'tests/data/wx-2026-11-21-24-vb'
export const TZ = 'America/New_York'
export const BEACH = { name: 'Atlantic Park Surf', lat: 36.851, lon: -75.98, facing: 100 }
export const INLAND = { name: 'Chesapeake (inland)', lat: 36.7, lon: -76.3, facing: null }
export type Place = typeof BEACH | typeof INLAND

const NAMES = ['temperature_2m', 'dew_point_2m', 'visibility', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m', 'wind_speed_120m', 'wind_direction_120m', 'wind_speed_500hPa', 'wind_direction_500hPa', 'weather_code', 'precipitation', 'cloud_cover', 'cloud_cover_low', 'cloud_cover_mid', 'cloud_cover_high', 'precipitation_probability'] as const

const raw = (p: Place) => JSON.parse(readFileSync(`${DIR}/open-meteo-${p === BEACH ? 'beach' : 'inland'}.json`, 'utf8')) as { payload: unknown }

/** The archived forecast at the place, as the brief's Hourly. */
export function hourlyOf(p: Place): Hourly {
  const h = parseHourly(raw(p).payload, NAMES)
  if (h === null) throw new Error(`no hourly in ${DIR} for ${p.name}`)
  return h
}

export function quartersOf(p: Place) {
  const q = parseQuarters(raw(p).payload)
  if (q === null) throw new Error(`no minutely_15 in ${DIR} for ${p.name}`)
  return q
}

/** The model's hours for the fog rules. */
export function fogHoursOf(p: Place): FogModelHour[] {
  return fogModelHours(hourlyOf(p))
}

/** The beach's water at `at`: Open-Meteo Marine's sea surface, the app's source there (no station within 15 km, src/core/waterTemp.ts). */
export function waterAt(at: Date): number | null {
  const m = JSON.parse(readFileSync(`${DIR}/marine-beach.json`, 'utf8')) as { payload: { hourly: { time: string[]; sea_surface_temperature: (number | null)[] } } }
  const i = m.payload.hourly.time.indexOf(new Date(Math.round(at.getTime() / 3_600_000) * 3_600_000).toISOString().slice(0, 16))
  return i < 0 ? null : m.payload.hourly.sea_surface_temperature[i]
}

interface Metar {
  id: string
  at: LatLon
  raw: string
  valid: Date
}

/** Every METAR in the recording: KNTU, KORF, KNFE, KCPK, KPVG. */
export function metars(): Metar[] {
  const lines = readFileSync(`${DIR}/asos.csv`, 'utf8').trim().split('\n')
  const head = lines[0].split(',')
  const col = (n: string) => head.indexOf(n)
  return lines.slice(1).map((l) => {
    const c = l.split(',')
    return { id: `K${c[col('station')]}`, at: { lat: Number(c[col('lat')]), lon: Number(c[col('lon')]) }, raw: c[col('metar')], valid: new Date(`${c[col('valid')].replace(' ', 'T')}:00Z`) }
  })
}

const km = (a: LatLon, b: LatLon) => distanceMeters(a, b) / 1000

/** The airports' reports made by `now`, for the fog rules (none of them on the water). */
export function fogStations(p: Place, now: Date): FogStation[] {
  return metars()
    .filter((m) => m.valid.getTime() <= now.getTime())
    .map((m) => stationFog(m.raw, { id: m.id, km: km(p, m.at), onWater: false }, now))
    .filter((s): s is FogStation => s !== null)
}

export function rainStations(p: Place, now: Date): RainStation[] {
  return fogStations(p, now).map((s) => ({ id: s.id, km: s.km, at: s.at, wx: s.wx }))
}

/** The fog spot at the place as the phone would have it at `now`. */
export function fogSpot(p: Place, now: Date): FogSpot {
  return { lat: p.lat, lon: p.lon, facingDeg: p.facing, waterC: p.facing === null ? null : waterAt(now), hours: fogHoursOf(p), stations: fogStations(p, now) }
}

/** Cape Henry's 6-minute wind, knots, FROM. */
export function capeHenry(): { at: Date; kt: number; gustKt: number | null; fromDeg: number }[] {
  const j = JSON.parse(readFileSync(`${DIR}/coops-8638999-wind.json`, 'utf8')) as { payload: { data: { t: string; s: string; d: string; g: string }[] } }
  return j.payload.data.map((d) => ({ at: new Date(`${d.t.replace(' ', 'T')}:00Z`), kt: Number(d.s), gustKt: d.g === '' ? null : Number(d.g), fromDeg: Number(d.d) }))
}

/* ------------------------------------------------------------- radar */

const local = (async (u: string) => {
  const m = /N0Q-(\d{12})\/7\/(\d+)\/(\d+)\.png$/.exec(String(u))
  /* The scans after 11:14 PM were recorded as the centre tile only, for checking the nowcast (`truth-` files). */
  const f = m === null ? '' : [`${DIR}/radar/${m[1]}-${m[2]}-${m[3]}.png`, `${DIR}/radar/truth-${m[1]}-${m[2]}-${m[3]}.png`].find((x) => existsSync(x)) ?? ''
  return f !== '' ? new Response(readFileSync(f)) : new Response('', { status: 404 })
}) as typeof fetch

/** The app's own radar read (src/lib/stormData.ts fetchRadar) of the recorded scans ending at `scanAt`. */
export const radarAt = (p: LatLon, scanAt: Date): Promise<Radar | null> => fetchRadar(p, local, scanAt)
/** The newest scan's grid round the place. */
export const gridAt = (p: LatLon, scanAt: Date): Promise<Grid | null> => fetchGrid(p, scanAt, local)
