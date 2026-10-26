/*
 * Cloud forecast from Open-Meteo.
 *
 * Open-Meteo is free, needs no key, and asks for no account, which is why it is
 * used here: adding a key would break the "bring your own key, and only one"
 * promise in README.md.
 *
 * WHAT LEAVES THE DEVICE. A list of coordinates along the sightlines and the date
 * of the shoot. That is a fourth thing on the privacy list in README.md, and it
 * is the same category of disclosure as the map tiles: a set of points near the
 * venue. It happens only when a plan exists and a position is opened.
 *
 * NEVER THROUGH THE MODEL. A language model asked about cloud cover is guessing,
 * and a guess in the shape of a forecast is worse than no forecast at all. The
 * numbers here come from a weather model over HTTP, and the arithmetic over them
 * is in src/core/cloud.ts.
 */

import {
  sightlineSamplePoints,
  summariseSightline,
  type CloudSample,
  type SightlineCloud,
} from '../core/cloud.ts'
import type { LatLon } from '../core/geo.ts'
import type { Wind } from '../core/upwind.ts'
import { WIND_LEVELS_METERS, type LevelWind } from '../core/windProfile.ts'
import { cellCover, cloudGridPoints } from '../core/cloudGrid.ts'

export const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast'
export const TIMEOUT_MS = 8000

/**
 * How far ahead the forecast is worth trusting. Open-Meteo serves 16 days; past
 * dates come back as recorded reanalysis rather than a forecast, which is a
 * different claim and is labelled differently.
 */
export const FORECAST_HORIZON_DAYS = 16

export type ForecastKind = 'forecast' | 'recorded'

export interface SightlineRequest {
  id: string
  from: LatLon
  /** Compass bearing from the position toward its subject. */
  bearing: number
}

export interface SightlineForecast {
  id: string
  cloud: SightlineCloud
}

export type ForecastResult =
  | {
      status: 'ok'
      kind: ForecastKind
      /** The hour actually used, as the API reported it. */
      hour: string
      sightlines: SightlineForecast[]
    }
  | { status: 'unavailable'; reason: string }

/**
 * THE VENUE'S OWN CALENDAR DATE AND HOUR for an instant.
 *
 * THE BUG THIS REPLACES. The date range was `toISOString().slice(0, 10)`, the
 * UTC date. On the US east coast every instant after 20:00 EDT is already
 * tomorrow in UTC, so an evening shoot asked Open-Meteo for the wrong day,
 * found no row for its hour, and silently read 00:00 of that wrong day
 * instead. The wanted hour was matched on the DEVICE's clock as well, which
 * is a second wrong answer for a phone in another zone from the venue.
 *
 * Open-Meteo is asked in the venue's zone and answers in local wall-clock
 * stamps with no offset, so both the date asked for and the hour looked up
 * have to be that same wall clock. One function for both, so they cannot
 * disagree.
 */
export function venueClock(at: Date, timeZone: string): { date: string; hour: string } {
  const parts = Object.fromEntries(
    // clock-audit: data, the forecast's own hourly key ("2026-10-25T17"), never shown
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23', // clock-audit: data, the same key
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  )
  const date = `${parts.year}-${parts.month}-${parts.day}`
  return { date, hour: `${date}T${parts.hour}` }
}

/** Whole days from today to the shoot, negative for a date already past. */
export function daysAhead(at: Date, now: Date = new Date()): number {
  const day = 86_400_000
  const a = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate())
  const b = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.round((a - b) / day)
}

export function forecastKind(at: Date, now: Date = new Date()): ForecastKind {
  return daysAhead(at, now) < 0 ? 'recorded' : 'forecast'
}

interface OpenMeteoPoint {
  hourly?: {
    time?: unknown
    cloud_cover_low?: unknown
    cloud_cover_mid?: unknown
    cloud_cover_high?: unknown
  }
}

/*
 * MISSING IS NOT ZERO.
 *
 * This returned 0 for an absent value, which for a cloud percentage reads as
 * "clear sky". That is the same mistake as a coordinate falling back to Null
 * Island, a drone's slant range reading 0m, and a lens standing in for a drone
 * camera: a confident claim synthesised out of an absence. It does not matter
 * that Open-Meteo rarely omits an hour inside the day it was asked for. The
 * test is whether the app can state something false, and "0% cloud, clear" is
 * the most optimistic lie available about a shoot.
 *
 * Absent stays absent, and every caller has to decide what to do about it.
 */
