/*
 * THE SURF ESTIMATE THROUGH A DAY, hour by hour, from the Open-Meteo Marine
 * series, broken at the beach by src/core/surf.ts.
 *
 * Batch DRONE, Section 1: now part by part (src/core/surfTransform.ts).
 * Before it, Batch Beach, Section 2: the height was the whole sea's (wave_height, what a
 * buoy's WVHT measures and what the beach factors were set against), with the
 * swell's period and direction; the swell's own height where the whole sea's
 * is missing. Swell-only ran the face 1.5 ft low at Sandbridge and called it
 * "Small" while the buoy gave "Fun": 4% of words right, 25% with the whole sea
 * (measurements/2026-11-10-accuracy-words.md, 3-9 Nov, the same week).
 */
import { BEACH_CAP, surfShape, surfSize, type SurfEstimate, type SurfShape } from '../core/surf.ts'
import { forecastSeaParts, seaFaceFt } from '../core/surfTransform.ts'
import { hourlyAt, type Hourly } from './tideSheetData.ts'

export interface SurfHour {
  at: Date
  estimate: Pick<SurfEstimate, 'faceFt' | 'size'>
  swellFt: number
  periodS: number
  fromDeg: number
  windWaveFt: number | null
}

export function surfAt(marine: Hourly, at: Date, facing: number | null, factor: number = BEACH_CAP): SurfHour | null {
  const swell = hourlyAt(marine, 'swell_wave_height', at)
  const ww = hourlyAt(marine, 'wind_wave_height', at)
  const total = hourlyAt(marine, 'wave_height', at)
  /*
   * Batch DRONE, Section 1: the face is the sea's parts, each by its own
   * period and direction, combined by energy (src/core/surfTransform.ts), the
   * same function a buoy's reading goes through (src/core/spotSkill.ts
   * buoyFaceFt). The period and direction kept beside it are the swell's,
   * for the words and the light on the face.
   */
  const face = seaFaceFt(forecastSeaParts((n) => hourlyAt(marine, n, at)), facing, factor)
  const t = hourlyAt(marine, 'swell_wave_period', at) ?? hourlyAt(marine, 'wave_period', at)
  const d = hourlyAt(marine, 'swell_wave_direction', at) ?? hourlyAt(marine, 'wave_direction', at)
  if (face === null || t === null || d === null) return null
  return { at, estimate: { faceFt: face, size: surfSize(face) }, swellFt: (swell ?? total ?? 0) * 3.28084, periodS: t, fromDeg: d, windWaveFt: ww === null ? null : ww * 3.28084 }
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
