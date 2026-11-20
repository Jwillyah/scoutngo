import type { LatLon } from '../core/geo.ts'
import { localDate, moonTimesOnLocalDay } from '../core/moonTimes.ts'
import { nextPhase } from '../core/moonPhases.ts'
import { windSide } from '../core/coastFacing.ts'
import type { TideExtreme } from '../core/tide.ts'
import { moonLitPercent, nextTurns } from '../core/tideWindow.ts'
import { formatShortClock, zonedTimeToUtc } from '../core/timezone.ts'
import { pressureTrend, pressureWords } from '../core/weatherTiles.ts'
import { wetsuitWords, type WaterReading } from '../core/waterTemp.ts'
import { hourlyAt, type Hourly } from './tideSheetData.ts'
import { compass } from './tideWords.ts'
import { formatTemperature, formatWind, type Units } from './units.ts'
import type { TapInRow } from '../components/TapInPage.tsx'

/*
 * THE FISH PAGE'S WORDS (Batch SIMPLE-2, Section 4; board Page_Fish).
 *
 * NO "BEST WINDOW" IS COMPUTED, because the app has no fishing logic to
 * compute one from (no solunar or bite model exists in src/core), and a window
 * drawn from nothing would be a made-up number. What is known is shown: the
 * next tide turn (the station's own table), moonrise and moonset (suncalc on
 * the venue's own day), how much of the moon is lit, the pressure and its
 * trend, the water, the wind. If a window is ever computed, FishModel.window
 * is where it goes and TideCurve's `band` draws it.
 */

/** The curve runs from this long before now to this long after. */
export const FISH_BEFORE_H = 2
export const FISH_AFTER_H = 12

const HOUR = 3_600_000

export interface FishDay {
  date: string
  /** "Thu 19". */
  label: string
  /** "62%" or a dash. */
  moon: string
  rise: string
  set: string
  /** Highs and lows that day, "high 5:48a" in time order. */
  tides: string[]
}

export interface FishModel {
  eyebrow: string
  value: string
  sub: string
  window: { from: Date; to: Date }
  marks: { at: Date; kind: 'high' | 'low'; label: string }[]
  /** Always null today: see the note at the top. */
  best: { from: Date; to: Date; label: string } | null
  rows: TapInRow[]
}

export interface FishInput {
  now: Date
  venue: LatLon
  timeZone: string
  units: Units
  extremes: readonly TideExtreme[]
  /** The station's month, when it has come. */
  month: readonly TideExtreme[] | null
  /** Open-Meteo hourly pressure_msl (hPa), null while asking or failed. */
  extra: Hourly | null
  /** The 10 m wind by the hour (m/s), null while asking or failed. */
  wind: Hourly | null
  /** The beach's seaward facing, null when not known. */
  facing: number | null
  water: WaterReading | null
}

const clock = (at: Date | null, timeZone: string) => (at === null ? '—' : formatShortClock(at, timeZone))
const word = (e: TideExtreme) => (e.kind === 'high' ? 'High' : 'Low')

/** The moon's line for the hero and its row: the next of today's rise and set, else what happened. */
export function moonLine(now: Date, venue: LatLon, timeZone: string): { rise: Date | null; set: Date | null; next: string } {
  const m = moonTimesOnLocalDay(now, venue.lat, venue.lon, timeZone)
  const later = [m.rise === null ? null : { at: m.rise, w: 'rises' }, m.set === null ? null : { at: m.set, w: 'sets' }]
    .filter((x): x is { at: Date; w: string } => x !== null && x.at.getTime() > now.getTime())
    .sort((a, b) => a.at.getTime() - b.at.getTime())[0]
  const next = later !== undefined ? `${later.w} ${formatShortClock(later.at, timeZone)}` : m.rise === null && m.set === null ? 'no rise or set today' : m.rise !== null ? `rose ${formatShortClock(m.rise, timeZone)}` : `set ${formatShortClock(m.set as Date, timeZone)}`
  return { rise: m.rise, set: m.set, next }
}

