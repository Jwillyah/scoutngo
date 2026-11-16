/*
 * THE DRONE PAGE'S NOW TAB, AS ARITHMETIC (Batch DRONE, Section 2.1; board Drone_P1).
 *
 *   headline   the wind at 400 ft (the forecast's 120 m), where it comes from
 *              and its gusts, against the drone's own limit: "15 kt from NNW ·
 *              gusts 22", "under your 23 kt limit · gusts at 96%"
 *   gusts      Open-Meteo forecasts gusts at 10 m only. The gust's excess over
 *              the steady wind at 10 m is carried up unchanged:
 *              gust400 = wind400 + max(0, gust10 - wind10)
 *   arrow      points where the wind blows TO (from + 180)
 *   chip       the calm window is the home's (src/core/droneWindow.ts): one
 *              source for "calm", so the home and this page cannot disagree
 *   bars       today's hours at 400 ft, civil dawn to civil dusk only, each
 *              coloured by its share of the limit (DRONE_LIGHT_RATIO, the
 *              home's line); sunset and civil dusk marked
 *   battery    the rated minutes trimmed for the cold: COLD_TRIM_PER_C per
 *              degree under COLD_TRIM_FROM_C, at most COLD_TRIM_MAX
 *   Kp         the value and its age, or why there is none, in words
 *   sky        the cloud base (the station's lowest layer, else estimated
 *              from the dew point), visibility and rain chance
 *
 * Facts, never "safe" (rule 12, rule 28).
 */
import { DRONE_LIGHT_RATIO } from './briefing.ts'
import type { CalmRead } from './droneWindow.ts'

const HOUR = 3_600_000

/** The gust at 400 ft: the steady wind there plus the 10 m gust's excess. Null when any input is unknown. */
export function gustAloft(mps10: number | null, gust10: number | null, mps400: number | null): number | null {
  if (mps10 === null || gust10 === null || mps400 === null) return null
  return mps400 + Math.max(0, gust10 - mps10)
}

/** Where the arrow points, degrees clockwise from north: where the wind blows to. */
export const blowsToward = (fromDeg: number): number => (((fromDeg + 180) % 360) + 360) % 360

/** Under, near or at/over the limit; the same line the home's "Light wind" tag draws. */
export type LimitRole = 'calm' | 'near' | 'over' | 'unknown'

export function limitRole(mps: number | null, limitMps: number | null): LimitRole {
  if (mps === null) return 'unknown'
  if (limitMps === null || limitMps <= 0) return 'calm'
  const r = mps / limitMps
  return r < DRONE_LIGHT_RATIO ? 'calm' : r < 1 ? 'near' : 'over'
}

/** "under your 23 kt limit · gusts at 96%", or null with no limit. `speed` writes m/s in the pilot's unit. */
export function limitLine(mps400: number | null, gust400: number | null, limitMps: number | null, speed: (mps: number) => string): string | null {
  if (limitMps === null || limitMps <= 0 || mps400 === null) return null
  const where = mps400 < limitMps ? 'Under' : mps400 === limitMps ? 'At' : 'Over'
  const gusts = gust400 === null ? '' : ` · gusts at ${Math.round((gust400 / limitMps) * 100)}%`
  return `${where} your ${speed(limitMps)} limit${gusts}`
}

/** A gust this far over the steady wind (10 m) is "gusty": 8 kt. */
export const GUSTY_EXCESS_MPS = 4.1

/**
 * The chip: what the wind is doing now, and when the calm window is.
 * "Gusty now · calmer 3–4:50 PM (11 kt)", "Calm now until 1 PM", or null when
 * there is no calm window to point at.
 */
export function windChip(now: Date, calm: CalmRead, mps10: number | null, gust10: number | null, calmMaxMps: number | null, span: (from: Date, to: Date) => string, until: (d: Date) => string, speed: (mps: number) => string): string | null {
  if (calm.kind !== 'calm') return null
  const { from, to } = calm.span
  if (from.getTime() <= now.getTime()) return `Calm now until ${until(to)}`
  const gusty = mps10 !== null && gust10 !== null && gust10 - mps10 >= GUSTY_EXCESS_MPS
  return `${gusty ? 'Gusty now' : 'Windier now'} · calmer ${span(from, to)}${calmMaxMps === null ? '' : ` (${speed(calmMaxMps)})`}`
}

export interface HourAloft {
  at: Date
  /** The wind at 400 ft, m/s. */
  mps: number | null
}

export interface DayBar {
  at: Date
  mps: number | null
  role: LimitRole
  /** 0 to 1 of the chart's height. */
  height: number
}

export interface DayBars {
  bars: DayBar[]
  /** The chart's top, m/s: the limit or the strongest hour, whichever is higher. */
  topMps: number
  /** The limit's height, 0 to 1, or null with no limit. */
  limitAt: number | null
  /** Where sunset and civil dusk fall along the chart, 0 to 1, or null outside it. */
  sunsetAt: number | null
  duskAt: number | null
  from: Date
  to: Date
}

