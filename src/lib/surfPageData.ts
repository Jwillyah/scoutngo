/*
 * THE SURF PAGE v2's HOURS (Batch N, Section 1): the forecast series read
 * hour by hour into the line and band the page draws. Every number is from
 * src/core (surf.ts, spotSkill.ts, surfRange.ts, briefing.ts); this only
 * reads the series and hands them over.
 *
 * The face is surfAt's (src/lib/surfDay.ts), the same one the home's surf
 * card and the per-spot check (src/lib/useSpotSkill.ts) use: one source.
 */
import { surfTag, windTag, type SurfTag, type WindTag } from '../core/briefing.ts'
import { surfEstimate, surfShape, type SurfShape } from '../core/surf.ts'
import { buoyFaceFt, correctedRange, type SkillSample, type SpotStats, type SurfRange } from '../core/spotSkill.ts'
import { peakHour, seaSpreadFt } from '../core/surfRange.ts'
import { zonedTimeToUtc } from '../core/timezone.ts'
import type { BuoyReading } from './buoy.ts'
import { surfAt } from './surfDay.ts'
import { hourlyAt, type Hourly } from './tideSheetData.ts'

export interface RangeHour {
  at: Date
  /** The face the forecast gives, before this spot's correction, feet. */
  forecastFt: number
  /** The line (corrected centre) and the likely range. */
  range: SurfRange
  centerFt: number
  /** The spread used for the band, feet (see SURF_SPREAD_SOURCE); null when the forecast gave one reading. */
  spreadFt: number | null
  periodS: number
  fromDeg: number
  shape: SurfShape | null
  side: WindTag | null
  clean: boolean
  tag: SurfTag
}

/** The whole sea's face (wave_*), only when the swell was what surfAt used; else null (one reading, no spread). */
function wholeSeaFaceFt(marine: Hourly, at: Date, facing: number | null): number | null {
  if (hourlyAt(marine, 'swell_wave_height', at) === null) return null
  const h = hourlyAt(marine, 'wave_height', at)
  const t = hourlyAt(marine, 'wave_period', at)
  const d = hourlyAt(marine, 'wave_direction', at)
  return h === null || t === null || d === null ? null : surfEstimate(h, t, d, facing).faceFt
}

/** One hour, or null where the forecast said nothing. */
export function rangeHourAt(marine: Hourly, wind: Hourly | null, at: Date, facing: number | null, stats: SpotStats): RangeHour | null {
  const s = surfAt(marine, at, facing)
  if (s === null) return null
  const mps = wind === null ? null : hourlyAt(wind, 'wind_speed_10m', at)
  const from = wind === null ? null : hourlyAt(wind, 'wind_direction_10m', at)
  /* The briefing's shape (src/lib/useBriefing.ts): with no direction, never Messy. */
  const shape = mps === null ? null : surfShape(mps, from ?? 0, from === null ? null : facing)
  const spread = seaSpreadFt(s.estimate.faceFt, wholeSeaFaceFt(marine, at, facing))
  const range = correctedRange(s.estimate.faceFt, spread, stats)
  return {
    at,
    forecastFt: s.estimate.faceFt,
    range,
    centerFt: range.centerFt,
    spreadFt: spread,
    periodS: s.periodS,
    fromDeg: s.fromDeg,
    shape,
    side: windTag(from, facing),
    clean: shape === 'Clean',
    tag: surfTag(range.centerFt, shape),
  }
}

/* The hours the page draws, local: 5 AM to 8 PM, each at half past (the home's hours). */
export const FIRST_HOUR = 5
export const LAST_HOUR = 20

/** A local day's hours, FIRST_HOUR to LAST_HOUR, at half past. */
export function dayHours(marine: Hourly, wind: Hourly | null, isoDate: string, timeZone: string, facing: number | null, stats: SpotStats): RangeHour[] {
  const out: RangeHour[] = []
  for (let h = FIRST_HOUR; h <= LAST_HOUR; h += 1) {
    const t = zonedTimeToUtc(isoDate, `${String(h).padStart(2, '0')}:30`, timeZone)
    if (t === null) continue
    const r = rangeHourAt(marine, wind, t, facing, stats)
    if (r !== null) out.push(r)
  }
  return out
}

export const addDays = (iso: string, n: number): string => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

/** Seven days from `today`, each its biggest hour (null where the forecast does not reach). */
export function weekPeaks(marine: Hourly, wind: Hourly | null, today: string, timeZone: string, facing: number | null, stats: SpotStats): { date: string; peak: RangeHour | null }[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i)
    return {
      date,
      peak: peakHour(dayHours(marine, wind, date, timeZone, facing, stats)),
    }
  })
}

export interface BuoyDot {
  at: Date
  faceFt: number
  /** 'live': the reading on screen now; 'kept': one this phone checked earlier (the per-spot book). */
  from: 'live' | 'kept'
}

/**
 * The buoy readings on the chart: the ones this phone checked at this spot
 * in the day's window (src/lib/spotSkillStore.ts, one an hour, kept to the
 * hour, drawn at its middle), and the latest reading, at its own time.
 * All as faces by buoyFaceFt, the forecast's own function.
 */
export function buoyDots(kept: readonly SkillSample[], live: BuoyReading | null, facing: number | null, from: number, to: number): BuoyDot[] {
  const out: BuoyDot[] = []
  let liveHour: number | null = null
  if (live !== null && live.status === 'ok') {
    const ft = buoyFaceFt({ waveM: live.waveM, periodS: live.periodS, fromDeg: live.fromDeg }, facing)
    const t = live.at.getTime()
    if (ft !== null && t >= from && t <= to) {
      out.push({ at: live.at, faceFt: ft, from: 'live' })
      liveHour = Math.floor(t / 3_600_000)
    }
  }
  for (const s of kept) {
    const mid = s.at + 1_800_000
    if (mid < from || mid > to || Math.floor(s.at / 3_600_000) === liveHour) continue
    out.push({ at: new Date(mid), faceFt: s.buoyFt, from: 'kept' })
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime())
}
