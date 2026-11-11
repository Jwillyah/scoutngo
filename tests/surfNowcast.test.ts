import { describe, expect, it } from 'vitest'
import { beachFactorAt } from '../src/core/beachFactor.ts'
import { buoyFaceFt } from '../src/core/spotSkill.ts'
import { leanRange, SURF_FADE_MS, surfLeanWeight } from '../src/core/surfNowcast.ts'
import { SURF_SPOTS } from '../src/data/surfSpots.ts'
import type { BuoyReading } from '../src/lib/buoy.ts'
import { nearestBuoys } from '../src/lib/buoy.ts'
import { buoyLean, LEAN_BUOY_MAX_AGE_MS } from '../src/lib/surfPageData.ts'
import { surfNowFrom } from '../src/lib/useSurfNow.ts'
import type { SurfSea } from '../src/lib/useSurfSea.ts'
import type { Hourly } from '../src/lib/tideSheetData.ts'

/*
 * THE SURF NOWCAST (Batch Beach, Section 2). Mirlo Beach, 10 Nov: clean
 * offshore 3 ft at 12 s on 44095, and the tag said "SMALL" from the model.
 * Fixtures, not observations: a model running small (0.5 m, 12 s, from the
 * E) and the buoy as the report quoted it (3.0 ft, 12 s, from the E), with a
 * 5 kt west wind (offshore at an east-facing beach).
 */
const MIRLO = SURF_SPOTS.find((s) => s.id === 'mirlo-beach') as (typeof SURF_SPOTS)[number]
const NOW = Date.parse('2026-11-10T12:00:00Z')
const TZ = 'America/New_York'
const NO_STATS = { n: 0, biasFt: null, spreadFt: null, days: 0 }
const hours = Array.from({ length: 48 }, (_, i) => NOW - 12 * 3_600_000 + i * 3_600_000)
const marine: Hourly = { times: hours, values: { swell_wave_height: hours.map(() => 0.5), swell_wave_period: hours.map(() => 12), swell_wave_direction: hours.map(() => 90) } }
const wind: Hourly = { times: hours, values: { wind_speed_10m: hours.map(() => 2.5), wind_direction_10m: hours.map(() => 270) } }
const pick = nearestBuoys(MIRLO.at, 1, MIRLO.facing)[0]
const buoy = (atMs: number): BuoyReading => ({ status: 'ok', buoy: pick, at: new Date(atMs), waveM: 3.0 / 3.28084, periodS: 12, fromDeg: 90, split: null })
const sea = (b: BuoyReading | null): SurfSea => ({ status: 'ready', marine, wind, facing: MIRLO.facing, facingState: 'ok', buoy: b, factor: beachFactorAt(MIRLO.at) })

describe('the surf nowcast: the next 6 h lean to the buoy, then the model', () => {
  it('the weight: 1 at the reading, half at 3 h, 0 at 6 h and before it', () => {
    const lean = { at: NOW, missFt: 2 }
    expect(surfLeanWeight(lean, NOW)).toBe(1)
    expect(surfLeanWeight(lean, NOW + SURF_FADE_MS / 2)).toBeCloseTo(0.5, 9)
    expect(surfLeanWeight(lean, NOW + SURF_FADE_MS)).toBe(0)
    expect(surfLeanWeight(lean, NOW - 3_600_000)).toBe(0)
  })

  it('the range moves with the centre and never goes below 0', () => {
    const r = { centerFt: 1, lowFt: 0.5, highFt: 1.5, corrected: false }
    expect(leanRange(r, { at: NOW, missFt: 2 }, NOW).range).toMatchObject({ centerFt: 3, lowFt: 2.5, highFt: 3.5 })
    expect(leanRange(r, { at: NOW, missFt: -3 }, NOW).range).toMatchObject({ centerFt: 0, lowFt: 0, highFt: 0 })
    expect(leanRange(r, null, NOW)).toEqual({ range: r, shiftFt: 0 })
  })

  it('Mirlo: the model alone says Small; with the buoy the hour reads the buoy’s face, and the tag Fun', () => {
    const at = NOW - 20 * 60_000
    const without = surfNowFrom(sea(null), NO_STATS, new Date(NOW), TZ).now
    expect(without?.tag).toBe('Small')
    const face = buoyFaceFt({ waveM: 3.0 / 3.28084, periodS: 12, fromDeg: 90 }, MIRLO.facing, beachFactorAt(MIRLO.at)) as number
    expect(face).toBeGreaterThanOrEqual(3)
    const lean = buoyLean(marine, wind, buoy(at), MIRLO.facing, NO_STATS, beachFactorAt(MIRLO.at), NOW)
    expect(lean?.missFt).toBeGreaterThan(1)
    const withBuoy = surfNowFrom(sea(buoy(at)), NO_STATS, new Date(NOW), TZ).now
    /* Read at half past: 50 minutes after the reading, the lean is still 1 - 50/360. */
    expect(withBuoy?.centerFt).toBeCloseTo((without?.centerFt as number) + (1 - 50 / 360) * (lean?.missFt as number), 6)
    expect(withBuoy?.tag).toBe('Fun')
    expect(withBuoy?.range.lowFt).toBeLessThanOrEqual(face)
  })

  it('a stale buoy leans nothing', () => {
    expect(buoyLean(marine, wind, buoy(NOW - LEAN_BUOY_MAX_AGE_MS - 60_000), MIRLO.facing, NO_STATS, 1, NOW)).toBeNull()
    expect(buoyLean(marine, wind, { status: 'none', reason: 'x' }, MIRLO.facing, NO_STATS, 1, NOW)).toBeNull()
  })
})
