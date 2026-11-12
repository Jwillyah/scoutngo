/*
 * THE SURF ESTIMATE THROUGH A DAY, hour by hour, from the Open-Meteo Marine
 * series, broken at the beach by src/core/surf.ts.
 *
 * Batch Beach, Section 2: the height is the whole sea's (wave_height, what a
 * buoy's WVHT measures and what the beach factors were set against), with the
 * swell's period and direction; the swell's own height where the whole sea's
 * is missing. Swell-only ran the face 1.5 ft low at Sandbridge and called it
 * "Small" while the buoy gave "Fun": 4% of words right, 25% with the whole sea
 * (measurements/2026-11-10-accuracy-words.md, 3-9 Nov, the same week).
 */
import { BEACH_CAP, surfEstimate, surfShape, towardBeachM, type SurfEstimate, type SurfShape } from '../core/surf.ts'
import { hourlyAt, type Hourly } from './tideSheetData.ts'

export interface SurfHour {
  at: Date
  estimate: SurfEstimate
  swellFt: number
  periodS: number
  fromDeg: number
  windWaveFt: number | null
}

export function surfAt(marine: Hourly, at: Date, facing: number | null, factor: number = BEACH_CAP): SurfHour | null {
  const swell = hourlyAt(marine, 'swell_wave_height', at)
  const ww = hourlyAt(marine, 'wind_wave_height', at)
  const total = hourlyAt(marine, 'wave_height', at)
  /* Batch TRUTH, Section 2: only the sea heading for the beach (src/core/surf.ts towardBeachM). */
  const h = (total === null ? null : towardBeachM(total, ww, hourlyAt(marine, 'wind_wave_direction', at), facing)) ?? swell
  const t = hourlyAt(marine, 'swell_wave_period', at) ?? hourlyAt(marine, 'wave_period', at)
  const d = hourlyAt(marine, 'swell_wave_direction', at) ?? hourlyAt(marine, 'wave_direction', at)
  if (h === null || t === null || d === null) return null
  return { at, estimate: surfEstimate(h, t, d, facing, factor), swellFt: (swell ?? h) * 3.28084, periodS: t, fromDeg: d, windWaveFt: ww === null ? null : ww * 3.28084 }
}

export function surfDay(marine: Hourly, from: number, facing: number | null, factor: number = BEACH_CAP): SurfHour[] {
  const out: SurfHour[] = []
  for (let i = 0; i < 24; i += 1) {
    const s = surfAt(marine, new Date(from + i * 3_600_000 + 1_800_000), facing, factor)
    if (s !== null) out.push(s)
  }
  return out
}

export function surfWords(hour: SurfHour, windMps: number | null, windFrom: number | null, facing: number | null): { size: string; shape: SurfShape | null } {
  return { size: hour.estimate.size, shape: windMps === null || windFrom === null ? null : surfShape(windMps, windFrom, facing) }
}
