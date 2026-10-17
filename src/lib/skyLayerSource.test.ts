import { describe, expect, it } from 'vitest'
import type { ForecastCell } from '../core/cloudGrid.ts'
import { cloudForecastCollection } from './skyLayerSource.ts'

const AT = { lat: 38.364, lon: -75.606 }

/* The shape the live Open-Meteo grid returns, measured against the real API. */
const cell = (over: Partial<ForecastCell> = {}): ForecastCell => ({
  at: AT,
  cover: 60,
  wind: [
    { heightMeters: 10, speedMps: 7.89, fromDegrees: 15 },
    { heightMeters: 80, speedMps: 12.61, fromDegrees: 15 },
    { heightMeters: 120, speedMps: 17.03, fromDegrees: 6 },
    { heightMeters: 180, speedMps: 15.19, fromDegrees: 9 },
  ],
  ...over,
})

describe('the cloud layer', () => {
  it('draws a cell carrying its cover', () => {
    const { features } = cloudForecastCollection([cell()], 'cloud', 10, 12)
    expect(features).toHaveLength(1)
    expect(features[0].properties?.cover).toBe(60)
  })

  /* A cell with no reading is dropped: an unshaded square reads as clear sky. */
  it('drops a cell the forecast did not cover', () => {
    expect(cloudForecastCollection([cell({ cover: null })], 'cloud', 10, 12).features).toEqual([])
  })
})

describe('the wind layer', () => {
  it('draws a cell at the height being flown', () => {
    const { features } = cloudForecastCollection([cell()], 'wind', 10, 12)
    expect(features).toHaveLength(1)
    expect(features[0].properties?.speed).toBeCloseTo(7.89, 2)
  })

  /* Interpolated between the levels, the same way the readout does it. */
  it('reads between the levels for a height the model does not serve', () => {
    const { features } = cloudForecastCollection([cell()], 'wind', 100, 12)
    const speed = features[0].properties?.speed as number
    expect(speed).toBeGreaterThan(12.61)
    expect(speed).toBeLessThan(17.03)
  })

  it('bands it against the aircraft rating', () => {
    /* 7.89 of 12 is 0.66: workable. */
    expect(cloudForecastCollection([cell()], 'wind', 10, 12).features[0].properties?.band).toBe(
      'workable',
    )
    /* 17.03 of 12 is over. */
    expect(cloudForecastCollection([cell()], 'wind', 120, 12).features[0].properties?.band).toBe(
      'over',
    )
  })

  /*
   * NO RATING, NO BAND. An invented wind limit is something somebody could fly
   * on, so the cell still draws by speed and says it is unrated.
   */
  it('still draws with no rating, marked unrated', () => {
    const { features } = cloudForecastCollection([cell()], 'wind', 10, null)
    expect(features).toHaveLength(1)
    expect(features[0].properties?.band).toBe('unrated')
  })

  it('drops a cell the model gave no wind for', () => {
    expect(cloudForecastCollection([cell({ wind: [] })], 'wind', 10, 12).features).toEqual([])
    const nulls = cell({
      wind: [{ heightMeters: 10, speedMps: null, fromDegrees: null }],
    })
    expect(cloudForecastCollection([nulls], 'wind', 10, 12).features).toEqual([])
  })

  /*
   * THE BUG THIS FILE WAS EXTRACTED FOR. The wind layer drew nothing at all on
   * its first run while the fetch was returning 25 good cells. Pinned as a
   * count, by value, so "it draws something" is a test rather than a look at a
   * map.
   */
  it('draws every cell it is given, not none of them', () => {
    const grid = Array.from({ length: 25 }, () => cell())
    expect(cloudForecastCollection(grid, 'wind', 10, 12).features).toHaveLength(25)
    expect(cloudForecastCollection(grid, 'cloud', 10, 12).features).toHaveLength(25)
  })

  /* A cell with no wind FIELD at all, which is what a stale cache holds. */
  it('survives a cell from before wind was carried', () => {
    const old = { at: AT, cover: 60 } as unknown as ForecastCell
    expect(() => cloudForecastCollection([old], 'wind', 10, 12)).not.toThrow()
    expect(cloudForecastCollection([old], 'wind', 10, 12).features).toEqual([])
  })
})
