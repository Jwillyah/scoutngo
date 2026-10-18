import { describe, expect, it } from 'vitest'
import { HORIZON_BEARING_STEP, readHorizonProfile } from './horizonProfile.ts'
import { horizonAngleAt } from '../core/skyWindow.ts'

const VENUE = { lat: 38.7567229, lon: -78.2675403 }

/** A map whose DEM is a flat plateau at a given height, with terrain on. */
const plateau = (height: number) => ({
  getTerrain: () => ({}),
  queryTerrainElevation: () => height,
})

describe('reading the horizon profile', () => {
  it('returns a sample every 15 degrees, all the way round', () => {
    const got = readHorizonProfile(plateau(1000), VENUE)
    expect(got.kind).toBe('terrain')
    if (got.kind !== 'terrain') return
    expect(got.samples).toHaveLength(360 / HORIZON_BEARING_STEP)
    expect(got.samples.map((s) => s.azimuth)).toContain(0)
    expect(got.samples.map((s) => s.azimuth)).toContain(345)
  })

  it('reports a flat plateau as a horizon at zero, because it is', () => {
    const got = readHorizonProfile(plateau(1000), VENUE)
    if (got.kind !== 'terrain') throw new Error('expected terrain')
    for (const sample of got.samples) expect(sample.angleDegrees).toBeCloseTo(0, 6)
  })

  it('reports a negative horizon from a summit, where the land falls away', () => {
    /* Observer high, everything around lower. */
    const summit = {
      getTerrain: () => ({}),
      queryTerrainElevation: (at: [number, number]) =>
        Math.abs(at[0] - VENUE.lon) < 1e-9 && Math.abs(at[1] - VENUE.lat) < 1e-9 ? 2000 : 1000,
    }
    const got = readHorizonProfile(summit, VENUE)
    if (got.kind !== 'terrain') throw new Error('expected terrain')
    for (const sample of got.samples) expect(sample.angleDegrees).toBeLessThan(0)
  })

  it('finds a real ridge angle and puts it in the right direction', () => {
    /*
     * A wall 1000 m up, only to the east. The horizon there should be high
     * and the horizon to the west should not be.
     */
    const ridge = {
      getTerrain: () => ({}),
      queryTerrainElevation: (at: [number, number]) =>
        at[0] > VENUE.lon + 0.0005 ? 2000 : 1000,
    }
    const got = readHorizonProfile(ridge, VENUE)
    if (got.kind !== 'terrain') throw new Error('expected terrain')
    expect(horizonAngleAt(got, 90)).toBeGreaterThan(5)
    expect(horizonAngleAt(got, 270)).toBeLessThanOrEqual(0)
  })
})

describe('when there is no DEM, it says flat rather than implying terrain', () => {
  it('is flat with terrain switched off', () => {
    const off = { getTerrain: () => null, queryTerrainElevation: () => 1000 }
    expect(readHorizonProfile(off, VENUE).kind).toBe('flat')
  })

  it('is flat with no venue', () => {
    expect(readHorizonProfile(plateau(1000), null).kind).toBe('flat')
  })

  it('is flat when the DEM has no answer at the observer', () => {
    const silent = { getTerrain: () => ({}), queryTerrainElevation: () => null }
    expect(readHorizonProfile(silent, VENUE).kind).toBe('flat')
  })

  it('never returns a terrain profile with no samples in it', () => {
    /*
     * The one shape skyWindow refuses outright. If this function could ever
     * produce it, the app would show an unknown instead of a window and the
     * cause would be three files away.
     */
    const observerOnly = {
      getTerrain: () => ({}),
      queryTerrainElevation: (at: [number, number]) =>
        Math.abs(at[0] - VENUE.lon) < 1e-9 && Math.abs(at[1] - VENUE.lat) < 1e-9 ? 1000 : null,
    }
    const got = readHorizonProfile(observerOnly, VENUE)
    expect(got.kind).toBe('flat')
    if (got.kind === 'terrain') expect(got.samples.length).toBeGreaterThan(0)
  })
})
