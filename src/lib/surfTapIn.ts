import { getPosition } from 'suncalc'
import type { LatLon } from '../core/geo.ts'
import { localDate } from '../core/moonTimes.ts'
import { nowcastAt, obsFresh, type StationObs } from '../core/nowcast.ts'
import { CALM_GLASSY_WORDS, isCalmGlassy, SHAPE_WORD, type SurfCall } from '../core/surfCall.ts'
import { cleanRuns } from '../core/surfRange.ts'
import { formatShortHour } from '../core/timezone.ts'
import { hourlyAt } from './tideSheetData.ts'
import { compass } from './tideWords.ts'
import { formatWind, type Units } from './units.ts'
import type { RangeHour } from './surfPageData.ts'
import type { SurfSea } from './useSurfSea.ts'

/*
 * THE SURF PAGE'S WORDS, as the tap-in skeleton wants them (Batch SIMPLE-2,
 * Section 4; boards Surf_Now, Surf_Cams). Pure: every value is an existing
 * surf function's (the hours are src/lib/useSurfNow.ts's series, the call is
 * src/core/surfCall.ts); this only picks and words. A dash where the forecast
 * did not say; never a zero.
 */

/** The bars cover this long before the current hour begins and after it: 24 one-hour bars. */
export const BARS_BEFORE_H = 1
export const BARS_HOURS = 24
/** A stretch is worth naming "best" only with something to ride in it: the 1 ft the rating calls rideable (src/core/surfShoot.ts hourQuality). */
export const BEST_MIN_FT = 1

const HOUR = 3_600_000
const floorHour = (t: Date) => Math.floor(t.getTime() / HOUR) * HOUR

export interface SurfBar {
  at: Date
  ft: number
  clean: boolean
}

/** The 24 hourly bars from an hour before now: the series' hours (each at half past) that fall inside. */
export function surfBars(series: readonly RangeHour[], now: Date): { from: Date; to: Date; bars: SurfBar[] } {
  const from = new Date(floorHour(now) - BARS_BEFORE_H * HOUR)
  const to = new Date(from.getTime() + BARS_HOURS * HOUR)
  const bars = series.filter((h) => h.at.getTime() >= from.getTime() && h.at.getTime() < to.getTime()).map((h) => ({ at: h.at, ft: h.centerFt, clean: h.clean }))
  return { from, to, bars }
}

/** The clean stretches among the bars, each [from, to) on the hour. */
export function barRuns(bars: readonly SurfBar[]): { from: Date; to: Date }[] {
  return cleanRuns(bars.map((b) => ({ at: b.at.getTime() - HOUR / 2, clean: b.clean }))).map((r) => ({ from: new Date(r.from), to: new Date(r.to) }))
}

export interface BestStretch {
  from: Date
  to: Date
  peakFt: number
}

/**
 * The best clean stretch still to come: the clean run (src/core/surfRange.ts
 * cleanRuns; clean is the one definition src/core/surf.ts surfShape gives)
 * with the biggest hour, from hours not yet over. A run whose biggest hour is
 * under BEST_MIN_FT is not offered; the earlier run wins a tie. Null when
 * there is none.
 */
export function bestStretch(series: readonly RangeHour[], now: Date): BestStretch | null {
  const ahead = series.filter((h) => h.at.getTime() + HOUR / 2 > now.getTime()).sort((a, b) => a.at.getTime() - b.at.getTime())
  const runs = cleanRuns(ahead.map((h) => ({ at: h.at.getTime() - HOUR / 2, clean: h.clean && h.centerFt >= BEST_MIN_FT })))
  let best: BestStretch | null = null
  for (const r of runs) {
    const peak = Math.max(...ahead.filter((h) => h.at.getTime() >= r.from && h.at.getTime() < r.to).map((h) => h.centerFt))
    if (best === null || peak > best.peakFt) best = { from: new Date(r.from), to: new Date(r.to), peakFt: peak }
  }
  return best
}

/*
 * THE ONE SURF WINDOW (Batch SIMPLE-3, Section 0.3). On 23 Nov at 11:07 AM
 * the home's card said "1–3 ft until 5 PM", the Surf tile "2–3 ft", the Surf
 * chart "clean 10a–11p" and its Best row "11a–11p": four rules over three
 * series. Now there is one: the clean stretches (src/core/surf.ts surfShape's
 * clean, the call's own) with surf in them (BEST_MIN_FT), in daylight, from
 * the one series (src/lib/useSurfNow.ts), each [from, to) on the hour. The
 * window is the first of them not yet over. The home's moment, the Surf
 * page's lit stretches and its Best row all say these, in these words.
 */
