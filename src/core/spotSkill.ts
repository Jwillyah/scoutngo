/*
 * PER-SPOT SURF ACCURACY (Batch N, Section 5): how the surf forecast has done
 * at THIS spot, kept on this phone, used to shift the line and size the band.
 *
 * WHAT IS COMPARED. Once an hour while the app is open, two face heights for
 * the same instant (the buoy reading's time):
 *
 *   forecast   the face height the app shows: Open-Meteo Marine's swell (or
 *              the combined sea when no swell is given) broken at the beach
 *              by surfEstimate() (src/lib/surfDay.ts surfAt, as useBriefing)
 *   buoy       the nearest NDBC buoy's whole sea, WVHT, DPD and MWD, broken
 *              by THE SAME surfEstimate() with the same beach facing
 *
 * One function on both sides, so the only thing that differs is the input:
 * the forecast's sea against the sea the buoy measured. Whatever the buoy
 * carries that the forecast's swell leaves out (a local wind sea, say) is part
 * of the forecast's error here, which is what the correction is for.
 *
 * A sample whose buoy reading has no period, or no direction at a beach with
 * a known facing, is not taken: the break cannot be worked out, and a guess
 * would be a number we do not know.
 *
 * STATS. Over the last SKILL_WINDOW_DAYS: the bias is the mean of
 * (forecast - buoy); the spread is the standard deviation of those errors
 * about the bias, the error that is left once the bias is taken out.
 *
 * CORRECTING. Only with MIN_SAMPLES hours over MIN_DAYS distinct days, so one
 * swell event does not teach the spot a habit. The centre is the forecast
 * minus the bias.
 *
 * THE BAND (half-width, each way). The models' disagreement (half the
 * high-low spread) and this spot's error combine as independent errors,
 * root-sum-square. With no usable history this spot's error is unknown, and
 * UNTESTED_ERROR_FT stands in for it, so a spot that has proved itself gets a
 * narrower band than one that has not, and one that has proved erratic a
 * wider one. Never under BAND_FLOOR_FT.
 */
import type { LatLon } from './geo.ts'
import { surfEstimate } from './surf.ts'

/** A slot for the surfer's own word on a session; no session log feeds it yet. */
export type SessionRating = 'Fun' | 'Meh' | 'Bad'

export interface SkillSample {
  /** Start of the UTC hour of the buoy reading, ms. One sample per hour. */
  at: number
  /** The face height the app showed for that hour, feet. */
  forecastFt: number
  /** The same estimate from the buoy's measured sea, feet. */
  buoyFt: number
  rating?: SessionRating | null
}

export interface SpotStats {
  /** Samples in the window. */
  n: number
  /** Mean of forecast minus buoy, feet; null with no samples. */
  biasFt: number | null
  /** Standard deviation of the errors about the bias, feet; null under two samples. */
  spreadFt: number | null
  /** Distinct UTC days with a sample. */
  days: number
}

export interface SurfRange {
  centerFt: number
  lowFt: number
  highFt: number
  /** Whether this spot's bias was taken out. */
  corrected: boolean
}

export const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000
/* A month: long enough to see a few swells, short enough to follow a season's change and a moved sandbar. */
export const SKILL_WINDOW_DAYS = 30
/* One an hour, so a full window is 720 samples a spot. */
export const MAX_SAMPLES_PER_SPOT = SKILL_WINDOW_DAYS * 24
/* A day of hours over at least three days: enough that one swell is not the whole history. */
export const MIN_SAMPLES = 24
export const MIN_DAYS = 3
/*
 * The error assumed at a spot with no history, feet. An assumption, not a
 * measurement: a breaking-height formula on a forecast sea is commonly a foot
 * out at a beach it has never been checked against. Its job is to make the
 * band wider until this spot has shown how wrong it runs.
 */
export const UNTESTED_ERROR_FT = 1
/* Half a foot each way at least: one buoy tens of km off cannot pin this beach's faces any finer. */
export const BAND_FLOOR_FT = 0.5
/* The spot key's rounding: 2 decimals is about 1 km, one beach. */
export const SPOT_KEY_DECIMALS = 2

