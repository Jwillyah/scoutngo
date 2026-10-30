/*
 * THE LAST FORECAST THAT ARRIVED, KEPT WITH THE TIME IT ARRIVED.
 *
 * WHY THIS EXISTS. With no signal the wind, the cloud and the tide used to
 * vanish. They cannot be computed on the device, but the last answer can be
 * kept, and a forecast twelve hours old is still worth reading on a ridge as
 * long as it SAYS it is twelve hours old.
 *
 * THE STAMP IS PART OF THE VALUE. A saved forecast with no fetch time could be
 * rendered as if it were current, which is the one thing this must never do.
 * So nothing is stored without `fetchedAt`, and nothing is read back without
 * it: the reader gets the payload and its age together or not at all.
 *
 * localStorage, like everything else this app keeps: on this device only.
 */

export const SAVED_FORECAST_KEY = 'scoutngo.forecast.v1'

/**
 * Entries kept before the oldest is dropped. A venue-day is a few kilobytes.
 * 80 since 29 Oct: a venue saved for offline holds about a dozen (a week of
 * tide tables, the day, the sea, the sky), and two of them must not push each
 * other out.
 */
export const SAVED_FORECAST_LIMIT = 80

/** Older than this, the age is marked. */
export const MARK_AFTER_HOURS = 12
/** Older than this, the value is dimmed and labelled as an old forecast. */
export const DIM_AFTER_HOURS = 36

export interface SavedForecast<T = unknown> {
  payload: T
  /** ISO instant the payload arrived. */
  fetchedAt: string
}

interface StoredEntry {
  key: string
  fetchedAt: string
  payload: unknown
}

function readAll(): StoredEntry[] {
  try {
    const raw = localStorage.getItem(SAVED_FORECAST_KEY)
    if (raw === null) return []
    const list = JSON.parse(raw) as unknown
    if (!Array.isArray(list)) return []
    return list.filter(
      (e): e is StoredEntry =>
        typeof e?.key === 'string' &&
        typeof e?.fetchedAt === 'string' &&
        !Number.isNaN(Date.parse(e.fetchedAt)),
    )
  } catch {
    return []
  }
}

/**
 * Keeps one answer with the time it arrived. True when it is stored.
 *
 * OUT OF ROOM, THE OLDEST GO FIRST, never the newest: a full store used to
 * throw the new entry away in silence, which is the one a shooter about to
 * lose signal needs.
 */
export function saveForecast(key: string, payload: unknown, now: Date = new Date()): boolean {
  const others = readAll().filter((e) => e.key !== key)
  const next = [{ key, fetchedAt: now.toISOString(), payload }, ...others].slice(
    0,
    SAVED_FORECAST_LIMIT,
  )
  for (let keep = next.length; keep > 0; keep -= 1) {
    try {
      localStorage.setItem(SAVED_FORECAST_KEY, JSON.stringify(next.slice(0, keep)))
      return true
    } catch {
      /* Out of room: one fewer old entry and try again. */
    }
  }
  return false
}

/** The stored size of one entry in bytes (its JSON), or 0 when it is not kept. */
export function savedForecastBytes(key: string): number {
  const hit = readAll().find((e) => e.key === key)
  return hit === undefined ? 0 : JSON.stringify(hit).length
}

export function readForecast<T = unknown>(key: string): SavedForecast<T> | null {
  const hit = readAll().find((e) => e.key === key)
  return hit === undefined ? null : { payload: hit.payload as T, fetchedAt: hit.fetchedAt }
}

/** The keys saved under a prefix, newest first: for a table saved from another start date that still covers this one. */
export function savedKeys(prefix: string): string[] {
  return readAll()
    .filter((e) => e.key.startsWith(prefix))
    .map((e) => e.key)
}

/** Every saved entry, for the export file and for clearing. */
export function savedForecastCount(): number {
  return readAll().length
}

/* ------------------------------------------------------------------ the key */

/** Three decimals, about a hundred metres: the same rounding the wind hook keys on. */
const place = (lat: number, lon: number): string => `${lat.toFixed(3)},${lon.toFixed(3)}`

export const venueDayKey = (lat: number, lon: number, day: string, timeZone: string): string =>
  `venue-day|${place(lat, lon)}|${day}|${timeZone}`

export const tideKey = (stationId: string, begin: string, end: string): string =>
  `tide|${stationId}|${begin}|${end}`

/* ------------------------------------------------------------------ the age */

/**
 * Where a value came from, which the screen must say.
 *
 * `live` needs no qualifier. `saved` always carries its age, and the age
 * decides how loudly it is said.
 */
export type Provenance = { kind: 'live' } | { kind: 'saved'; fetchedAt: string }

export type AgeMark = 'plain' | 'marked' | 'dimmed'

export interface ForecastAge {
  hours: number
  mark: AgeMark
  /** "3 h old", "2 days old". Never empty, never "now". */
  text: string
  /** "3h", "2d": the same age in the room a chip label has. */
  short: string
}

export function forecastAge(fetchedAt: string, now: Date = new Date()): ForecastAge {
  const ms = Math.max(0, now.getTime() - Date.parse(fetchedAt))
  const hours = ms / 3_600_000
  const mark: AgeMark =
    hours > DIM_AFTER_HOURS ? 'dimmed' : hours > MARK_AFTER_HOURS ? 'marked' : 'plain'
  const text =
    hours < 1
      ? `${Math.max(1, Math.round(ms / 60_000))} m old`
      : hours < 48
        ? `${Math.round(hours)} h old`
        : `${Math.round(hours / 24)} days old`
  const short =
    hours < 1
      ? `${Math.max(1, Math.round(ms / 60_000))}m`
      : hours < 48
        ? `${Math.round(hours)}h`
        : `${Math.round(hours / 24)}d`
  return { hours, mark, text, short }
}
