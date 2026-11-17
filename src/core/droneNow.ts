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
 *   chip       one: under the limit (teal) until when, or at/over it (orange)
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

/**
 * THE ONE CHIP UNDER THE NUMBER (Batch FIX, Section 6.2; board Drone_Slim_1).
 *
 * "Under your limit until sunset 4:53 PM · gusts 46%". Teal (`ok`) while the
 * steady wind and its gusts at 400 ft are under the drone's limit; orange
 * (`trouble`) ONLY when one of them is at or over it. The old orange "Calm
 * now until 4:53" was the wrong colour for good news and repeated the line
 * above it.
 *
 * "Until" is the first forecast hour at 400 ft at or over the limit, before
 * sunset; "until sunset" when every hour to sunset is under it. An hour the
 * forecast does not give ends the run without a time: the chip does not say
 * how long it lasts when it does not know.
 *
 * Null with no limit or no wind at 400 ft: the caller says which.
 */
export interface LimitChip {
  text: string
  tone: 'ok' | 'trouble'
}

export function limitChip(now: Date, hours: readonly HourAloft[], mps400: number | null, gust400: number | null, limitMps: number | null, sunset: Date | null, clock: (d: Date) => string, speed: (mps: number) => string): LimitChip | null {
  if (limitMps === null || limitMps <= 0 || mps400 === null) return null
  const pct = gust400 === null ? null : Math.round((gust400 / limitMps) * 100)
  const gusts = pct === null ? '' : ` · gusts ${pct}%`
  if (mps400 >= limitMps) return { text: `${mps400 === limitMps ? 'At' : 'Over'} your ${speed(limitMps)} limit${gusts}`, tone: 'trouble' }
  if (gust400 !== null && gust400 >= limitMps) return { text: `Gusts ${pct}% of your ${speed(limitMps)} limit`, tone: 'trouble' }
  let until = ''
  if (sunset !== null && sunset.getTime() > now.getTime()) {
    const ahead = [...hours].sort((a, b) => a.at.getTime() - b.at.getTime()).filter((h) => h.at.getTime() + HOUR > now.getTime() && h.at.getTime() < sunset.getTime())
    let ended: 'over' | 'unknown' | null = null
    for (const h of ahead) {
      if (h.mps === null) {
        ended = 'unknown'
        break
      }
      if (h.mps >= limitMps) {
        ended = 'over'
        if (h.at.getTime() > now.getTime()) until = ` until ${clock(h.at)}`
        break
      }
    }
    if (ended === null && ahead.length > 0) until = ` until sunset ${clock(sunset)}`
  }
  return { text: `Under your limit${until}${gusts}`, tone: 'ok' }
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

/** The last Kp this phone has: NOAA's value, its time tag, and whether it came from the phone's copy because NOAA did not answer now. */
export interface KpValue {
  kp: number
  at: Date | null
  kept: boolean
}
export type KpState = 'loading' | 'offline' | 'missing' | KpValue

/**
 * THE GPS ROW (Batch FIX, Section 6.7): NOAA's word for the K index, then the
 * number and when NOAA measured it ("Quiet · Kp 2 · 7:00 AM"), the last value
 * received when NOAA does not answer now (with "kept from" and its time, so
 * its age shows), and NO ROW when this phone has never received one: "Kp not
 * received · NOAA did not answer" said nothing a pilot could use.
 */
export function kpRow(state: KpState, word: (kp: number) => string, when: (d: Date) => string): { big: string; small: string } | null {
  if (typeof state === 'string') return null
  const w = word(state.kp)
  const big = w.charAt(0).toUpperCase() + w.slice(1)
  const at = state.at === null ? '' : ` · ${state.kept ? 'kept from ' : ''}${when(state.at)}`
  return { big, small: `Kp ${Math.round(state.kp)}${at}` }
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

/**
 * THE SKY ROW (Batch FIX, Section 6.2): one word for the cloud, then
 * visibility. "Little low cloud · low cloud 0%" said the same thing twice.
 * The station's lowest layer when its report is fresh, else the forecast's
 * total cloud. Never "clear" (docs/ux-rules.md, rule 12).
 */
export function cloudWords(coverPct: number | null): string | null {
  if (coverPct === null || !Number.isFinite(coverPct)) return null
  return coverPct < 10 ? 'Little cloud' : coverPct < 40 ? 'Some cloud' : coverPct < 80 ? 'Mostly cloudy' : 'Overcast'
}

/** Rain chance is said from this share up; under it, the row stays one fact. */
export const SKY_RAIN_FROM_PCT = 20

export function skyRow(stationBaseFt: number | null, station: string | null, coverPct: number | null, vis: string | null, rainPct: number | null): { big: string; small: string } {
  const big = stationBaseFt !== null ? `Base ${baseWords(stationBaseFt)}` : (cloudWords(coverPct) ?? 'Cloud not forecast')
  const small = [vis === null ? null : `vis ${vis}`, rainPct !== null && rainPct >= SKY_RAIN_FROM_PCT ? `rain ${Math.round(rainPct)}%` : null, stationBaseFt !== null ? station : null].filter((x): x is string => x !== null).join(' · ')
  return { big, small: small === '' ? 'the forecast did not say' : small }
}