export function fishModel(i: FishInput): FishModel {
  const { now, venue, timeZone, units } = i
  const all = [...i.extremes, ...(i.month ?? [])]
  const next = nextTurns(all, now).next
  const moon = moonLine(now, venue, timeZone)
  const from = new Date(now.getTime() - FISH_BEFORE_H * HOUR)
  const to = new Date(now.getTime() + FISH_AFTER_H * HOUR)
  const marks = i.extremes
    .filter((e) => e.at.getTime() >= from.getTime() && e.at.getTime() <= to.getTime())
    .map((e) => ({ at: e.at, kind: e.kind, label: `${e.kind} ${formatShortClock(e.at, timeZone)}` }))

  const at = (s: Hourly | null, name: string, t: Date) => (s === null ? null : hourlyAt(s, name, t))
  const hpa = at(i.extra, 'pressure_msl', now)
  const trend = pressureTrend(hpa, at(i.extra, 'pressure_msl', new Date(now.getTime() - 3 * HOUR)))
  const imperial = units.distance === 'ft'
  const mps = at(i.wind, 'wind_speed_10m', now)
  const fromDeg = at(i.wind, 'wind_direction_10m', now)
  const side = fromDeg === null || i.facing === null ? null : windSide(fromDeg, i.facing)
  const waterDeg = i.water === null ? null : formatTemperature(i.water.c, units.temperature).replace(/°[FC]$/, '°')
  const suit = i.water === null ? null : wetsuitWords(i.water.c)

  const rows: TapInRow[] = [
    { label: 'Moon', value: `${moonLitPercent(now)}%`, detail: moon.next },
    { label: 'Pressure', value: hpa === null ? '—' : `${pressureWords(hpa, imperial)}${imperial ? ' in' : ''}`, detail: hpa === null ? 'not said' : (trend ?? 'trend not said') },
    { label: 'Water', value: waterDeg ?? '—', detail: i.water === null ? 'no reading near here' : (suit ?? (i.water.site.kind === 'model' ? 'model' : 'measured')) },
    { label: 'Wind', value: mps === null ? '—' : `${formatWind(mps, units.wind)}${fromDeg === null ? '' : ` ${compass(fromDeg)}`}`, detail: mps === null ? 'not said' : (side ?? undefined) },
  ]
  return {
    eyebrow: next === null ? 'MOON' : 'NEXT TIDE TURN',
    value: next === null ? `${moonLitPercent(now)}% lit` : `${word(next)} ${formatShortClock(next.at, timeZone)}`,
    sub: `Moonrise ${clock(moon.rise, timeZone)} · moonset ${clock(moon.set, timeZone)}`,
    window: { from, to },
    marks,
    best: null,
    rows,
  }
}

const dayLabel = (date: string) => `${new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))} ${Number(date.slice(8))}`

/** Seven days from today: the moon's share lit at noon, its rise and set, and the station's highs and lows. */
export function fishWeek(now: Date, venue: LatLon, timeZone: string, extremes: readonly TideExtreme[]): FishDay[] {
  const today = localDate(now, timeZone)
  return Array.from({ length: 7 }, (_, k) => {
    const date = new Date(Date.parse(`${today}T12:00:00Z`) + k * 86_400_000).toISOString().slice(0, 10)
    const noon = zonedTimeToUtc(date, '12:00', timeZone)
    const m = noon === null ? null : moonTimesOnLocalDay(noon, venue.lat, venue.lon, timeZone)
    return {
      date,
      label: dayLabel(date),
      moon: noon === null ? '—' : `${moonLitPercent(noon)}%`,
      rise: clock(m?.rise ?? null, timeZone),
      set: clock(m?.set ?? null, timeZone),
      tides: extremes
        .filter((e) => localDate(e.at, timeZone) === date)
        .sort((a, b) => a.at.getTime() - b.at.getTime())
        .map((e) => `${e.kind} ${formatShortClock(e.at, timeZone)}`),
    }
  })
}

/** The week tab's top: the moon's share lit now, and the next full moon's day. */
export function fishWeekHero(now: Date, timeZone: string): { eyebrow: string; value: string; sub: string } {
  const full = nextPhase(now, 'full')
  const day = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone }).format(full)
  return { eyebrow: 'THE WEEK', value: `${moonLitPercent(now)}% lit`, sub: `Full moon ${day}` }
}
