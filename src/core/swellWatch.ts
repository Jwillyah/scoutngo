/*
 * THE BIGGER-SWELL WATCH (Batch FIX, Section 3.4). 17 Nov: Surfline showed
 * 5-7 / 6-8 ft for Mon 23 Nov from a SE low, "uncertain"; ours said 1-2 on
 * day 7. A watch, not a call: when any reading of the sea we hold puts 4 ft
 * or more at the beach within the week while our call for that day is 2 ft
 * or under, the week says so, once, in the batch's words:
 *
 *   "Possible bigger swell Mon · models disagree · low confidence"
 *
 * "models disagree" only when the readings come from two models or more;
 * from one model read two ways it says "readings disagree" (the app asks
 * Open-Meteo Marine's one best-match model and no ensemble: src/lib/
 * tideSheetData.ts fetchMarine; what it reads is src/lib/surfPageData.ts
 * dayReadings). Never a size, never a time: we do not know them.
 *
 * And a log, kept on this phone each day (src/lib/swellWatchStore.ts), of
 * our call and the top reading for every day of the week, so Mon 23 Nov can
 * be set against what the beach had.
 */
export const WATCH_FT = 4
export const WATCH_CALL_MAX_FT = 2

export interface WatchReading {
  /** The model, e.g. "Open-Meteo Marine (best match)". */
  model: string
  /** How it was read, e.g. "part by part". */
  read: string
  /** Its biggest face at the beach that day, 5 AM to 8 PM, feet. */
  faceFt: number
}

export interface WatchDayIn {
  date: string
  /** Our call's top, whole feet; null when there is no call. */
  callHighFt: number | null
  readings: readonly WatchReading[]
}

export interface SwellWatch {
  date: string
  topFt: number
  models: number
  /** "Possible bigger swell Mon · models disagree · low confidence". */
  words: string
}

/** The first day within the week a reading reaches WATCH_FT while our call tops at WATCH_CALL_MAX_FT or under; null for none. */
export function swellWatch(days: readonly WatchDayIn[], weekday: (iso: string) => string): SwellWatch | null {
  for (const d of days.slice(0, 7)) {
    if (d.callHighFt === null || d.callHighFt > WATCH_CALL_MAX_FT) continue
    const big = d.readings.filter((r) => Number.isFinite(r.faceFt) && r.faceFt >= WATCH_FT)
    if (big.length === 0) continue
    const models = new Set(d.readings.map((r) => r.model)).size
    const topFt = Math.max(...big.map((r) => r.faceFt))
    return { date: d.date, topFt, models, words: `Possible bigger swell ${weekday(d.date)} · ${models >= 2 ? 'models' : 'readings'} disagree · low confidence` }
  }
  return null
}

/* ------------------------------------------------------------ the daily log */

export interface WatchLogRow {
  /** The day the call was made, and the day it was for. */
  made: string
  date: string
  callLowFt: number | null
  callHighFt: number | null
  /** The top reading that day, feet, one decimal; null when none. */
  topFt: number | null
}

/** How long a made day is kept: three weeks, past the day it was watching. */
export const WATCH_KEEP_DAYS = 21

const dayNo = (iso: string) => Math.floor(Date.parse(`${iso}T12:00:00Z`) / 86_400_000)

/** Add one day's week to the log: one row per (made, date), today's replacing an earlier write the same day; rows older than WATCH_KEEP_DAYS dropped. */
export function logWatch(log: readonly WatchLogRow[], made: string, rows: readonly Omit<WatchLogRow, 'made'>[]): WatchLogRow[] {
  const keep = log.filter((r) => r.made !== made && dayNo(made) - dayNo(r.made) <= WATCH_KEEP_DAYS)
  const add = rows.map((r) => ({ made, date: r.date, callLowFt: r.callLowFt, callHighFt: r.callHighFt, topFt: r.topFt === null ? null : Math.round(r.topFt * 10) / 10 }))
  return [...keep, ...add].sort((a, b) => (a.made === b.made ? a.date.localeCompare(b.date) : a.made.localeCompare(b.made)))
}

/** The log's rows for one day, in the order they were made: "17 Nov said 1–2, top 2.0 ft". */
export function watchFor(log: readonly WatchLogRow[], date: string): WatchLogRow[] {
  return log.filter((r) => r.date === date).sort((a, b) => a.made.localeCompare(b.made))
}
