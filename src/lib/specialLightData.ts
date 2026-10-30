/*
 * THE NUMBERS BEHIND SPECIAL LIGHT, fetched; the rules are
 * src/core/specialLight.ts.
 *
 * WHAT LEAVES THE PHONE. To Open-Meteo: nine points (the venue and eight
 * 25 km round it, for showers nearby), each rounded to 2 decimals, and five
 * model names, for the week. The sea temperature from Open-Meteo Marine for
 * the venue, as the Tide sheet already asks. No key.
 */
import destination from '@turf/destination'
import { getPosition, getTimes } from 'suncalc'
import type { LatLon } from '../core/geo.ts'
import { antisolar, bowHalfWidthDeg, fogRule, godRaysRule, rainbowRule, windows, fToC, type Special } from '../core/specialLight.ts'
import { roundCoord } from '../core/skyFire.ts'
import { OPEN_METEO_URL, TIMEOUT_MS } from './forecast.ts'
import { fetchMarine, fetchMonthExtremes, fetchWindMonth, hourlyAt } from './tideSheetData.ts'
import { fetchStations } from './noaa.ts'
import { nearestStations } from '../core/tide.ts'
import { glassMornings } from '../core/glassMornings.ts'

export const SPECIAL_MODELS = ['gfs_seamless', 'ecmwf_ifs025', 'icon_seamless', 'gem_seamless', 'gfs_hrrr'] as const
export const SHOWER_RING_KM = 25
export const SPECIAL_DAYS = 7
const VARS = ['temperature_2m', 'dew_point_2m', 'wind_speed_10m', 'cloud_cover_low', 'showers'] as const
type Var = (typeof VARS)[number]

/** The venue first, then eight points SHOWER_RING_KM round it. */
export function specialPoints(at: LatLon): LatLon[] {
  const ring = Array.from({ length: 8 }, (_, i) => {
    const p = destination([at.lon, at.lat], SHOWER_RING_KM, i * 45, { units: 'kilometers' }).geometry.coordinates
    return { lat: p[1], lon: p[0] }
  })
  return [at, ...ring].map((p) => ({ lat: roundCoord(p.lat), lon: roundCoord(p.lon) }))
}

export function specialUrl(at: LatLon): string {
  const pts = specialPoints(at)
  const params = new URLSearchParams({
    latitude: pts.map((p) => p.lat.toFixed(2)).join(','),
    longitude: pts.map((p) => p.lon.toFixed(2)).join(','),
    hourly: VARS.join(','),
    models: SPECIAL_MODELS.join(','),
    forecast_days: String(SPECIAL_DAYS),
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'kn',
    timezone: 'GMT',
  })
  return `${OPEN_METEO_URL}?${params.toString()}`
}

export interface SpecialWeek {
  hours: Date[]
  /** series[model][point][var][hour] */
  series: Record<string, (Record<Var, (number | null)[]>)[]>
}

export function parseSpecial(payload: unknown): SpecialWeek | null {
  const locations = Array.isArray(payload) ? payload : [payload]
  const hourly = locations.map((l) => (l as { hourly?: Record<string, unknown> })?.hourly)
  const time = hourly[0]?.time
  if (!Array.isArray(time) || hourly.some((h) => h === undefined)) return null
  const series: SpecialWeek['series'] = {}
  for (const m of SPECIAL_MODELS) {
    const perPoint = hourly.map((h) =>
      Object.fromEntries(
        VARS.map((v) => {
          const list = (h as Record<string, unknown>)[`${v}_${m}`]
          return [v, Array.isArray(list) ? list.map((x) => (typeof x === 'number' && Number.isFinite(x) ? x : null)) : time.map(() => null)]
        }),
      ) as Record<Var, (number | null)[]>,
    )
    if (perPoint[0].temperature_2m.some((x) => x !== null)) series[m] = perPoint
  }
  return { hours: (time as string[]).map((t) => new Date(`${t}:00Z`)), series }
}

const f0 = (x: number | null) => (x === null ? '–' : Math.round(x).toString())

/**
 * Fog, rainbow and god-ray windows over the week, by model agreement. A
 * window is kept only when some of it is in daylight or twilight (sun above
 * −6°): fog at 3 AM that has burned off by dawn is not something to plan for.
 */
