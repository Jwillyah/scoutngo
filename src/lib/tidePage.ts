import type { LatLon } from '../core/geo.ts'
import { glassMornings, type Morning } from '../core/glassMornings.ts'
import { localDate } from '../core/moonTimes.ts'
import { tideWeek } from '../core/moonTides.ts'
import { saneTide } from '../core/sanity.ts'
import { sunriseOn } from '../core/sunrise.ts'
import { directionAt, levelAt, type TideDirection, type TideExtreme } from '../core/tide.ts'
import { dayRangeFeet, nextTurns, springOrNeap, tideHeight, typicalRangeFeet } from '../core/tideWindow.ts'
import { formatClock, formatShortClock } from '../core/timezone.ts'
import { hourlyAt } from './tideSheetData.ts'
import type { TideInfo } from './useTide.ts'
import type { TideSheetData } from './useTideSheet.ts'
import type { Units } from './units.ts'
import type { TapInRow } from '../components/TapInPage.tsx'

/*
 * THE TIDE PAGE'S WORDS, as the tap-in skeleton wants them (Batch SIMPLE-2,
 * Section 1; board Page_Tide). Every value is the station's own table or an
 * existing function over it; a dash where nothing was said. Nothing here is
 * asked of a model.
 */

/** Mirror mornings are looked for this far ahead; NOAA's month reaches it, the wind forecast stops sooner. */
export const MIRROR_DAYS = 30
/** The curve shows this long before now and after it. */
export const WINDOW_BEFORE_H = 2
export const WINDOW_AFTER_H = 16

/** The mirror mornings (src/core/glassMornings.ts) from the month's lows and the wind forecast: the Tide page's list and its row read one list. */
export function mirrorMornings(i: { today: string; data: TideSheetData; venue: LatLon; timeZone: string }): Morning[] {
  const facing = i.data.facing.value !== null && i.data.facing.value !== 'inland' ? i.data.facing.value.facing : null
  const days = Array.from({ length: MIRROR_DAYS }, (_, k) => {
    const d = new Date(Date.parse(`${i.today}T12:00:00Z`) + k * 86_400_000).toISOString().slice(0, 10)
    return { date: d, sunrise: sunriseOn(d, i.venue.lat, i.venue.lon, i.timeZone) }
  })
  const lows = (i.data.month.value ?? []).filter((e) => e.kind === 'low').map((e) => e.at)
  const wind = i.data.wind.value
  const windAt = (t: Date) => {
    if (wind === null) return null
    const s = hourlyAt(wind, 'wind_speed_10m', t)
    const f = hourlyAt(wind, 'wind_direction_10m', t)
    return s === null || f === null ? null : { speedMps: s, fromDeg: f }
  }
  return glassMornings(days, lows, windAt, facing)
}

const DIRECTION_WORD: Record<TideDirection, string> = { rising: 'Rising', falling: 'Falling', slack: 'Turning' }
const weekday = (date: string) => new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))

export interface TidePageModel {
  eyebrow: string
  /** "Low 5:48p": the next turn, or a dash. */
  value: string
  shared: { key: string; value: string } | null
  sub: string
  /** The same line for a finger on the curve at `at`: "1.6 ft at 7:10 PM". */
  subAt: (at: Date) => string
  next: TideExtreme | null
  following: TideExtreme | null
  window: { from: Date; to: Date }
  marks: { at: Date; kind: 'high' | 'low'; label: string }[]
  rows: TapInRow[]
}

export function tidePageModel(i: { now: Date; tide: Extract<TideInfo, { status: 'ok' }>; data: TideSheetData; venue: LatLon; timeZone: string; units: Units }): TidePageModel {
  const { now, tide, data, venue, timeZone, units } = i
  const { extremes, curve } = tide.predictions
  const all = [...extremes, ...(data.month.value ?? [])]
  const turns = nextTurns(all, now)
  const ahead = [...all].filter((e) => e.at.getTime() > now.getTime()).sort((a, b) => a.at.getTime() - b.at.getTime())
  const next = turns.next
  const following = ahead.find((e) => next !== null && e.at.getTime() > next.at.getTime()) ?? null
  const today = localDate(now, timeZone)
  const range = dayRangeFeet(extremes, today, timeZone)
  const week = tideWeek(now)
  const typical = typicalRangeFeet(all, timeZone)
  const kind = springOrNeap(week?.kind ?? null, range, typical)
  const word = (e: TideExtreme) => (e.kind === 'high' ? 'High' : 'Low')
  const other = next === null ? null : next.kind === 'low' ? turns.high : turns.low
  const mornings = mirrorMornings({ today, data, venue, timeZone }).filter((m) => (m.mark === 'glass' || m.mark === 'surf-glass') && m.sunrise !== null && m.sunrise.getTime() > now.getTime() - 3_600_000)
  const mirror = mornings[0] ?? null
  const loadingMirror = data.month.status === 'loading' || data.wind.status === 'loading'
  const direction = directionAt(extremes, now)
  const lo = Math.min(...extremes.map((e) => e.feet))
  const hi = Math.max(...extremes.map((e) => e.feet))
  const rows: TapInRow[] = [
    { label: other === null ? 'Next turn' : `Next ${other.kind}`, value: other === null ? '—' : formatClock(other.at, timeZone), detail: other === null ? 'not in NOAA’s table yet' : tideHeight(other.feet, units.distance) },
    { label: 'Range', value: tideHeight(range, units.distance), ...(kind === null ? {} : { detail: kind }) },
    {
      label: 'Mirror morning',
      value: mirror === null ? '—' : `${weekday(mirror.date)} ${Number(mirror.date.slice(8))}`,
      detail: mirror === null ? (loadingMirror ? 'reading the month…' : 'none forecast') : `low ${mirror.low === null ? '—' : formatShortClock(mirror.low, timeZone)}`,
    },
    { label: 'Station', value: tide.station.name, detail: 'NOAA' },
  ]
  return {
    eyebrow: DIRECTION_WORD[direction],
    value: next === null ? '—' : `${word(next)} ${formatShortClock(next.at, timeZone)}`,
    shared: next === null ? null : { key: 'tide', value: `${next.kind} ${formatClock(next.at, timeZone)}`.toLowerCase() },
    sub: next === null ? 'not in NOAA’s table yet' : `${tideHeight(next.feet, units.distance)}${following === null ? '' : ` · then ${following.kind === 'high' ? 'rising' : 'falling'} to ${tideHeight(following.feet, units.distance)} at ${formatClock(following.at, timeZone)}`}`,
    subAt: (at: Date) => {
      const f = levelAt(curve, at)
      return `${tideHeight(f === null || extremes.length === 0 ? f : saneTide(f, lo, hi), units.distance)} at ${formatClock(at, timeZone)}`
    },
    next,
    following,
    window: { from: new Date(now.getTime() - WINDOW_BEFORE_H * 3_600_000), to: new Date(now.getTime() + WINDOW_AFTER_H * 3_600_000) },
    marks: next === null ? [] : [{ at: next.at, kind: next.kind, label: `${next.kind} ${formatShortClock(next.at, timeZone)}` }],
    rows,
  }
}
