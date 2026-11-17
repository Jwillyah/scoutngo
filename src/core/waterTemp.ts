/*
 * THE WATER'S TEMPERATURE, FROM INSTRUMENTS ONLY (Batch FIX, Section 4).
 *
 * Until now only the Tide page said it, and from Open-Meteo Marine's sea
 * surface temperature: a model, not a measurement. Now one reading, picked
 * here by distance and age, and every screen that says it says this one:
 *
 *   1  a station on the water: NOAA CO-OPS (water_temperature) or an NDBC
 *      buoy (WTMP), the nearest with a reading under IN_SITU_MAX_AGE_MS,
 *      within STATION_KM of a spot on the sea (the map tiles' ocean within
 *      SURF_COAST_M), within RIVER_KM of any other spot;
 *   2  open sea with no station that close: the satellite, NASA JPL's MUR
 *      analysis (about 1 km, daily) through NOAA CoastWatch, the nearest
 *      cell with water within SAT_CELL_KM, said "satellite · yesterday";
 *   3  rivers: a USGS gauge reporting water temperature (parameter 00010)
 *      within RIVER_KM, said with the gauge's name;
 *   4  nothing measured: "No water temp here". Never from the air.
 *
 * Back Bay, Virginia Beach, is why the satellite asks for the sea: MUR's
 * land mask counts the bay as water, but its cells there read the ocean's
 * value to a few hundredths of a degree (14.84 °C against 14.82 °C a few km
 * off Sandbridge, 16 Nov, tests/data/water-2026-11-17), an analysis filled
 * in from the sea, not a measurement of a shallow bay. The map tiles say the
 * bay is not the ocean, so it gets no satellite value.
 *
 * Pure: the lists, the readings and the clock come in; nothing is fetched.
 * The wetsuit comes from the reading through src/core/wetsuit.ts.
 */
import { distanceMeters, type LatLon } from './geo.ts'
import { cToF, WETSUIT_BANDS } from './wetsuit.ts'

/** A station this close to a spot on the sea is the spot's water. */
export const STATION_KM = 15
/** A river gauge (or a station, away from the sea) this close. */
export const RIVER_KM = 5
/** The satellite's nearest cell with water, at most this far. */
export const SAT_CELL_KM = 3
/** A station's or gauge's reading older than this is not said. */
export const IN_SITU_MAX_AGE_MS = 6 * 3_600_000
/** The satellite's analysis day at most this many days back. */
export const SAT_MAX_AGE_DAYS = 3
/** How many stations of each list are asked. */
export const ASK_COUNT = 2
/** The satellite's grid: the cell asked is snapped to this (about 55 km), and the box reaches SST_BOX_DEG past it. */
export const SST_CELL_DEG = 0.5
export const SST_BOX_DEG = 0.3
/** Every second MUR cell: 0.02°, about 2 km. */
export const SST_STRIDE = 2

export type WaterKind = 'coops' | 'ndbc' | 'usgs' | 'satellite'

export interface WaterSite {
  kind: WaterKind
  /** The CO-OPS number, the NDBC buoy, the USGS site number, or "MUR". */
  id: string
  /** What the line calls it: "Sewells Point", "Buoy 44099", "Elizabeth Riv at Midtown Tunnel", "satellite". */
  name: string
  at: LatLon
  km: number
}

export interface WaterReading {
  site: WaterSite
  /** When it was measured (the satellite: its analysis day, 09:00 UTC). */
  at: Date
  /** °C. */
  c: number
}

type Listed = readonly (readonly [string, string, number, number])[]
type Buoys = readonly (readonly [string, number, number, string])[]