export function surfRuns(series: readonly RangeHour[], daylight: (t: Date) => boolean): { from: Date; to: Date; peakFt: number }[] {
  const hours = [...series].sort((a, b) => a.at.getTime() - b.at.getTime())
  const ok = (h: RangeHour) => h.clean && h.centerFt >= BEST_MIN_FT && daylight(h.at)
  return cleanRuns(hours.map((h) => ({ at: h.at.getTime() - HOUR / 2, clean: ok(h) }))).map((r) => ({
    from: new Date(r.from),
    to: new Date(r.to),
    peakFt: Math.max(...hours.filter((h) => h.at.getTime() >= r.from && h.at.getTime() < r.to).map((h) => h.centerFt)),
  }))
}

/** Daylight at a spot: the sun's centre above -0.8° (the home's own test). */
export const daylightAt = (at: LatLon) => (t: Date): boolean => getPosition(t, at.lat, at.lon).altitude > -0.8

/** The one window: the first surf run not yet over; null when none is left in the series. */
export function surfWindow(series: readonly RangeHour[], now: Date, daylight: (t: Date) => boolean): BestStretch | null {
  return surfRuns(series, daylight).find((r) => r.to.getTime() > now.getTime()) ?? null
}

/** The window's first hour still to come (now's, when it is on): the size the home's card says, the tile's when it is on now. */
export function windowHour(series: readonly RangeHour[], w: BestStretch, now: Date): RangeHour | null {
  const from = Math.max(w.from.getTime(), Math.floor(now.getTime() / HOUR) * HOUR)
  return series.find((h) => h.at.getTime() >= from && h.at.getTime() < w.to.getTime()) ?? null
}

const shortDay = (at: Date, timeZone: string) => new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone }).format(at)

/** "" for today, "tmrw" for tomorrow, else the weekday: the day word after a time. */
export function dayWord(at: Date, now: Date, timeZone: string): string {
  const d = localDate(at, timeZone)
  const today = localDate(now, timeZone)
  if (d === today) return ''
  const next = new Date(Date.parse(`${today}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
  return d === next ? 'tmrw' : shortDay(at, timeZone)
}

/** "6a–8a" (and " tmrw") for a stretch. */
export function stretchWords(s: BestStretch, now: Date, timeZone: string): string {
  const day = dayWord(s.from, now, timeZone)
  return `${formatShortHour(s.from, timeZone)}–${formatShortHour(s.to, timeZone)}${day === '' ? '' : ` ${day}`}`
}

/** The wind's direction near now: the station's report when fresh, else the forecast (the same blend rangeHourAt reads). Null when neither said. */
export function windFromNow(sea: Pick<SurfSea, 'wind'>, now: Date, station: StationObs | null): number | null {
  const wind = sea.wind
  if (wind === null) return null
  const model = (t: Date) => {
    const mps = hourlyAt(wind, 'wind_speed_10m', t)
    return mps === null ? null : { mps, fromDeg: hourlyAt(wind, 'wind_direction_10m', t), gustMps: null }
  }
  const half = new Date(floorHour(now) + HOUR / 2)
  const blown = obsFresh(station, now) ? nowcastAt(model, station, half) : model(half)
  return blown?.fromDeg ?? null
}

export interface SurfHero {
  eyebrow: string
  value: string
  sub: string
  /** The one number the one-number audit reads (data-shared="surf"). */
  shared: string | null
}

const KT_TO_MPS = 0.514444

/** "Choppy · NNE 8 kt cross-shore": the texture, then where the wind is from, how hard, and its side of the beach. */
export function surfSub(hour: RangeHour | null, side: string | null, windFromDeg: number | null, units: Units): string {
  if (hour === null) return 'The forecast did not say for this hour'
  /* Batch SIMPLE-3, Section 5.2: under 5 kt the water is glassy and the side of the beach means nothing. */
  if (!hour.chop && isCalmGlassy(hour.windKt)) return CALM_GLASSY_WORDS
  const texture = hour.chop ? 'Choppy' : hour.shape === null ? null : SHAPE_WORD[hour.shape].replace(/^./, (c) => c.toUpperCase())
  const wind = hour.windKt === null ? 'wind not forecast' : [windFromDeg === null ? null : compass(windFromDeg), formatWind(hour.windKt * KT_TO_MPS, units.wind), side].filter((x) => x !== null).join(' ')
  return [texture, wind].filter((x) => x !== null).join(' · ')
}

export function surfHero(call: SurfCall | null, hour: RangeHour | null, side: string | null, windFromDeg: number | null, units: Units): SurfHero {
  if (call === null) return { eyebrow: 'NOW', value: '—', sub: 'The forecast did not say for this hour', shared: null }
  const word = (call.quality ?? call.size).split(' · ')[0]
  return { eyebrow: `NOW · ${word.toUpperCase()}`, value: call.words, sub: surfSub(hour, side, windFromDeg, units), shared: call.words }
}
