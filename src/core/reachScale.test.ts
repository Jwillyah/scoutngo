import { describe, expect, it } from 'vitest'
import { RADIUS_MAX_METERS, RADIUS_MIN_METERS } from './radius.ts'
import {
  formatReach,
  metersAtPosition,
  metersToFeet,
  positionForMeters,
  REACH_STOPS,
  SNAP_WITHIN,
  snappedMetersAt,
  stopPositions,
} from './reachScale.ts'

describe('metersAtPosition', () => {
  it('starts at the floor and ends at the ceiling', () => {
    expect(metersAtPosition(0)).toBe(RADIUS_MIN_METERS)
    expect(metersAtPosition(1)).toBe(RADIUS_MAX_METERS)
  })

  it('puts every stop at its own sixth of the track', () => {
    REACH_STOPS.forEach((stop, i) => {
      expect(metersAtPosition((i + 1) / 6)).toBeCloseTo(stop, 6)
    })
  })

  it('never goes backwards as the thumb moves right', () => {
    let previous = -1
    for (let i = 0; i <= 200; i++) {
      const m = metersAtPosition(i / 200)
      expect(m).toBeGreaterThanOrEqual(previous)
      previous = m
    }
  })

  it('survives a thumb position outside the track', () => {
    expect(metersAtPosition(-3)).toBe(RADIUS_MIN_METERS)
    expect(metersAtPosition(9)).toBe(RADIUS_MAX_METERS)
    expect(metersAtPosition(Number.NaN)).toBe(RADIUS_MIN_METERS)
  })

  /*
   * THE POINT OF THE PIECEWISE SCALE. On a linear 25..2000 track, 400m would sit
   * at 19% and the whole useful range would be squeezed into the first fifth.
   */
  it('gives the useful distances most of the track', () => {
    expect(positionForMeters(400)).toBeCloseTo(0.5, 6)
    expect(positionForMeters(400)).toBeGreaterThan((400 - 25) / (2000 - 25) + 0.25)
  })
})

describe('positionForMeters', () => {
  it('round trips through metersAtPosition', () => {
    for (const meters of [25, 60, 100, 180, 250, 400, 600, 750, 1100, 1500, 2000]) {
      expect(metersAtPosition(positionForMeters(meters))).toBeCloseTo(meters, 6)
    }
  })

  it('clamps rather than running off either end', () => {
    expect(positionForMeters(-500)).toBe(0)
    expect(positionForMeters(99_999)).toBe(1)
  })
})

describe('snappedMetersAt', () => {
  it('lands exactly on a stop when the thumb is near it', () => {
    REACH_STOPS.forEach((stop, i) => {
      const at = (i + 1) / 6
      expect(snappedMetersAt(at)).toBe(stop)
      expect(snappedMetersAt(at + SNAP_WITHIN * 0.9)).toBe(stop)
      expect(snappedMetersAt(at - SNAP_WITHIN * 0.9)).toBe(stop)
    })
  })

  /*
   * SMOOTH BETWEEN THE STOPS. A slider that can only produce five numbers is a
   * set of five buttons wearing a track, and 300m is a real answer.
   */
  it('still produces the distances between the stops', () => {
    const between = snappedMetersAt((2 / 6 + 3 / 6) / 2)
    expect(REACH_STOPS).not.toContain(between)
    expect(between).toBeGreaterThan(250)
    expect(between).toBeLessThan(400)
  })

  it('never leaves the band radius.ts allows', () => {
    for (let i = 0; i <= 500; i++) {
      const m = snappedMetersAt(i / 500)
      expect(m).toBeGreaterThanOrEqual(RADIUS_MIN_METERS)
      expect(m).toBeLessThanOrEqual(RADIUS_MAX_METERS)
      expect(Number.isInteger(m)).toBe(true)
    }
  })

  it('agrees with where it says the ticks go', () => {
    stopPositions().forEach((at, i) => {
      expect(snappedMetersAt(at)).toBe(REACH_STOPS[i])
    })
  })
})

describe('formatReach', () => {
  it('reads in metres below a kilometre and kilometres above it', () => {
    expect(formatReach(400).metric).toBe('400 m')
    expect(formatReach(999).metric).toBe('999 m')
    expect(formatReach(1500).metric).toBe('1.5 km')
    expect(formatReach(2000).metric).toBe('2 km')
  })

  /* The conversion nobody should be doing in their head on a jetty. */
  it('converts to feet correctly, with a separator that survives four digits', () => {
    expect(metersToFeet(100)).toBeCloseTo(328.08, 2)
    expect(formatReach(100).imperial).toBe('328 ft')
    expect(formatReach(400).imperial).toBe('1,312 ft')
    expect(formatReach(1500).imperial).toBe('4,921 ft')
  })

  it('clamps a junk value rather than printing one', () => {
    expect(formatReach(Number.NaN).metric).toBe('400 m')
    expect(formatReach(-10).metric).toBe(`${RADIUS_MIN_METERS} m`)
  })
})
