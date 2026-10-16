import { describe, expect, it } from 'vitest'
import { DEFAULT_ALTITUDE_FEET } from './air.ts'
import {
  GROUND_WIND_METERS,
  windHeightFor,
  windHeightLabel,
  windHeightNote,
} from './windHeight.ts'

/*
 * WHAT WAS REPORTED. "Yesterday the panel read WIND AT THE GROUND, 10 M
 * because I had no air position placed. Correct behaviour, wrong default."
 */
describe('a drone shoot with nothing placed yet reads at a flight height', () => {
  const chip = windHeightFor([], 'air')

  it('does not fall back to the ground', () => {
    expect(chip.feet).not.toBeNull()
    expect(chip.source).toBe('drone-default')
  })

  it('uses the same height a new air position would start at', () => {
    expect(chip.feet).toBe(DEFAULT_ALTITUDE_FEET)
  })

  /* And it says the height is assumed, so it is not mistaken for a plan. */
  it('labels it as assumed and explains why', () => {
    expect(windHeightLabel(chip)).toContain('assumed')
    expect(windHeightNote(chip)).toContain('No air position placed yet')
    expect(windHeightNote(chip)).toContain(String(DEFAULT_ALTITUDE_FEET))
  })
})

describe('a plan with air positions reads at the highest one', () => {
  const planned = windHeightFor([120, 400, 250], 'air')

  it('takes the highest, because that is what the wind limits first', () => {
    expect(planned.feet).toBe(400)
    expect(planned.source).toBe('position')
  })

  it('does not call a real position assumed', () => {
    expect(windHeightLabel(planned)).toBe('at 400 ft')
    expect(windHeightNote(planned)).toBeNull()
  })

  /* A placed position wins over the chip, whichever way the chip is set. */
  it('prefers a placed position to the default on any filter', () => {
    for (const filter of ['air', 'both', 'ground'] as const) {
      expect(windHeightFor([150], filter)).toEqual({ feet: 150, source: 'position' })
    }
  })
})

/*
 * ONLY ON 'air'. On Both the shoot has not committed to flying, and assuming a
 * flight height there puts a 200 ft wind in front of somebody shooting a
 * wedding from the lawn.
 */
describe('a shoot that has not said it is flying reads at the ground', () => {
  for (const filter of ['both', 'ground'] as const) {
    it(`reads the ground on ${filter}`, () => {
      const height = windHeightFor([], filter)
      expect(height).toEqual({ feet: null, source: 'ground' })
      expect(windHeightLabel(height)).toBe(`at the ground, ${GROUND_WIND_METERS} m`)
      expect(windHeightNote(height)).toBeNull()
    })
  }
})

describe('the height is always stated', () => {
  it('never produces a label with no height in it', () => {
    for (const height of [
      windHeightFor([], 'ground'),
      windHeightFor([], 'air'),
      windHeightFor([300], 'air'),
    ]) {
      const label = windHeightLabel(height)
      expect(label).toMatch(/\d/)
      expect(label.startsWith('at ')).toBe(true)
    }
  })
})
