import { describe, expect, it } from 'vitest'
import {
  DEFAULT_UNITS,
  formatRange,
  DISTANCE_UNITS,
  WIND_UNITS,
  distanceIn,
  distanceUnitLabel,
  formatDistance,
  formatWind,
  windIn,
  windUnitLabel,
  type DistanceUnit,
  type WindUnit,
} from './units.ts'

/*
 * ONE PLACE CONVERTS, AND THESE ARE ITS NUMBERS.
 *
 * The conversion factors are the only arithmetic in the file and the only
 * thing that can be silently wrong: a label is visibly wrong the first time
 * somebody looks at the screen, and a factor off by a percent is not.
 */
describe('wind in the chosen unit', () => {
  /* 10 m/s is 19.44 kt and 22.37 mph. Checked against the SI definitions:
   * one knot is exactly 1852 m / 3600 s, one mph is exactly 1609.344 / 3600. */
  it('converts 10 m/s to knots and miles per hour', () => {
    expect(windIn(10, 'kt')).toBeCloseTo(10 * 3600 / 1852, 6)
    expect(windIn(10, 'mph')).toBeCloseTo(10 * 3600 / 1609.344, 5)
    expect(windIn(10, 'ms')).toBe(10)
  })

  /* A DASH, NEVER A ZERO. Zero wind is a real and notable condition. */
  it('keeps an absent reading absent', () => {
    for (const unit of WIND_UNITS) {
      expect(windIn(null, unit.id)).toBeNull()
      expect(formatWind(null, unit.id)).toBe('—')
      expect(formatWind(null, unit.id)).not.toContain('0')
    }
  })

  it('refuses a non-finite reading rather than printing NaN', () => {
    expect(windIn(Number.NaN, 'kt')).toBeNull()
    expect(windIn(Number.POSITIVE_INFINITY, 'kt')).toBeNull()
    expect(formatWind(Number.NaN, 'kt')).toBe('—')
  })

  /* EVERY READING CARRIES ITS UNIT. A chip reading "14" means knots to the
   * person who wrote it and mph to somebody who set the app to mph. */
  it('writes the unit beside every number', () => {
    expect(formatWind(7.2, 'kt')).toBe('14 kt')
    expect(formatWind(7.2, 'mph')).toBe('16 mph')
    expect(formatWind(7.2, 'ms')).toBe('7 m/s')
  })

  it('labels m/s with the slash, because "ms" is milliseconds', () => {
    expect(windUnitLabel('ms')).toBe('m/s')
    expect(windUnitLabel('kt')).toBe('kt')
    expect(windUnitLabel('mph')).toBe('mph')
  })
})

describe('distance in the chosen unit', () => {
  /* The international foot is exactly 0.3048 m. */
  it('converts metres to feet exactly', () => {
    expect(distanceIn(100, 'ft')).toBeCloseTo(100 / 0.3048, 6)
    expect(distanceIn(100, 'm')).toBe(100)
    expect(distanceUnitLabel('ft')).toBe('ft')
  })

  it('keeps an absent distance absent', () => {
    expect(distanceIn(null, 'ft')).toBeNull()
    expect(formatDistance(null, 'ft')).toBe('—')
  })

  it('groups thousands, because 12192 ft is not readable in sunlight', () => {
    expect(formatDistance(3716.6, 'ft')).toBe('12,194 ft')
  })
})

/*
 * A LONG DISTANCE PICKS ITS OWN MAGNITUDE WITHIN THE CHOSEN SYSTEM.
 *
 * The nearest sky camera at 180 km is "590,551 ft" if the only choice is
 * feet, which is a number nobody reads. The system is the shooter's; the
 * magnitude is arithmetic.
 */
describe('a range, in the chosen system', () => {
  it('reads in feet under a mile and miles over it', () => {
    expect(formatRange(100, 'ft')).toBe('328 ft')
    expect(formatRange(1600, 'ft')).toBe('5,249 ft')
    /* One mile exactly is 1609.344 m, and is the first reading in miles. */
    expect(formatRange(1609.344, 'ft')).toBe('1.0 mi')
    expect(formatRange(180_000, 'ft')).toBe('112 mi')
  })

  it('reads in metres under a kilometre and kilometres over it', () => {
    expect(formatRange(100, 'm')).toBe('100 m')
    expect(formatRange(999, 'm')).toBe('999 m')
    expect(formatRange(1000, 'm')).toBe('1.0 km')
    expect(formatRange(180_000, 'm')).toBe('180 km')
  })

  /*
   * THE SWITCH IS THE SAME THRESHOLD IN BOTH SYSTEMS, so neither side sees a
   * different rule: one mile for feet, one kilometre for metres. Checked at
   * the boundary from both directions, because an off-by-one there is how a
   * reading flips between "5,280 ft" and "1.0 mi" on a number that did not
   * move.
   */
  it('switches once, at its own threshold, in each system', () => {
    expect(formatRange(1609.3, 'ft')).toContain('ft')
    expect(formatRange(1609.4, 'ft')).toContain('mi')
    expect(formatRange(999.9, 'm')).toContain(' m')
    expect(formatRange(1000.1, 'm')).toContain('km')
  })

  it('gives one decimal below ten and none above, in both systems', () => {
    expect(formatRange(9 * 1609.344, 'ft')).toBe('9.0 mi')
    expect(formatRange(11 * 1609.344, 'ft')).toBe('11 mi')
    expect(formatRange(9000, 'm')).toBe('9.0 km')
    expect(formatRange(11_000, 'm')).toBe('11 km')
  })

  /* And a distance nobody reported is a dash, like everything else here. */
  it('keeps an absent range absent', () => {
    expect(formatRange(null, 'ft')).toBe('—')
    expect(formatRange(Number.NaN, 'm')).toBe('—')
  })

  /* Each system gives a DIFFERENT answer, or one of them is not wired. */
  it('answers differently in each system', () => {
    expect(formatRange(180_000, 'ft')).not.toBe(formatRange(180_000, 'm'))
  })
})

describe('the defaults and the offered choices', () => {
  /*
   * KNOTS AND FEET, because the two things this app is for -- flying a drone
   * and reading a marine forecast -- are both quoted that way.
   */
  it('defaults to knots, feet and a 12 hour clock', () => {
    expect(DEFAULT_UNITS).toEqual({ wind: 'kt', distance: 'ft', clock: 12 })
  })

  /*
   * EVERY OFFERED UNIT CONVERTS. A unit in the picker that no converter
   * handles would silently fall through to metres per second -- which is
   * shape A in docs/failure-modes.md read backwards: one function answering
   * for a set it does not actually cover.
   */
  it('converts every unit the About sheet offers', () => {
    const windIds: WindUnit[] = WIND_UNITS.map((u) => u.id)
    expect(new Set(windIds)).toEqual(new Set<WindUnit>(['kt', 'mph', 'ms']))
    for (const unit of WIND_UNITS) {
      const formatted = formatWind(10, unit.id)
      expect(formatted).toContain(unit.label)
      expect(formatted).not.toBe('—')
    }

    const distIds: DistanceUnit[] = DISTANCE_UNITS.map((u) => u.id)
    expect(new Set(distIds)).toEqual(new Set<DistanceUnit>(['ft', 'm']))
    for (const unit of DISTANCE_UNITS) {
      expect(formatDistance(100, unit.id)).toContain(unit.label)
    }
  })

  /* Each unit must give a DIFFERENT number, or one of them is not wired. */
  it('gives three different answers for three wind units', () => {
    const answers = WIND_UNITS.map((u) => formatWind(10, u.id))
    expect(new Set(answers).size).toBe(3)
  })
})