/**
 * The hours at 400 ft from max(now, civil dawn) to civil dusk: daylight and
 * civil twilight only. Null when no hour of that light is left (the caller
 * asks for the next day) or no hour is in the forecast.
 */
export function dayBars(hours: readonly HourAloft[], now: Date, dawn: Date, sunset: Date, dusk: Date, limitMps: number | null): DayBars | null {
  const from = new Date(Math.max(now.getTime(), dawn.getTime()))
  if (from.getTime() >= dusk.getTime()) return null
  /* An hour belongs when any of it is in the light: it ends after `from` and starts before dusk. */
  const kept = [...hours].sort((a, b) => a.at.getTime() - b.at.getTime()).filter((h) => h.at.getTime() + HOUR > from.getTime() && h.at.getTime() < dusk.getTime())
  if (kept.length === 0) return null
  const known = kept.map((h) => h.mps).filter((v): v is number => v !== null)
  const topMps = Math.max(limitMps ?? 0, ...known, 1)
  const start = kept[0].at.getTime()
  const end = kept[kept.length - 1].at.getTime() + HOUR
  const share = (t: Date) => (t.getTime() < start || t.getTime() > end ? null : (t.getTime() - start) / (end - start))
  return {
    bars: kept.map((h) => ({ at: h.at, mps: h.mps, role: limitRole(h.mps, limitMps), height: h.mps === null ? 0 : Math.max(0.04, h.mps / topMps) })),
    topMps,
    limitAt: limitMps === null || limitMps <= 0 ? null : limitMps / topMps,
    sunsetAt: share(sunset),
    duskAt: share(dusk),
    from: new Date(start),
    to: new Date(end),
  }
}

/* ------------------------------------------------------------- battery */

/** No trim at or above this, °C (a pack's rated minutes are a warm-weather figure). */
export const COLD_TRIM_FROM_C = 20
/** The share of the rated minutes lost per degree under COLD_TRIM_FROM_C. */
export const COLD_TRIM_PER_C = 0.4 / 30
/** At most this share is trimmed. */
export const COLD_TRIM_MAX = 0.4

/** The share of the rated minutes the cold takes, 0 to COLD_TRIM_MAX. Unknown temperature: no trim, and the caller says so. */
export function coldTrim(tempC: number | null): number {
  if (tempC === null || !Number.isFinite(tempC)) return 0
  return Math.min(COLD_TRIM_MAX, Math.max(0, (COLD_TRIM_FROM_C - tempC) * COLD_TRIM_PER_C))
}

/** The minutes left after the cold's trim, rounded down to the minute. */
export const coldMinutes = (ratedMin: number, tempC: number | null): number => Math.floor(ratedMin * (1 - coldTrim(tempC)))

/* ------------------------------------------------------------------ Kp */

export type KpState = 'loading' | 'offline' | 'missing' | { kp: number; at: Date | null }

/** The GPS card, never a dash: the number and its age, or why there is no number. */
export function kpCard(state: KpState, word: (kp: number) => string, clock: (d: Date) => string): { big: string; line: string } {
  if (state === 'loading') return { big: 'Reading Kp…', line: 'asking NOAA' }
  if (state === 'offline') return { big: 'Kp not received', line: 'no signal to ask NOAA' }
  if (state === 'missing') return { big: 'Kp not received', line: 'NOAA did not answer' }
  return { big: `Kp ${Math.round(state.kp)} · ${word(state.kp)}`, line: state.at === null ? 'NOAA SWPC' : `from ${clock(state.at)}` }
}

/** NOAA's time tag ("2026-10-30 09:00:00.000", UTC) as a Date, or null. */
export function kpTime(tag: string): Date | null {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(tag.trim())
  if (m === null) return null
  const d = new Date(`${m[1]}T${m[2]}:00Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

/* ----------------------------------------------------------------- sky */

/** The lifting condensation level: about 125 m of height per °C of dew-point spread. */
export const LCL_M_PER_C = 125

/** The estimated cumulus base, feet above the ground, from the air and dew point. */
export function estimatedBaseFt(tempC: number | null, dewC: number | null): number | null {
  if (tempC === null || dewC === null) return null
  return Math.max(0, tempC - dewC) * LCL_M_PER_C * 3.28084
}

/** A height in hundreds of feet, the way a station reports one: "5,500 ft". */
export const baseWords = (ft: number): string => `${(Math.round(ft / 100) * 100).toLocaleString('en-US')} ft`

/** Visibility from metres, in miles as a station writes it: "10 mi", "3 mi", "0.5 mi". */
export function visibilityWords(m: number | null): string | null {
  if (m === null || !Number.isFinite(m)) return null
  const mi = m / 1609.344
  if (mi >= 10) return '10 mi'
  return mi >= 1 ? `${Math.round(mi)} mi` : `${Math.round(mi * 10) / 10} mi`
}