const numberOrNull = (list: unknown, index: number): number | null => {
  if (!Array.isArray(list)) return null
  const value = list[index]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * The index of the hour closest to the shoot time.
 *
 * Open-Meteo is asked for the venue's own timezone, so its `time` strings are
 * local wall clock without an offset. Comparing them as wall clock is therefore
 * correct, and is why the hour is matched on the string rather than on a Date.
 */
export function hourIndexFor(times: string[], venueHour: string): number {
  const exact = times.indexOf(venueHour)
  if (exact !== -1) return exact
  // Fall back to the same hour on the first day, then to the middle of the day.
  const hh = venueHour.slice(11, 13)
  const sameHour = times.findIndex((t) => t.slice(11, 13) === hh)
  return sameHour !== -1 ? sameHour : Math.min(12, Math.max(0, times.length - 1))
}

const cache = new Map<string, ForecastResult>()

export function clearForecastCache(): void {
  cache.clear()
}

/**
 * Cloud along every sightline, in one request.
 *
 * Open-Meteo takes comma separated coordinates and answers with one object per
 * point, so six positions at five distances is a single call rather than thirty.
 */
export async function fetchSightlineCloud(
  sightlines: SightlineRequest[],
  at: Date,
  timeZone: string,
  now: Date = new Date(),
): Promise<ForecastResult> {
  if (sightlines.length === 0) {
    return { status: 'unavailable', reason: 'No positions to forecast for.' }
  }

  const ahead = daysAhead(at, now)
  if (ahead > FORECAST_HORIZON_DAYS) {
    return {
      status: 'unavailable',
      reason: `That date is ${ahead} days out. Forecasts only run ${FORECAST_HORIZON_DAYS} days ahead.`,
    }
  }

  const points = sightlines.flatMap((line) =>
    sightlineSamplePoints(line.from, line.bearing).map((p) => ({ id: line.id, ...p })),
  )

  const { date, hour: localHour } = venueClock(at, timeZone)
  const key = `${date}|${timeZone}|${points
    .map((p) => `${p.at.lat.toFixed(3)},${p.at.lon.toFixed(3)}`)
    .join(';')}`
  const hit = cache.get(key)
  if (hit !== undefined) return hit

  const params = new URLSearchParams({
    latitude: points.map((p) => p.at.lat.toFixed(4)).join(','),
    longitude: points.map((p) => p.at.lon.toFixed(4)).join(','),
    /*
     * CLOUD AND WIND IN ONE REQUEST. The grid is 25 points and Open-Meteo is a
     * free service, so asking twice for the same 25 points because somebody
     * flipped a picker would be the rude way to build this. One request
     * carries both layers and the picker is then a repaint.
     */
    hourly: [
      'cloud_cover_low',
      'cloud_cover_mid',
      'cloud_cover_high',
      ...WIND_LEVELS_METERS.map((m) => `wind_speed_${m}m`),
      ...WIND_LEVELS_METERS.map((m) => `wind_direction_${m}m`),
    ].join(','),
    start_date: date,
    end_date: date,
    timezone: timeZone,
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(`${OPEN_METEO_URL}?${params.toString()}`, {
      signal: controller.signal,
    })
    if (!response.ok) {
      return { status: 'unavailable', reason: `Open-Meteo returned HTTP ${response.status}.` }
    }

    const payload = (await response.json()) as OpenMeteoPoint | OpenMeteoPoint[]
    // One coordinate comes back as an object; several come back as an array.
    const list = Array.isArray(payload) ? payload : [payload]
    if (list.length !== points.length) {
      return { status: 'unavailable', reason: 'Open-Meteo returned an unexpected shape.' }
    }

    const times = (list[0]?.hourly?.time as string[] | undefined) ?? []
    if (times.length === 0) {
      return { status: 'unavailable', reason: 'Open-Meteo returned no hours for that date.' }
    }
    const venueHour = `${localHour}:00`
    const index = hourIndexFor(times, venueHour)

    const byId = new Map<string, CloudSample[]>()
    points.forEach((point, i) => {
      const hourly = list[i]?.hourly
      const sample: CloudSample = {
        distanceKm: point.distanceKm,
        low: numberOrNull(hourly?.cloud_cover_low, index),
        mid: numberOrNull(hourly?.cloud_cover_mid, index),
        high: numberOrNull(hourly?.cloud_cover_high, index),
      }
      const existing = byId.get(point.id)
      if (existing === undefined) byId.set(point.id, [sample])
      else existing.push(sample)
    })

    const result: ForecastResult = {
      status: 'ok',
      kind: forecastKind(at, now),
      hour: times[index] ?? venueHour,
      sightlines: sightlines.map((line) => ({
        id: line.id,
        cloud: summariseSightline(byId.get(line.id) ?? []),
      })),
    }
    cache.set(key, result)
    return result
  } catch (error) {
    return {
      status: 'unavailable',
      reason:
        error instanceof Error && error.name === 'AbortError'
          ? 'The cloud forecast timed out.'
          : 'Could not reach the cloud forecast.',
    }
  } finally {
    clearTimeout(timer)
  }
}

/*
 * WIND AT THE VENUE.
 *
 * Separate from the sightline cloud above, which samples along each position's
 * own bearing and is per position. Wind is one reading at one place, and two
 * things want it: a drone pilot, for whom wind speed and gusts decide whether
 * the aircraft goes up at all, and the upwind ranking in src/core/upwind.ts,
 * which needs the direction to work out which camera is showing what is coming.
 *
 * SAME PROVIDER, SAME DISCLOSURE. Open-Meteo, keyless, already named in the
 * README privacy section for the cloud forecast. One coordinate goes out, the
 * venue's, which is the one it already sends.
 */
export type WindResult =
  | {
      status: 'ok'
      /** Ground wind, which is what every other weather app shows. */
      wind: Wind
      /**
       * All four heights Open-Meteo serves, for interpolating to a flight
       * altitude in src/core/windProfile.ts. A level the model did not fill in
       * arrives null rather than zero.
       */
      levels: LevelWind[]
      /**
       * The gust, AT TEN METRES ONLY. Open-Meteo serves no gust above the
       * surface: wind_gusts_180m is rejected as an invalid variable. So the
       * panel labels it as a surface gust rather than implying it is the gust
       * at altitude.
       */
      gustMps: number | null
      at: Date
    }
  | { status: 'unavailable'; reason: string }

interface WindRow {
  time?: unknown
  wind_gusts_10m?: unknown
  [key: string]: unknown
}

/** Open-Meteo reports km/h by default; everything in core is metres per second. */
const KMH_TO_MPS = 1 / 3.6

export function parseWind(payload: unknown, at: Date, timeZone: string): WindResult {
  const hourly = (payload as { hourly?: WindRow } | null)?.hourly
  const times = Array.isArray(hourly?.time) ? (hourly.time as string[]) : []
  if (times.length === 0) return { status: 'unavailable', reason: 'No wind in the response.' }

  /*
   * The hour the shoot is in, not the first hour of the day. Open-Meteo
   * returns local wall-clock stamps for the timezone asked for, so these are
   * compared as text against the same hour rendered the same way.
   */
  const wanted = venueClock(at, timeZone).hour
  const row = times.findIndex((t) => t.startsWith(wanted))
  /*
   * NO ROW FOR THE HOUR IS NOT THE FIRST ROW. This used to fall back to row 0,
   * which is how an evening shoot was handed midnight's wind as its own.
   */
  if (row === -1) {
    return { status: 'unavailable', reason: `The forecast has no row for ${wanted.slice(11)}:00.` }
  }

  const levels: LevelWind[] = WIND_LEVELS_METERS.map((heightMeters) => {
    const speed = numberOrNull(hourly?.[`wind_speed_${heightMeters}m`], row)
    const direction = numberOrNull(hourly?.[`wind_direction_${heightMeters}m`], row)
    return {
      heightMeters,
      speedMps: speed === null ? null : speed * KMH_TO_MPS,
      fromDegrees: direction,
    }
  })

  const ground = levels[0]
  if (ground.speedMps === null || ground.fromDegrees === null) {
    return { status: 'unavailable', reason: 'Wind was missing for that hour.' }
  }
  const gust = numberOrNull(hourly?.wind_gusts_10m, row)

  return {
    status: 'ok',
    wind: { fromDegrees: ground.fromDegrees, speedMps: ground.speedMps },
    levels,
    gustMps: gust === null ? null : gust * KMH_TO_MPS,
    at: new Date(times[row]),
  }
}

/* -------------------------------------------------- cloud at the venue */

const VENUE_CLOUD_VARIABLES = [
  'cloud_cover',
  'cloud_cover_low',
  'cloud_cover_mid',
  'cloud_cover_high',
] as const

/** Cloud over the venue for one hour. Every layer may be absent; absent is not clear. */
export interface VenueCloud {
  at: Date
  totalPercent: number | null
  low: number | null
  mid: number | null
  high: number | null
}

/**
 * The cloud at the venue for the hour the shoot is in, out of the venue day.
 *
 * Null when the day carries no cloud at all, which is what a day saved before
 * cloud was asked for looks like. Same hour rule as parseWind, on purpose:
 * one rule for which row is "now", not two that can pick different hours.
 */
export function parseVenueCloud(
  payload: unknown,
  at: Date,
  timeZone: string,
): VenueCloud | null {
  const hourly = (payload as { hourly?: Record<string, unknown> } | null)?.hourly
  const times = Array.isArray(hourly?.time) ? (hourly.time as string[]) : []
  if (times.length === 0 || !Array.isArray(hourly?.cloud_cover_low)) return null
  const row = times.findIndex((t) => t.startsWith(venueClock(at, timeZone).hour))
  if (row === -1) return null
  return {
    at: new Date(times[row]),
    totalPercent: numberOrNull(hourly?.cloud_cover, row),
    low: numberOrNull(hourly?.cloud_cover_low, row),
    mid: numberOrNull(hourly?.cloud_cover_mid, row),
    high: numberOrNull(hourly?.cloud_cover_high, row),
  }
}


export async function fetchWind(
  at: LatLon,
  when: Date,
  timeZone: string,
  fetchImpl: typeof fetch = fetch,
): Promise<WindResult> {
  const day = await fetchVenueDay(at, when, timeZone, fetchImpl)
  return day.status === 'ok' ? parseWind(day.payload, when, timeZone) : day
}

export type VenueDayResult =
  | { status: 'ok'; payload: unknown }
  /** `unreachable` when no answer came back at all, as opposed to a refusal. */
  | { status: 'unavailable'; reason: string; unreachable?: boolean }

/**
 * THE VENUE'S DAY, RAW: wind at every level, the surface gust, and the cloud.
 *
 * WHY RAW. The whole day comes back in one answer, and it is the thing kept on
 * the device for offline use (src/lib/savedForecast.ts), so scrubbing to
 * another hour with no signal reads the saved day rather than nothing.
 *
 * WHY CLOUD IS IN IT. The CLOUD chip read `selectedCloud`, and App passed it
 * the literal `null` from the commit that introduced it: no request was ever
 * made for the chip, so it said "no data" at every venue, Atlantic Park
 * included, where Open-Meteo answers perfectly well. The cloud at the venue is
 * four more columns on a request already being made for the same coordinate,
 * so it costs no new disclosure.
 */
export async function fetchVenueDay(
  at: LatLon,
  when: Date,
  timeZone: string,
  fetchImpl: typeof fetch = fetch,
): Promise<VenueDayResult> {
  const params = new URLSearchParams({
    latitude: at.lat.toFixed(4),
    longitude: at.lon.toFixed(4),
    /*
     * ALL FOUR HEIGHTS. 180m is about 590ft, which covers a whole Part 107
     * altitude range, so nothing has to be extrapolated upward. Gusts exist at
     * ten metres only: wind_gusts_180m is rejected as an invalid variable.
     */
    hourly: [
      ...WIND_LEVELS_METERS.flatMap((h) => [`wind_speed_${h}m`, `wind_direction_${h}m`]),
      'wind_gusts_10m',
      ...VENUE_CLOUD_VARIABLES,
    ].join(','),
    start_date: venueClock(when, timeZone).date,
    end_date: venueClock(when, timeZone).date,
    timezone: timeZone,
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetchImpl(`${OPEN_METEO_URL}?${params.toString()}`, {
      signal: controller.signal,
    })
    if (!response.ok) {
      return { status: 'unavailable', reason: `Open-Meteo returned HTTP ${response.status}.` }
    }
    return { status: 'ok', payload: await response.json() }
  } catch (error) {
    return {
      status: 'unavailable',
      unreachable: true,
      reason:
        error instanceof Error && error.name === 'AbortError'
          ? 'The forecast timed out.'
          : 'Could not reach Open-Meteo.',
    }
  } finally {
    clearTimeout(timer)
  }
}

/*
 * THE FORECAST CLOUD FIELD, for the map layer that stands in for the
 * satellite when the scrubber goes into the future.
 *
 * ONE REQUEST FOR THE WHOLE GRID, the same comma-separated point list the
 * sightline forecast already uses. Twenty-five points is one call, which is
 * what makes a map layer out of a point API without abusing a free service.
 */
export interface GridCell {
  ix: number
  iy: number
  at: LatLon
  /** The most blocking single layer, or null where the forecast did not say. */
  cover: number | null
  /**
   * Wind at each level the model serves, for the wind layer.
   *
   * THE LEVELS RATHER THAN ONE NUMBER, because the height that matters is the
   * one being flown and it is chosen elsewhere: src/core/windProfile.ts
   * interpolates between these the same way the Conditions readout does. One
   * pre-picked speed here would be a second answer to a question already
   * answered, which is the shape of most of this app's bugs.
   *
   * Null entries stay null. A level the model did not return is not a calm
   * one.
   */
  wind: LevelWind[]
}

export type CloudGridResult =
  | { status: 'ok'; cells: GridCell[]; at: Date }
  | { status: 'unavailable'; reason: string }

export async function fetchCloudGrid(
  centre: LatLon,
  when: Date,
  timeZone: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CloudGridResult> {
  const ahead = daysAhead(when, new Date())
  if (ahead > FORECAST_HORIZON_DAYS) {
    return {
      status: 'unavailable',
      reason: `That date is ${ahead} days out. Forecasts only run ${FORECAST_HORIZON_DAYS} days ahead.`,
    }
  }

  const points = cloudGridPoints(centre)
  const params = new URLSearchParams({
    latitude: points.map((p) => p.at.lat.toFixed(4)).join(','),
    longitude: points.map((p) => p.at.lon.toFixed(4)).join(','),
    /*
     * CLOUD AND WIND IN ONE REQUEST. The grid is 25 points and Open-Meteo is a
     * free service, so asking twice for the same 25 points because somebody
     * flipped a picker would be the rude way to build this. One request
     * carries both layers and the picker is then a repaint.
     */
    hourly: [
      'cloud_cover_low',
      'cloud_cover_mid',
      'cloud_cover_high',
      ...WIND_LEVELS_METERS.map((m) => `wind_speed_${m}m`),
      ...WIND_LEVELS_METERS.map((m) => `wind_direction_${m}m`),
    ].join(','),
    start_date: venueClock(when, timeZone).date,
    end_date: venueClock(when, timeZone).date,
    timezone: timeZone,
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetchImpl(`${OPEN_METEO_URL}?${params.toString()}`, {
      signal: controller.signal,
    })
    if (!response.ok) {
      return { status: 'unavailable', reason: `Open-Meteo returned HTTP ${response.status}.` }
    }
    const payload = await response.json()
    /* A multi-point answer is an array; a single point is one object. */
    const list = Array.isArray(payload) ? payload : [payload]
    const times = (list[0]?.hourly?.time as string[] | undefined) ?? []
    if (times.length === 0) {
      return { status: 'unavailable', reason: 'No cloud in the response.' }
    }
    /*
     * The same wall-clock hour match the sightline forecast uses: Open-Meteo
     * is asked for the venue's own timezone, so its stamps are local without
     * an offset and `venueClock` renders the wanted hour the same way.
     */
    const row = hourIndexFor(times, `${venueClock(when, timeZone).hour}:00`)

    const cells: GridCell[] = points.map((point, i) => {
      const hourly = list[i]?.hourly
      return {
        ix: point.ix,
        iy: point.iy,
        at: point.at,
        cover: cellCover({
          low: numberOrNull(hourly?.cloud_cover_low, row),
          mid: numberOrNull(hourly?.cloud_cover_mid, row),
          high: numberOrNull(hourly?.cloud_cover_high, row),
        }),
        /*
         * km/h out, m/s in: Open-Meteo serves wind in km/h and every piece of
         * arithmetic in this app is metric base units. Converted once, here,
         * at the boundary, exactly as the point forecast does.
         */
        wind: WIND_LEVELS_METERS.map((metres) => ({
          heightMeters: metres,
          speedMps: (() => {
            const kmh = numberOrNull(hourly?.[`wind_speed_${metres}m`], row)
            return kmh === null ? null : kmh * KMH_TO_MPS
          })(),
          fromDegrees: numberOrNull(hourly?.[`wind_direction_${metres}m`], row),
        })),
      }
    })

    return { status: 'ok', cells, at: new Date(times[row]) }
  } catch (error) {
    return {
      status: 'unavailable',
      reason:
        error instanceof Error && error.name === 'AbortError'
          ? 'The cloud forecast timed out.'
          : 'Could not reach Open-Meteo for the cloud forecast.',
    }
  } finally {
    clearTimeout(timer)
  }
}

/* ----------------------------------------------- cloud over one whole night */

/** One hour of total cloud at the venue. */
export interface NightCloudHour {
  at: Date
  totalPercent: number | null
}

export type NightCloudResult =
  | { status: 'ok'; hours: NightCloudHour[] }
  | { status: 'unavailable'; reason: string }

/**
 * Total cloud cover at the venue, hour by hour, across one night.
 *
 * THE SAME SERVICE AND THE SAME ENDPOINT the sightline forecast already uses.
 * This is not a new data source and not a new dependency: it is the cloud
 * forecast the app already has, asked a different question. One coordinate,
 * two calendar days, which is what "the night of the 21st" spans.
 *
 * TOTAL COVER, not the three layers. The sightline code wants the layers apart
 * because low cloud blocks a sightline and high cloud only softens it. For a
 * sky window anything in the way is in the way, so `cloud_cover` is the honest
 * single number and three columns would be three nobody reads at 3am.
 *
 * NOTHING IS INVENTED WHERE IT DOES NOT REACH. Open-Meteo answers about two
 * weeks ahead; most of a ninety day listing is far past that. An hour the
 * service did not return is simply absent, and cloudForWindow turns an empty
 * set into "the cloud forecast does not reach this night" rather than silence
 * or a zero.
 */
export async function fetchNightCloud(
  at: { lat: number; lon: number },
  nightStart: Date,
  nightEnd: Date,
  timeZone: string,
): Promise<NightCloudResult> {
  const day = (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  const params = new URLSearchParams({
    latitude: at.lat.toFixed(4),
    longitude: at.lon.toFixed(4),
    hourly: 'cloud_cover',
    start_date: day(nightStart),
    end_date: day(nightEnd),
    timezone: timeZone,
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(`${OPEN_METEO_URL}?${params.toString()}`, {
      signal: controller.signal,
    })
    if (!response.ok) {
      return { status: 'unavailable', reason: `Open-Meteo returned HTTP ${response.status}` }
    }
    const payload = (await response.json()) as {
      hourly?: { time?: string[]; cloud_cover?: (number | null)[] }
    }
    const times = payload.hourly?.time ?? []
    const cover = payload.hourly?.cloud_cover ?? []
    if (times.length === 0) {
      return { status: 'unavailable', reason: 'Open-Meteo returned no hours for that night' }
    }
    const hours: NightCloudHour[] = times.map((stamp, i) => {
      const value = cover[i]
      return {
        /*
         * The stamps come back in the venue's own zone with no offset on them,
         * so they parse as local wall clock. That matches every other time on
         * the sky panel, which is a venue wall clock by design.
         */
        at: new Date(stamp),
        totalPercent: typeof value === 'number' && Number.isFinite(value) ? value : null,
      }
    })
    return { status: 'ok', hours }
  } catch (error) {
    return {
      status: 'unavailable',
      reason:
        error instanceof Error && error.name === 'AbortError'
          ? 'The cloud forecast timed out'
          : 'The cloud forecast could not be reached',
    }
  } finally {
    clearTimeout(timer)
  }
}
