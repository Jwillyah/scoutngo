import { describe, expect, it } from 'vitest'
import { seaNow, surfLine } from '../src/lib/useSurfNow.ts'
import type { SurfSea } from '../src/lib/useSurfSea.ts'
import type { BuoyReading } from '../src/lib/buoy.ts'
import type { Hourly } from '../src/lib/tideSheetData.ts'

/* Batch QA, Section 0B (field 10 Nov): "12 s at 44099" up top, "1.7 ft · 9 s" on the swell bar, "swell 2.0 ft · 12 s" on the buoy card. One source. */
const NOW = new Date('2026-11-10T12:00:00Z')
const hours = Array.from({ length: 24 }, (_, i) => Date.UTC(2026, 10, 10, i))
const col = (v: number) => hours.map(() => v)
const marine: Hourly = { times: hours, values: { swell_wave_height: col(0.52), swell_wave_period: col(9), swell_wave_direction: col(100), wind_wave_height: col(0.4), wind_wave_period: col(4), wind_wave_direction: col(80), swell_wave_peak_period: col(10) } }
const buoy = (at: Date): BuoyReading =>
  ({ status: 'ok', buoy: { id: '44099', name: 'Cape Henry (44099)', at: { lat: 36.915, lon: -75.722 } }, at, waveM: 0.91, periodS: 12, fromDeg: 100, split: { swellM: 0.61, swellS: 12, swellFrom: 'E', windWaveM: 0.4, windWaveS: 4, windWaveFrom: 'ENE' } }) as unknown as BuoyReading
const sea = (b: BuoyReading | null): SurfSea => ({ status: 'ready', marine, wind: null, facing: 100, facingState: 'ok', buoy: b })

describe('the sea now, one source', () => {
  it('a fresh buoy: its own parts, and the period every line says is its swell’s', () => {
    const s = seaNow(sea(buoy(new Date(NOW.getTime() - 30 * 60_000))), NOW)
    expect(s.from).toBe('buoy')
    expect(s.parts[0]).toMatchObject({ name: 'Swell', periodS: 12 })
    expect(s.period?.words).toBe('12 s at 44099')
    expect(s.parts.map((p) => p.periodS)).not.toContain(9)
  })
  it('an old buoy: the forecast’s parts, and the period the forecast swell’s, never a mix', () => {
    const s = seaNow(sea(buoy(new Date(NOW.getTime() - 5 * 3_600_000))), NOW)
    expect(s.from).toBe('forecast')
    expect(s.parts[0]).toMatchObject({ name: 'Swell', periodS: 9 })
    expect(s.period?.s).toBe(9)
  })
  it('the line under the headline says the same period as the parts', () => {
    const fresh = sea(buoy(new Date(NOW.getTime() - 30 * 60_000)))
    const line = surfLine(fresh, { range: { lowFt: 2, highFt: 3 }, periodS: 9 } as never, NOW)
    expect(line).toContain('12 s at 44099')
  })
})
