/*
 * THE SURF ESTIMATE THROUGH A DAY, hour by hour, from the Open-Meteo Marine
 * series: the swell when it is given, the combined sea when it is not, broken
 * at the beach by src/core/surf.ts.
 */
import { surfEstimate, surfShape, type SurfEstimate, type SurfShape } from '../core/surf.ts'
import { hourlyAt, type Hourly } from './tideSheetData.ts'

export interface SurfHour {
  at: Date
  estimate: SurfEstimate
  swellFt: number
  periodS: number
  fromDeg: number
  windWaveFt: number | null
}

export function surfAt(marine: Hourly, at: Date, facing: number | null): SurfHour | null {
  const h = hourlyAt(marine, 'swell_wave_height', at) ?? hourlyAt(marine, 'wave_height', at)
  const t = hourlyAt(marine, 'swell_wave_period', at) ?? hourlyAt(marine, 'wave_period', at)
  const d = hourlyAt(marine, 'swell_wave_direction', at) ?? hourlyAt(marine, 'wave_direction', at)
  if (h === null || t === null || d === null) return null
  const ww = hourlyAt(marine, 'wind_wave_height', at)
  return { at, estimate: surfEstimate(h, t, d, facing), swellFt: h * 3.28084, periodS: t, fromDeg: d, windWaveFt: ww === null ? null : ww * 3.28084 }
}

export function surfDay(marine: Hourly, from: number, facing: number | null): SurfHour[] {
  const out: SurfHour[] = []
  for (let i = 0; i < 24; i += 1) {
    const s = surfAt(marine, new Date(from + i * 3_600_000 + 1_800_000), facing)
    if (s !== null) out.push(s)
  }
  return out
}

export function surfWords(hour: SurfHour, windMps: number | null, windFrom: number | null, facing: number | null): { size: string; shape: SurfShape | null } {
  return { size: hour.estimate.size, shape: windMps === null || windFrom === null ? null : surfShape(windMps, windFrom, facing) }
}
