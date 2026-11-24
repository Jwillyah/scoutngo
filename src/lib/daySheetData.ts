/*
 * THE DAY SHEET'S FORECAST (Batch SIMPLE-3, Section 4). The same request the
 * home's briefing asks (src/lib/tideSheetData.ts fetchBriefWind: same URL,
 * so the shared store answers it from the same key, kept on the phone for
 * offline), asked here only so the answer comes back with the time it arrived.
 * No new kind of request, nothing about the phone in it.
 */
import type { LatLon } from '../core/geo.ts'
import type { DayWx, DayWxName } from '../core/daySheet.ts'
import { BRIEF_WIND_NAMES, briefWindUrl, hourlyAt, parseHourly, type Hourly } from './tideSheetData.ts'
import { weatherJson } from './weatherStore.ts'

/** The sheet reloads this often while open. */
export const DAY_REFRESH_MS = 30 * 60_000
const TIMEOUT_MS = 10_000

export interface DayForecast {
  hourly: Hourly
  /** When this answer arrived, ms since 1970. */
  fetchedAt: number
  /** The last answer, because a new one could not be had (offline, busy). */
  stale: boolean
}

export async function fetchDayForecast(at: LatLon): Promise<DayForecast | null> {
  /* The brief's own URL, built in one place (briefWindUrl), so the two can never drift apart (Batch SIMPLE-3, Section 1b added minutely_15 to it). */
  const got = await weatherJson(briefWindUrl(at), { maxAgeMs: DAY_REFRESH_MS - 5 * 60_000, timeoutMs: TIMEOUT_MS })
  if (!got.ok) return null
  const hourly = parseHourly(got.payload, BRIEF_WIND_NAMES)
  return hourly === null ? null : { hourly, fetchedAt: got.fetchedAt, stale: got.stale || got.kept }
}

/** The sheet's reader over an hourly series. */
export const dayWxOf = (h: Hourly): DayWx => (name: DayWxName, at: Date) => hourlyAt(h, name, at)
