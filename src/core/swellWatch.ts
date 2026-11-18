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
 * from one model read two ways it says "readings disagree" (src/lib/
 * tideSheetData.ts fetchMarine, the best match; what it reads is
 * src/lib/surfPageData.ts dayReadings). Never a size, never a time: we do
 * not know them.
 *
 * Batch 3D, Section 3.2 (Jwilly approved): three wave models beside the best
 * match, asked from the phone (WAVE_MODELS, src/lib/waveModels.ts), each read
 * at the beach the same way (src/lib/surfPageData.ts modelDayReadings). The
 * chip is the same rule over every reading: any one model at WATCH_FT or more
 * on a day called WATCH_CALL_MAX_FT or under. docs/batches/3d-decisions.md,
 * Section 3, has the options.
 *
 * And a log, kept on this phone each day (src/lib/swellWatchStore.ts), of
 * our call and the top reading for every day of the week, so Mon 23 Nov can
 * be set against what the beach had.
 */
export const WATCH_FT = 4
export const WATCH_CALL_MAX_FT = 2

/*
 * THE WAVE MODELS (Batch 3D, Section 3.2), by Open-Meteo Marine's own ids
 * (checked against marine-api.open-meteo.com on 17 Nov 2026). GFS-Wave is
 * asked at both grids and read from the first whose cell is sea: at
 * 37.00,-76.00 (the VB spots) the 0.25° cell answered 0.00 m every hour of
 * the week, a land-masked cell, while the 0.16° Atlantic grid read the sea.
 * ECMWF WAM gives the whole sea only (no swell or wind-sea split).
 */
export interface WaveModel {
  /** The name the log and the readings carry. */
  name: string
  /** Open-Meteo's ids, the first with sea in its cell read. */
  ids: readonly string[]
}
export const WAVE_MODELS: readonly WaveModel[] = [
  { name: 'ECMWF WAM', ids: ['ecmwf_wam025'] },
  { name: 'GFS-Wave', ids: ['ncep_gfswave016', 'ncep_gfswave025'] },
  { name: 'Météo-France MFWAM', ids: ['meteofrance_wave'] },
]
export const WAVE_MODEL_IDS: readonly string[] = WAVE_MODELS.flatMap((m) => m.ids)

/** Whether a model's cell is sea: some wave height above 0. A land-masked cell answers 0 every hour, and no sea is flat for a week; null throughout (outside the grid) is no sea either. */
export function seaInCell(heights: readonly (number | null)[] | undefined): boolean {
  return (heights ?? []).some((h) => h !== null && Number.isFinite(h) && h > 0)
}

/** Each model's top reading that day, feet, one decimal (the log's per-model column). */
export function modelTops(readings: readonly WatchReading[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of readings) if (Number.isFinite(r.faceFt)) out[r.model] = Math.max(out[r.model] ?? 0, Math.round(r.faceFt * 10) / 10)
  return out
}

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
  /** Batch 3D, Section 3.2: each model's top that day, feet, one decimal (modelTops); absent when the screen that wrote it did not ask the models. */
  models?: Record<string, number>
}

/** How long a made day is kept: three weeks, past the day it was watching. */
export const WATCH_KEEP_DAYS = 21

const dayNo = (iso: string) => Math.floor(Date.parse(`${iso}T12:00:00Z`) / 86_400_000)

/**
 * Add one day's week to the log: one row per (made, date), today's replacing
 * an earlier write the same day; rows older than WATCH_KEEP_DAYS dropped. A
 * write without the models (a screen that does not ask them) keeps the
 * models an earlier write that day had (Batch 3D, Section 3.2).
 */
export function logWatch(log: readonly WatchLogRow[], made: string, rows: readonly Omit<WatchLogRow, 'made'>[]): WatchLogRow[] {
  const keep = log.filter((r) => r.made !== made && dayNo(made) - dayNo(r.made) <= WATCH_KEEP_DAYS)
  const had = new Map(log.filter((r) => r.made === made && r.models !== undefined).map((r) => [r.date, r.models]))
  const add = rows.map((r) => {
    const models = r.models !== undefined && Object.keys(r.models).length > 0 ? r.models : had.get(r.date)
    return { made, date: r.date, callLowFt: r.callLowFt, callHighFt: r.callHighFt, topFt: r.topFt === null ? null : Math.round(r.topFt * 10) / 10, ...(models === undefined ? {} : { models }) }
  })
  return [...keep, ...add].sort((a, b) => (a.made === b.made ? a.date.localeCompare(b.date) : a.made.localeCompare(b.made)))
}

/** The log's rows for one day, in the order they were made: "17 Nov said 1–2, top 2.0 ft". */
export function watchFor(log: readonly WatchLogRow[], date: string): WatchLogRow[] {
  return log.filter((r) => r.date === date).sort((a, b) => a.made.localeCompare(b.made))
}