/** "ELIZABETH RIV AT MIDTOWN TUNNEL AT NORFOLK, VA" is said "Elizabeth Riv at Midtown Tunnel": the state and the last town go. */
export function gaugeName(raw: string): string {
  const head = raw.split(',')[0].replace(/\s+(?:AT|NEAR|NR)\s+(?:(?!\s(?:AT|NEAR|NR)\s)[A-Za-z .'-])+$/, '')
  const small = new Set(['at', 'near', 'nr', 'of', 'the', 'and', 'in', 'on', 'below', 'above', 'abv', 'blw'])
  return head
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
    .trim()
}

const near = (venue: LatLon, lat: number, lon: number) => Math.abs(lat - venue.lat) <= 0.4 && Math.abs(lon - venue.lon) <= 0.5

/**
 * The stations and gauges worth asking: NOAA's (CO-OPS and NDBC) within
 * `stationKm`, USGS's within RIVER_KM, each list nearest first, ASK_COUNT
 * of each. `stationKm` is STATION_KM on the sea, RIVER_KM elsewhere.
 */
export function sitesNear(venue: LatLon, coops: Listed, buoys: Buoys, usgs: Listed, stationKm: number): { stations: WaterSite[]; rivers: WaterSite[] } {
  const km = (lat: number, lon: number) => distanceMeters(venue, { lat, lon }) / 1000
  const stations: WaterSite[] = []
  for (const [id, name, lat, lon] of coops) {
    if (!near(venue, lat, lon)) continue
    const d = km(lat, lon)
    if (d <= stationKm) stations.push({ kind: 'coops', id, name: name.split(',')[0].trim(), at: { lat, lon }, km: d })
  }
  for (const [id, lat, lon] of buoys) {
    if (!near(venue, lat, lon)) continue
    const d = km(lat, lon)
    if (d <= stationKm) stations.push({ kind: 'ndbc', id, name: `Buoy ${id}`, at: { lat, lon }, km: d })
  }
  const rivers: WaterSite[] = []
  for (const [id, name, lat, lon] of usgs) {
    if (!near(venue, lat, lon)) continue
    const d = km(lat, lon)
    if (d <= RIVER_KM) rivers.push({ kind: 'usgs', id, name: gaugeName(name), at: { lat, lon }, km: d })
  }
  const order = (a: WaterSite, b: WaterSite) => a.km - b.km
  return { stations: stations.sort(order).slice(0, ASK_COUNT * 2), rivers: rivers.sort(order).slice(0, ASK_COUNT) }
}

/** Water between -3 and 40 °C: anything else is a sensor's fault, not the water. */
const plausible = (c: number) => Number.isFinite(c) && c >= -3 && c <= 40

/** Measured, and not older than IN_SITU_MAX_AGE_MS (nor from the future). */
export function freshInSitu(r: WaterReading | null, now: Date): r is WaterReading {
  if (r === null || !plausible(r.c)) return false
  const age = now.getTime() - r.at.getTime()
  return age <= IN_SITU_MAX_AGE_MS && age >= -10 * 60_000
}

/** The satellite's day, at most SAT_MAX_AGE_DAYS back. */
export function freshSatellite(r: WaterReading | null, now: Date): r is WaterReading {
  if (r === null || !plausible(r.c)) return false
  const age = now.getTime() - r.at.getTime()
  return age <= (SAT_MAX_AGE_DAYS + 1) * 86_400_000 && age >= -86_400_000
}

export interface WaterInputs {
  /** The map tiles' ocean within SURF_COAST_M: true, false, or null when not known. */
  ocean: boolean | null
  stations: readonly (WaterReading | null)[]
  satellite: WaterReading | null
  rivers: readonly (WaterReading | null)[]
}

const nearest = (list: readonly WaterReading[]) => [...list].sort((a, b) => a.site.km - b.site.km)[0] ?? null

/** The one reading the screens say, or null for "No water temp here". */
export function pickWater(input: WaterInputs, now: Date): WaterReading | null {
  const stations = input.stations.filter((r): r is WaterReading => freshInSitu(r, now))
  const rivers = input.rivers.filter((r): r is WaterReading => freshInSitu(r, now) && r.site.km <= RIVER_KM)
  if (input.ocean === false) return nearest([...stations.filter((r) => r.site.km <= RIVER_KM), ...rivers])
  const station = nearest(stations.filter((r) => r.site.km <= STATION_KM))
  if (station !== null) return station
  if (input.ocean === true && freshSatellite(input.satellite, now)) return input.satellite
  return nearest(rivers)
}

/* ------------------------------------------------------------- parsing */

/** CO-OPS's latest water_temperature, metric: {"data":[{"t":"2026-11-17 13:00","v":"13.8"}]}. */
export function parseCoopsWater(body: unknown, site: WaterSite): WaterReading | null {
  const row = (body as { data?: { t?: unknown; v?: unknown }[] } | null)?.data?.[0]
  if (row === undefined || typeof row.t !== 'string' || typeof row.v !== 'string' || row.v.trim() === '') return null
  const at = new Date(`${row.t.replace(' ', 'T')}:00Z`)
  const c = Number(row.v)
  return Number.isFinite(at.getTime()) && plausible(c) ? { site, at, c } : null
}

/** The buoy function's `water` ({"at":"2026-11-16T12:40:00Z","c":14.9}), from NDBC's WTMP. */
export function parseBuoyWater(body: unknown, site: WaterSite): WaterReading | null {
  const w = (body as { water?: { at?: unknown; c?: unknown } | null } | null)?.water
  if (w == null || typeof w.at !== 'string' || typeof w.c !== 'number') return null
  const at = new Date(w.at)
  return Number.isFinite(at.getTime()) && plausible(w.c) ? { site, at, c: w.c } : null
}

interface UsgsSeries {
  sourceInfo?: { siteCode?: { value?: string }[] }
  variable?: { noDataValue?: number }
  values?: { value?: { value?: string; dateTime?: string }[] }[]
}

/** USGS Water Services' instantaneous values (format=json): each asked site's newest reading. */
export function parseUsgsWater(body: unknown, sites: readonly WaterSite[]): WaterReading[] {
  const series = (body as { value?: { timeSeries?: UsgsSeries[] } } | null)?.value?.timeSeries ?? []
  const out: WaterReading[] = []
  for (const s of series) {
    const id = s.sourceInfo?.siteCode?.[0]?.value
    const site = sites.find((x) => x.id === id)
    if (site === undefined) continue
    const none = s.variable?.noDataValue
    let best: WaterReading | null = null
    for (const v of s.values ?? []) {
      for (const p of v.value ?? []) {
        const c = Number(p.value)
        const at = new Date(p.dateTime ?? '')
        if (!Number.isFinite(at.getTime()) || !plausible(c) || c === none) continue
        if (best === null || at.getTime() > best.at.getTime()) best = { site, at, c }
      }
    }
    if (best !== null && !out.some((r) => r.site.id === site.id)) out.push(best)
  }
  return out
}

/** The satellite's grid as the sst function hands it on: rows south to north, columns west to east. */
export interface SstGrid {
  /** The analysis day, "2026-11-16". */
  day: string
  lat0: number
  lon0: number
  step: number
  rows: (number | null)[][]
}

/** The cell asked for a spot: its latitude and longitude snapped to SST_CELL_DEG. Nothing finer leaves the phone. */
export function sstCell(at: LatLon): LatLon {
  const snap = (v: number) => Math.round(Math.round(v / SST_CELL_DEG) * SST_CELL_DEG * 10) / 10
  return { lat: snap(at.lat), lon: snap(at.lon) }
}

/** The nearest cell with water within SAT_CELL_KM, as a reading at its analysis day (09:00 UTC, MUR's time). */
export function nearestSst(grid: SstGrid, venue: LatLon): WaterReading | null {
  let best: { c: number; at: LatLon; km: number } | null = null
  grid.rows.forEach((row, i) =>
    row.forEach((c, j) => {
      if (c === null || !plausible(c)) return
      const at = { lat: Math.round((grid.lat0 + i * grid.step) * 1000) / 1000, lon: Math.round((grid.lon0 + j * grid.step) * 1000) / 1000 }
      if (Math.abs(at.lat - venue.lat) > 0.05 || Math.abs(at.lon - venue.lon) > 0.06) return
      const km = distanceMeters(venue, at) / 1000
      if (km <= SAT_CELL_KM && (best === null || km < best.km)) best = { c, at, km }
    }),
  )
  const day = new Date(`${grid.day}T09:00:00Z`)
  if (best === null || !Number.isFinite(day.getTime())) return null
  const b = best as { c: number; at: LatLon; km: number }
  return { site: { kind: 'satellite', id: 'MUR', name: 'satellite', at: b.at, km: b.km }, at: day, c: b.c }
}

/* --------------------------------------------------------------- words */

/** "Water 58° · 4/3" (°F) or "Water 14° · 4/3" (°C); "No water temp here" with no reading. */
export function waterHead(c: number | null, unit: 'F' | 'C'): string {
  if (c === null || !Number.isFinite(c)) return 'No water temp here'
  const suit = wetsuitWords(c)
  const deg = Math.round(unit === 'F' ? cToF(c) : c)
  return `Water ${deg}°${suit === null ? '' : ` · ${suit}`}`
}

/** The chart's suit for the measured water: the band of the whole degree said (57.9 °F is printed 58°, and 58° is 4/3, not "4/3 + booties"). */
export function wetsuitWords(c: number): string | null {
  const wholeF = Math.round(cToF(c))
  return WETSUIT_BANDS.find((b) => wholeF >= b.fromF)?.suit ?? null
}

/**
 * THE LENS FOG ROW'S WATER (Batch FIX, Section 4). Air whose dew point is
 * above the water's temperature is cooled past saturation over it, so fog
 * can form over the water (sea fog); at or under it, it cannot form that
 * way. A fact from two numbers, never an instruction: "water 54°F, under
 * the dew point: fog can form over it". `temp` writes a °C in the user's unit.
 */
export function waterFogWords(waterC: number, dewC: number, temp: (c: number) => string): string {
  return waterC < dewC ? `water ${temp(waterC)}, under the dew point: fog can form over it` : `water ${temp(waterC)}`
}

/** "20 min ago", "3 h ago". */
export function readingAge(at: Date, now: Date): string {
  const min = Math.max(0, Math.round((now.getTime() - at.getTime()) / 60_000))
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`
}

/** The satellite's day against the phone's: "today", "yesterday", "3 days ago". Both "YYYY-MM-DD". */
export function satelliteDay(day: string, today: string): string {
  const n = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000)
  if (!Number.isFinite(n)) return day
  return n <= 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`
}

/**
 * Where it is from, how far, how old: "Sewells Point · 9 km · 20 min ago",
 * "Buoy 44099 · 14 mi · 40 min ago", "satellite · yesterday".
 */
export function waterSource(r: WaterReading, now: Date, miles: boolean, today: string): string {
  if (r.site.kind === 'satellite') return `satellite · ${satelliteDay(r.at.toISOString().slice(0, 10), today)}`
  const far = miles ? r.site.km / 1.609344 : r.site.km
  const d = far < 1 ? `under 1 ${miles ? 'mi' : 'km'}` : `${Math.round(far)} ${miles ? 'mi' : 'km'}`
  return `${r.site.name} · ${d} · ${readingAge(r.at, now)}`
}