export function specialsFrom(week: SpecialWeek, venue: LatLon, seaCAt: (t: Date) => number | null): Special[] {
  const models = Object.keys(week.series)
  const sun = week.hours.map((t) => getPosition(t, venue.lat, venue.lon).altitude)
  const at = (m: string, p: number, v: Var, h: number) => week.series[m][p][v][h] ?? null
  const showersNear = (m: string, h: number) => {
    const all = week.series[m].map((pt) => pt.showers[h]).filter((x): x is number => x !== null)
    return all.length === 0 ? null : Math.max(...all)
  }
  const fog = models.map((m) => week.hours.map((t, h) => fogRule({ tempF: at(m, 0, 'temperature_2m', h), dewF: at(m, 0, 'dew_point_2m', h), windKt: at(m, 0, 'wind_speed_10m', h), seaC: seaCAt(t) })))
  const rain = models.map((m) => week.hours.map((_, h) => rainbowRule(sun[h], showersNear(m, h))))
  const rays = models.map((m) => week.hours.map((_, h) => godRaysRule(sun[h], at(m, 0, 'cloud_cover_low', h))))
  const median = (v: Var, h: number, p = 0) => {
    const xs = models.map((m) => at(m, p, v, h)).filter((x): x is number => x !== null).sort((a, b) => a - b)
    return xs.length === 0 ? null : xs[Math.floor(xs.length / 2)]
  }
  const fogWhy = (h: number) => {
    const t = median('temperature_2m', h)
    const d = median('dew_point_2m', h)
    const sea = seaCAt(week.hours[h])
    return `Dew point ${f0(d)}°F against air ${f0(t)}°F, wind ${f0(median('wind_speed_10m', h))} kt${sea === null ? ', inland: radiation fog' : `, sea ${f0((sea * 9) / 5 + 32)}°F under the air${t !== null && sea >= fToC(t) ? ' (not today)' : ''}`}.`
  }
  const rainWhy = (h: number) => `Showers within ${SHOWER_RING_KM} km and the sun ${Math.round(sun[h])}° up: the bow stands opposite the sun.`
  const raysWhy = (h: number) => `Low cloud ${f0(median('cloud_cover_low', h))}%, broken, with the sun ${Math.round(sun[h])}° up behind it.`
  const lit = (s: Special) => week.hours.some((t, h) => t >= s.from && t < s.to && sun[h] > -6)
  return [...windows('fog', week.hours, fog, fogWhy), ...windows('rainbow', week.hours, rain, rainWhy), ...windows('rays', week.hours, rays, raysWhy)].filter(lit)
}

export async function fetchSpecialWeek(venue: LatLon, fetchImpl: typeof fetch = fetch): Promise<{ week: SpecialWeek; seaCAt: (t: Date) => number | null } | null> {
  try {
    const [response, sea] = await Promise.all([fetchImpl(specialUrl(venue), { signal: AbortSignal.timeout(TIMEOUT_MS * 2) }), fetchMarine(venue).catch(() => null)])
    if (!response.ok) return null
    const week = parseSpecial(await response.json())
    if (week === null) return null
    return { week, seaCAt: (t) => (sea === null ? null : hourlyAt(sea.value, 'sea_surface_temperature', t)) }
  } catch {
    return null
  }
}

/**
 * THE BOW ON THE MAP: an arc on the ground BOW_RADIUS_KM from the venue, from
 * one foot of the bow to the other, centred on the bearing opposite the sun.
 * Where the rain is decides how far away the bow stands; this marks its
 * direction and its width on the horizon (bowHalfWidthDeg).
 */
export const BOW_RADIUS_KM = 3
export function bowOnMap(venue: LatLon, sun: { azimuth: number; altitude: number }): GeoJSON.FeatureCollection {
  const half = bowHalfWidthDeg(sun.altitude)
  if (half === null) return { type: 'FeatureCollection', features: [] }
  const centre = antisolar(sun).azimuth
  const coords: [number, number][] = []
  for (let a = -half; a <= half + 1e-9; a += Math.max(1, half / 30)) {
    const p = destination([venue.lon, venue.lat], BOW_RADIUS_KM, ((centre + a + 540) % 360) - 180, { units: 'kilometers' }).geometry.coordinates
    coords.push([p[0], p[1]])
  }
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { kind: 'rainbow' }, geometry: { type: 'LineString', coordinates: coords } }] }
}

/*
 * GLASSY WATER, from the same rules as the Tide sheet's glass mornings
 * (src/core/glassMornings.ts): a low tide within 90 minutes of sunrise and a
 * light wind at sunrise. The tide is astronomy; the wind is one forecast, and
 * the line says so.
 */
export async function fetchGlassWeek(venue: LatLon, from: Date): Promise<Special[]> {
  const stations = await fetchStations()
  if (stations.status !== 'ok') return []
  const near = nearestStations(venue, stations.stations, 1)[0]
  if (near === undefined || near.proximity === 'none') return []
  const [month, wind] = await Promise.all([fetchMonthExtremes(near.station.id, new Date(from.getTime() - 86_400_000)), fetchWindMonth(venue)])
  if (month === null) return []
  const days = Array.from({ length: SPECIAL_DAYS }, (_, i) => {
    const d = new Date(from.getTime() + i * 86_400_000)
    return { date: d.toISOString().slice(0, 10), sunrise: getTimes(new Date(d.getTime() + 12 * 3_600_000), venue.lat, venue.lon).sunrise ?? null }
  })
  const windAt = (t: Date) => {
    if (wind === null) return null
    const speedMps = hourlyAt(wind.value, 'wind_speed_10m', t)
    const fromDeg = hourlyAt(wind.value, 'wind_direction_10m', t)
    return speedMps === null || fromDeg === null ? null : { speedMps, fromDeg }
  }
  const lows = month.value.filter((e) => e.kind === 'low').map((e) => e.at)
  return glassMornings(days, lows, windAt, null)
    .filter((m) => (m.mark === 'glass' || m.mark === 'surf-glass') && m.sunrise !== null && m.sunrise.getTime() > from.getTime() - 3_600_000)
    .map((m) => ({
      kind: 'glass' as const,
      from: new Date((m.sunrise as Date).getTime() - 30 * 60_000),
      to: new Date((m.sunrise as Date).getTime() + 60 * 60_000),
      agree: 1,
      of: 1,
      word: 'possible' as const,
      why: `Low tide ${Math.abs(m.minutesFromSunrise ?? 0)} min ${(m.minutesFromSunrise ?? 0) < 0 ? 'before' : 'after'} sunrise at ${near.station.name}, and a light wind in Open-Meteo’s forecast.`,
    }))
}
