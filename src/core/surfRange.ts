/*
 * THE SURF PAGE'S RANGE (Batch N, Section 1 "Surf (honest)"): the arithmetic
 * behind a headline that is a range, never one number, and the checks drawn
 * on top of it. The page (src/components/SurfPageV2.tsx) only words and
 * draws what is here.
 *
 *   spread     how far apart two readings of the same forecast sea are; it
 *              stands in for the models' spread (see SURF_SPREAD_SOURCE)
 *   words      "1–2 ft": the band's ends, always two different numbers
 *   buoy       the buoy's face against the forecast's, at the reading's hour
 *   clean runs the hours with a clean surface, joined into stretches
 *   week       each day's biggest hour, with its band
 *
 * The band itself is src/core/spotSkill.ts correctedRange: the spread here
 * and this spot's own error against the buoy, combined there.
 */
import type { SurfRange } from './spotSkill.ts'

/*
 * WHERE THE SPREAD COMES FROM. Open-Meteo Marine is one model (its best
 * match), so there is no per-hour spread between models for the surf. What
 * the forecast does give is the sea two ways: the swell on its own
 * (swell_wave_*), which is what the face is broken from, and the whole sea,
 * swell and wind waves together (wave_*). Both are broken at the beach by the
 * same surfEstimate(); how far apart the two faces come out is how much the
 * answer depends on which part of the sea reaches the sand, and is used as
 * the spread (high minus low). Where the forecast has only one of the two,
 * there is no spread (null) and the band is this spot's error alone.
 */
export const SURF_SPREAD_SOURCE = 'the swell alone against the whole sea (swell and wind waves), each broken at this beach'

/** High minus low of the two faces, feet; null when either is missing. */
export function seaSpreadFt(swellFaceFt: number | null, wholeSeaFaceFt: number | null): number | null {
  if (swellFaceFt === null || wholeSeaFaceFt === null || !Number.isFinite(swellFaceFt) || !Number.isFinite(wholeSeaFaceFt)) return null
  return Math.abs(swellFaceFt - wholeSeaFaceFt)
}

/** The band's ends in whole feet, always two different numbers: "1–2 ft" (en dash). Never a single number. */
export function rangeEnds(lowFt: number, highFt: number): [number, number] {
  const lo = Math.max(0, Math.round(Math.min(lowFt, highFt)))
  const hi = Math.max(lo + 1, Math.round(Math.max(lowFt, highFt)))
  return [lo, hi]
}

export function rangeWords(r: Pick<SurfRange, 'lowFt' | 'highFt'>, unit = 'ft'): string {
  const [lo, hi] = rangeEnds(r.lowFt, r.highFt)
  return `${lo}–${hi}${unit === '' ? '' : ` ${unit}`}`
}

/*
 * THE BUOY AGAINST THE FORECAST. Within BUOY_MATCH_FT either way of the line
 * the page draws (the corrected centre) is "in line with"; outside it, bigger
 * or smaller. Half a foot: the band's own floor (spotSkill BAND_FLOOR_FT),
 * the finest a buoy tens of km off can pin a beach's faces.
 */
export const BUOY_MATCH_FT = 0.5
export type BuoyVs = 'in line with' | 'bigger than' | 'smaller than'

export function buoyVsForecast(buoyFt: number, forecastFt: number, toleranceFt = BUOY_MATCH_FT): BuoyVs {
  const d = buoyFt - forecastFt
  if (Math.abs(d) <= toleranceFt) return 'in line with'
  return d > 0 ? 'bigger than' : 'smaller than'
}

/** Consecutive clean hours as stretches [from, to), each hour `stepMs` long. */
export function cleanRuns(hours: readonly { at: number; clean: boolean }[], stepMs = 3_600_000): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = []
  for (const h of hours) {
    if (!h.clean) continue
    const last = out.at(-1)
    if (last !== undefined && h.at - (last.to - stepMs) <= stepMs) last.to = h.at + stepMs
    else out.push({ from: h.at, to: h.at + stepMs })
  }
  return out
}

/** The hour with the biggest centre; null for none. Ties go to the earlier hour. */
export function peakHour<T extends { centerFt: number }>(hours: readonly T[]): T | null {
  let best: T | null = null
  for (const h of hours) if (best === null || h.centerFt > best.centerFt) best = h
  return best
}

/** The chart's top, whole feet: the highest value rounded up, never under CHART_MIN_TOP_FT. */
export const CHART_MIN_TOP_FT = 3
export function chartTopFt(values: readonly number[]): number {
  const finite = values.filter((v) => Number.isFinite(v))
  return Math.max(CHART_MIN_TOP_FT, Math.ceil(finite.length === 0 ? 0 : Math.max(...finite)))
}

/** "0.4 mi", "3 km": a decimal under 10. */
export const camDistance = (km: number, miles: boolean): string => {
  const v = miles ? km / 1.609 : km
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${miles ? 'mi' : 'km'}`
}
