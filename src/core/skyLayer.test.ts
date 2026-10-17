import { describe, expect, it } from 'vitest'
import { GRID_CELLS, GRID_HALF_SPAN_METERS } from './cloudGrid.ts'
import {
  gridExtentLine,
  hasSatellite,
  SKY_LAYERS,
  SKY_LAYER_LABEL,
  SKY_LAYER_NOTE,
  WIND_BAND_LABEL,
  windBand,
} from './skyLayer.ts'

describe('the two layers', () => {
  it('offers cloud and wind, and names both', () => {
    expect([...SKY_LAYERS]).toEqual(['cloud', 'wind'])
    for (const kind of SKY_LAYERS) {
      expect(SKY_LAYER_LABEL[kind]).toBeTruthy()
      expect(SKY_LAYER_NOTE[kind].length).toBeGreaterThan(40)
    }
  })

  /*
   * WIND HAS NO PHOTOGRAPH, EVER. Not for the future and not for an hour that
   * has already happened: there is no satellite image of wind at 200 feet. The
   * layer must never borrow the word "observed" from the one beside it.
   */
  it('knows only cloud can ever be observed', () => {
    expect(hasSatellite('cloud')).toBe(true)
    expect(hasSatellite('wind')).toBe(false)
  })

  it('says so in the wind note, in as many words', () => {
    expect(SKY_LAYER_NOTE.wind.toLowerCase()).toContain('no satellite picture of wind')
    expect(SKY_LAYER_NOTE.wind.toLowerCase()).toContain('model')
  })

  it('does not call the wind layer observed anywhere', () => {
    expect(SKY_LAYER_NOTE.wind.toLowerCase()).not.toContain('observed')
  })
})

/*
 * THE BANDS COME FROM THE AIRCRAFT, not from a general idea of windy. A 249 g
 * machine and an Air 3S do not meet the same air in the same state.
 */
describe('banding wind against the published rating', () => {
  /* The Air 3S: 12 m/s, from DJI's own specs. */
  const RATED = 12

  it('bands by share of the rating', () => {
    expect(windBand(2, RATED)).toBe('calm')
    expect(windBand(7.89, RATED)).toBe('workable')
    expect(windBand(10, RATED)).toBe('near-limit')
    expect(windBand(13, RATED)).toBe('over')
  })

  it('puts the boundaries where the shares are', () => {
    expect(windBand(RATED * 0.39, RATED)).toBe('calm')
    expect(windBand(RATED * 0.41, RATED)).toBe('workable')
    expect(windBand(RATED * 0.74, RATED)).toBe('workable')
    expect(windBand(RATED * 0.76, RATED)).toBe('near-limit')
    expect(windBand(RATED, RATED)).toBe('over')
  })

  /*
   * NO RATING, NO BANDS. "An invented wind limit is something somebody could
   * fly on." Null in, null out, and the key says the bands do not apply.
   */
  it('refuses to band without a rating', () => {
    expect(windBand(10, null)).toBeNull()
    expect(windBand(10, 0)).toBeNull()
    expect(windBand(10, -1)).toBeNull()
  })

  it('refuses to band a speed the model did not give', () => {
    expect(windBand(null, RATED)).toBeNull()
  })

  it('has a phrase for every band', () => {
    for (const band of ['calm', 'workable', 'near-limit', 'over'] as const) {
      expect(WIND_BAND_LABEL[band]).toBeTruthy()
    }
    /* And the loud one says what it is over, not just that it is high. */
    expect(WIND_BAND_LABEL.over).toContain('rating')
  })
})

/*
 * HOW BIG THE SQUARE IS. "At 50 mi the forecast cells cover a small square
 * around the venue with nothing around it, which reads as broken."
 */
describe('the grid says its own size', () => {
  const line = gridExtentLine()

  it('states the cells and the distance in both units', () => {
    expect(line).toContain(`${GRID_CELLS} by ${GRID_CELLS}`)
    expect(line).toContain(`${Math.round((GRID_HALF_SPAN_METERS * 2) / 1000)} km`)
    expect(line).toMatch(/\d+ mi/)
  })

  /*
   * AND IT SAYS WHAT THE OUTSIDE IS NOT. An edge with nothing beyond it reads
   * as "clear out there", which is the one thing it does not mean. Same rule
   * as the hazard layer: the app says what is asked for, never what is clear.
   */
  it('says the outside is not clear sky, it is unasked', () => {
    expect(line.toLowerCase()).toContain('not clear sky')
    expect(line.toLowerCase()).toContain('not asked for')
  })

  it('names the venue as the centre', () => {
    expect(line).toContain('centred on the venue')
  })
})