export const spotKey = (at: LatLon): string => `${at.lat.toFixed(SPOT_KEY_DECIMALS)},${at.lon.toFixed(SPOT_KEY_DECIMALS)}`

export const hourOf = (ms: number): number => Math.floor(ms / HOUR_MS) * HOUR_MS

const inWindow = (s: SkillSample, now: number) => s.at > now - SKILL_WINDOW_DAYS * DAY_MS && s.at <= now + HOUR_MS

/** The samples with this one added (replacing one in the same hour), the window's only, oldest first, capped. */
export function addSample(samples: readonly SkillSample[], sample: SkillSample, now: number): SkillSample[] {
  const s = { ...sample, at: hourOf(sample.at) }
  const kept = samples.filter((x) => x.at !== s.at)
  kept.push(s)
  return kept
    .filter((x) => inWindow(x, now))
    .sort((a, b) => a.at - b.at)
    .slice(-MAX_SAMPLES_PER_SPOT)
}

export function spotStats(samples: readonly SkillSample[], now: number): SpotStats {
  const w = samples.filter((s) => inWindow(s, now))
  const n = w.length
  const days = new Set(w.map((s) => Math.floor(s.at / DAY_MS))).size
  if (n === 0) return { n: 0, biasFt: null, spreadFt: null, days: 0 }
  const errs = w.map((s) => s.forecastFt - s.buoyFt)
  const bias = errs.reduce((a, b) => a + b, 0) / n
  const spread = n < 2 ? null : Math.sqrt(errs.reduce((a, e) => a + (e - bias) ** 2, 0) / (n - 1))
  return { n, biasFt: bias, spreadFt: spread, days }
}

export const hasHistory = (stats: SpotStats): boolean => stats.n >= MIN_SAMPLES && stats.days >= MIN_DAYS && stats.biasFt !== null && stats.spreadFt !== null

/** The line and band for one forecast face height. modelSpreadFt: the models' high minus low, feet, or null with one model. */
export function correctedRange(forecastFt: number, modelSpreadFt: number | null, stats: SpotStats): SurfRange {
  const corrected = hasHistory(stats)
  const center = Math.max(0, corrected ? forecastFt - (stats.biasFt as number) : forecastFt)
  const models = modelSpreadFt === null ? 0 : Math.abs(modelSpreadFt) / 2
  const local = corrected ? (stats.spreadFt as number) : UNTESTED_ERROR_FT
  const half = Math.max(BAND_FLOOR_FT, Math.sqrt(models * models + local * local))
  return { centerFt: center, lowFt: Math.max(0, center - half), highFt: center + half, corrected }
}

/** What the buoy measured, as it reads (src/lib/buoy.ts). */
export interface BuoySea {
  waveM: number
  periodS: number | null
  fromDeg: number | null
}

/** The buoy's breaking face height by the forecast's own function, or null when it cannot be worked out. */
export function buoyFaceFt(sea: BuoySea, facingDeg: number | null): number | null {
  if (sea.periodS === null || sea.periodS <= 0 || !Number.isFinite(sea.waveM)) return null
  if (sea.fromDeg === null && facingDeg !== null) return null
  return surfEstimate(sea.waveM, sea.periodS, sea.fromDeg ?? 0, facingDeg).faceFt
}

/** "last 30 days (240 hours): forecast ran 0.6 ft high here against the buoy, corrected". Facts only. */
export function skillLine(stats: SpotStats, unit: 'ft' | 'm'): string {
  if (stats.n === 0) return 'no history here yet'
  if (!hasHistory(stats)) return `not enough history here yet (${stats.n} ${stats.n === 1 ? 'hour' : 'hours'} over ${stats.days} ${stats.days === 1 ? 'day' : 'days'})`
  const bias = stats.biasFt as number
  const v = unit === 'm' ? Math.abs(bias) / 3.28084 : Math.abs(bias)
  const head = `last ${SKILL_WINDOW_DAYS} days (${stats.n} hours)`
  if (v < 0.05) return `${head}: forecast matched the buoy here, no correction`
  return `${head}: forecast ran ${v.toFixed(1)} ${unit} ${bias > 0 ? 'high' : 'low'} here against the buoy, corrected`
}
