import { describe, expect, it } from 'vitest'
import {
  curveFromExtremes,
  directionAt,
  extremesAround,
  feetToMetres,
  levelAt,
  nearestStation,
  nearestStations,
  positionInWindow,
  STATION_LOCAL_KM,
  STATION_USABLE_KM,
  stationProximity,
  straddlesTurn,
  tidalRangeFeet,
  tideStateAt,
  type TideExtreme,
  type TideSample,
  type TideStation,
} from './tide.ts'

/** The calibration venue, which has a NOAA station essentially on top of it. */
const VENUE = { lat: 38.364236, lon: -75.605912 }

const STATIONS: TideStation[] = [
  { id: '8571616', name: 'Salisbury, Wicomico River', at: { lat: 38.3653, lon: -75.6053 }, state: 'MD' },
  { id: '8571485', name: 'Whitehaven', at: { lat: 38.2653, lon: -75.7853 }, state: 'MD' },
  { id: '8518750', name: 'The Battery, NY', at: { lat: 40.7, lon: -74.014 }, state: 'NY' },
]

describe('nearestStation', () => {
  it('finds the station on the venue, not merely a nearby one', () => {
    const found = nearestStation(VENUE, STATIONS)
    expect(found?.station.id).toBe('8571616')
    expect(found?.distanceKm).toBeLessThan(1)
    expect(found?.proximity).toBe('local')
  })

  /*
   * An inland venue still gets an answer, with the real distance, so the UI can
   * say "the nearest is 340km away" instead of showing nothing and letting the
   * user wonder whether it is broken.
   */
  it('still returns the nearest for an inland venue, marked unusable', () => {
    const denver = nearestStation({ lat: 39.7392, lon: -104.9903 }, STATIONS)
    expect(denver).not.toBeNull()
    expect(denver!.distanceKm).toBeGreaterThan(STATION_USABLE_KM)
    expect(denver!.proximity).toBe('none')
  })

  it('returns null only when there are no stations at all', () => {
    expect(nearestStation(VENUE, [])).toBeNull()
  })
})

/*
 * "Nearest" and "active" are not the same thing. NOAA's list includes stations
 * that publish nothing against MLLW, and a venue on open water can have one of
 * those as its closest. The caller walks this list rather than stopping at the
 * first, so the order has to be right.
 */
describe('nearestStations', () => {
  it('returns candidates in ascending distance order', () => {
    const list = nearestStations(VENUE, STATIONS, 3)
    expect(list.map((c) => c.station.id)).toEqual(['8571616', '8571485', '8518750'])
    for (let i = 1; i < list.length; i++) {
      expect(list[i].distanceKm).toBeGreaterThanOrEqual(list[i - 1].distanceKm)
    }
  })

  it('caps the list, because this is a shared public service', () => {
    expect(nearestStations(VENUE, STATIONS, 2)).toHaveLength(2)
    expect(nearestStations(VENUE, STATIONS, 0)).toHaveLength(0)
  })

  it('bands each candidate, so a far fallback is not silently treated as local', () => {
    const list = nearestStations(VENUE, STATIONS, 3)
    expect(list[0].proximity).toBe('local')
    expect(list[2].proximity).toBe('none')
  })

  it('agrees with nearestStation about which is first', () => {
    expect(nearestStations(VENUE, STATIONS, 1)[0].station.id).toBe(
      nearestStation(VENUE, STATIONS)!.station.id,
    )
  })
})

describe('stationProximity', () => {
  it('bands on the stated distances', () => {
    expect(stationProximity(0)).toBe('local')
    expect(stationProximity(STATION_LOCAL_KM)).toBe('local')
    expect(stationProximity(STATION_LOCAL_KM + 0.1)).toBe('distant')
    expect(stationProximity(STATION_USABLE_KM)).toBe('distant')
    expect(stationProximity(STATION_USABLE_KM + 0.1)).toBe('none')
  })
})

/* A simple half day: low at 08:00, high at 14:00, low at 20:00 UTC. */
const EXTREMES: TideExtreme[] = [
  { at: new Date('2026-09-20T08:00:00Z'), feet: 1.2, kind: 'low' },
  { at: new Date('2026-09-20T14:00:00Z'), feet: 3.3, kind: 'high' },
  { at: new Date('2026-09-20T20:00:00Z'), feet: 1.1, kind: 'low' },
]

/** A curve every 30 minutes, rising 1.2 to 3.3 then falling back. */
const CURVE: TideSample[] = (() => {
  const out: TideSample[] = []
  for (let m = 0; m <= 24 * 60; m += 30) {
    const at = new Date(Date.UTC(2026, 8, 20, 0, 0) + m * 60_000)
    // Cosine between the 08:00 low and the 14:00 high, extended either side.
    const hours = m / 60
    const feet = 2.25 - 1.05 * Math.cos(((hours - 8) / 6) * Math.PI)
    out.push({ at, feet })
  }
  return out
})()

describe('levelAt', () => {
  it('interpolates between published samples', () => {
    const at = new Date('2026-09-20T11:00:00Z')
    const feet = levelAt(CURVE, at)
    expect(feet).not.toBeNull()
    expect(feet!).toBeGreaterThan(1.2)
    expect(feet!).toBeLessThan(3.3)
  })

  it('returns a published sample exactly when the time lands on one', () => {
    expect(levelAt(CURVE, CURVE[10].at)).toBeCloseTo(CURVE[10].feet, 6)
  })

  /* Extrapolating a tide is inventing one. */
  it('refuses to extrapolate outside the published curve', () => {
    expect(levelAt(CURVE, new Date('2026-09-19T00:00:00Z'))).toBeNull()
    expect(levelAt(CURVE, new Date('2026-09-22T00:00:00Z'))).toBeNull()
  })

  it('survives an empty curve', () => {
    expect(levelAt([], new Date())).toBeNull()
  })
})

describe('directionAt', () => {
  it('is rising while heading for a high', () => {
    expect(directionAt(EXTREMES, new Date('2026-09-20T11:00:00Z'))).toBe('rising')
  })

  it('is falling while heading for a low', () => {
    expect(directionAt(EXTREMES, new Date('2026-09-20T17:00:00Z'))).toBe('falling')
  })

  /*
   * Around a turn the curve is flat and the sign of the slope is noise, so
   * naming a direction there would be false precision.
   */
  it('calls it slack close to a turn rather than guessing a direction', () => {
    expect(directionAt(EXTREMES, new Date('2026-09-20T14:00:00Z'))).toBe('slack')
    expect(directionAt(EXTREMES, new Date('2026-09-20T14:10:00Z'))).toBe('slack')
    expect(directionAt(EXTREMES, new Date('2026-09-20T14:45:00Z'))).toBe('falling')
  })

  it('keeps going the right way after the last published extreme', () => {
    expect(directionAt(EXTREMES, new Date('2026-09-20T23:00:00Z'))).toBe('rising')
  })

  it('says slack rather than throwing when there are no extremes', () => {
    expect(directionAt([], new Date())).toBe('slack')
  })
})

describe('tideStateAt', () => {
  it('reports the level, the direction and the surrounding turns', () => {
    const state = tideStateAt(CURVE, EXTREMES, new Date('2026-09-20T11:00:00Z'))
    expect(state).not.toBeNull()
    expect(state!.direction).toBe('rising')
    expect(state!.next?.kind).toBe('high')
    expect(state!.previous?.kind).toBe('low')
  })

  it('is null when the moment is outside the published curve', () => {
    expect(tideStateAt(CURVE, EXTREMES, new Date('2026-09-25T11:00:00Z'))).toBeNull()
  })
})

describe('extremesAround and straddlesTurn', () => {
  const start = new Date('2026-09-20T15:00:00Z')
  const end = new Date('2026-09-20T19:00:00Z')

  it('finds the turns either side of a window that contains none', () => {
    const around = extremesAround(EXTREMES, start, end)
    expect(around.inWindow).toHaveLength(0)
    expect(around.before?.kind).toBe('high')
    expect(around.after?.kind).toBe('low')
    expect(straddlesTurn(EXTREMES, start, end)).toBe(false)
  })

  /* A window containing a turn is shot at two different waterlines. */
  it('reports a window that straddles a turn', () => {
    const wide = { start: new Date('2026-09-20T12:00:00Z'), end: new Date('2026-09-20T16:00:00Z') }
    expect(straddlesTurn(EXTREMES, wide.start, wide.end)).toBe(true)
    expect(extremesAround(EXTREMES, wide.start, wide.end).inWindow[0].kind).toBe('high')
  })
})

describe('positionInWindow', () => {
  const start = new Date('2026-09-20T11:00:00Z')
  const end = new Date('2026-09-20T15:00:00Z')

  it('places a turn along the scrubber', () => {
    expect(positionInWindow(new Date('2026-09-20T13:00:00Z'), start, end)).toBeCloseTo(0.5, 6)
    expect(positionInWindow(start, start, end)).toBe(0)
    expect(positionInWindow(end, start, end)).toBe(1)
  })

  it('is null outside the window, so nothing is drawn off the ends', () => {
    expect(positionInWindow(new Date('2026-09-20T09:00:00Z'), start, end)).toBeNull()
    expect(positionInWindow(new Date('2026-09-20T17:00:00Z'), start, end)).toBeNull()
  })

  it('is null for a zero length window rather than dividing by zero', () => {
    expect(positionInWindow(start, start, start)).toBeNull()
  })
})

describe('tidalRangeFeet', () => {
  it('measures the day, which is what says whether tide matters here', () => {
    expect(tidalRangeFeet(EXTREMES)).toBeCloseTo(2.2, 6)
    expect(tidalRangeFeet([])).toBe(0)
  })
})

describe('feetToMetres', () => {
  it('converts for the dual unit readouts the rest of the app uses', () => {
    expect(feetToMetres(3.3)).toBeCloseTo(1.006, 3)
  })
})

/*
 * A DERIVED CURVE, FOR SUBORDINATE STATIONS.
 *
 * NOAA publishes a six minute curve for reference stations and high and low
 * water only for subordinate ones. The app used to require both and discard
 * any station that could not supply the curve, which at Lynnhaven Inlet meant
 * discarding all three nearest stations and reporting no tide predictions,
 * while the station 570m from the shot published good high and low water.
 */
describe('curveFromExtremes', () => {
  /* A clean six hour fall from 4ft to 0ft, starting at midnight UTC. */
  const HIGH = new Date('2026-10-20T00:00:00Z')
  const LOW = new Date('2026-10-20T06:00:00Z')
  const extremes: TideExtreme[] = [
    { at: HIGH, feet: 4, kind: 'high' },
    { at: LOW, feet: 0, kind: 'low' },
  ]

  it('lands exactly on every published extreme', () => {
    const curve = curveFromExtremes(extremes)
    expect(levelAt(curve, HIGH)).toBeCloseTo(4, 6)
    expect(levelAt(curve, LOW)).toBeCloseTo(0, 6)
  })

  it('is the mean halfway between the turns', () => {
    const curve = curveFromExtremes(extremes)
    expect(levelAt(curve, new Date('2026-10-20T03:00:00Z'))).toBeCloseTo(2, 2)
  })

  /*
   * THE RULE OF TWELFTHS, which is the reason this is a cosine and not a
   * straight line. Over six hours a tide moves 1, 2, 3, 3, 2, 1 twelfths of
   * its range, and a 4ft range is 0.333ft per twelfth.
   *
   * THE RULE IS THE ROUNDED VERSION OF THIS, not the other way round. The
   * cosine is exact at hours 2, 3, 4 and 6 and sits 0.065ft off at hours 1 and
   * 5, which is the rounding in the rule itself: the true first hour is 0.80
   * of a twelfth and the rule calls it 1. So this asserts agreement to within
   * a quarter of a twelfth rather than pretending the rule is the truth. The
   * largest real gap is 0.20 of a twelfth, which on a 4ft range is 0.065ft.
   */
  it('matches the rule of twelfths, where a straight line does not', () => {
    const curve = curveFromExtremes(extremes)
    const twelfth = 4 / 12
    const fallen = (hours: number) =>
      4 - (levelAt(curve, new Date(HIGH.getTime() + hours * 3_600_000)) ?? 0)

    // 1, 3, 6, 9, 11, 12 twelfths fallen by the end of each hour.
    for (const [hour, twelfths] of [[1, 1], [2, 3], [3, 6], [4, 9], [5, 11], [6, 12]] as const) {
      expect(
        Math.abs(fallen(hour) - twelfths * twelfth),
        `hour ${hour}: cosine ${fallen(hour).toFixed(3)}ft vs rule ${(twelfths * twelfth).toFixed(3)}ft`,
      ).toBeLessThan(twelfth / 4)
    }

    // Exact where the rule does no rounding.
    for (const [hour, twelfths] of [[2, 3], [3, 6], [4, 9], [6, 12]] as const) {
      expect(fallen(hour), `hour ${hour}`).toBeCloseTo(twelfths * twelfth, 6)
    }

    /*
     * And the first hour is far from what a straight line would claim, which
     * is the hour that decides whether a sandbar is out.
     */
    const straightLine = 4 / 6
    expect(fallen(1)).toBeLessThan(straightLine * 0.45)
  })

  it('never goes outside the range it was built from', () => {
    const curve = curveFromExtremes(extremes)
    for (const sample of curve) {
      expect(sample.feet).toBeGreaterThanOrEqual(-1e-9)
      expect(sample.feet).toBeLessThanOrEqual(4 + 1e-9)
    }
  })

  it('covers the whole span at the step asked for', () => {
    const curve = curveFromExtremes(extremes, 6)
    expect(curve[0].at.getTime()).toBe(HIGH.getTime())
    expect(curve[curve.length - 1].at.getTime()).toBe(LOW.getTime())
    // Six hours at six minutes is sixty steps, plus the closing sample.
    expect(curve.length).toBe(61)
  })

  it('runs through a whole day of turns without emitting one twice', () => {
    const day: TideExtreme[] = [
      { at: new Date('2026-10-20T00:10:00Z'), feet: 3.4, kind: 'high' },
      { at: new Date('2026-10-20T06:22:00Z'), feet: 0.2, kind: 'low' },
      { at: new Date('2026-10-20T12:41:00Z'), feet: 3.6, kind: 'high' },
      { at: new Date('2026-10-20T18:55:00Z'), feet: 0.1, kind: 'low' },
    ]
    const curve = curveFromExtremes(day)
    const times = curve.map((s) => s.at.getTime())
    expect(new Set(times).size).toBe(times.length)
    expect(times).toEqual([...times].sort((a, b) => a - b))
    for (const extreme of day) {
      expect(levelAt(curve, extreme.at)).toBeCloseTo(extreme.feet, 6)
    }
  })

  it('rises as well as falls', () => {
    const rising = curveFromExtremes([
      { at: HIGH, feet: 0, kind: 'low' },
      { at: LOW, feet: 4, kind: 'high' },
    ])
    expect(levelAt(rising, new Date('2026-10-20T03:00:00Z'))).toBeCloseTo(2, 2)
    expect(levelAt(rising, LOW)).toBeCloseTo(4, 6)
  })

  /* One turn is not a curve. Nothing to interpolate between. */
  it('returns nothing when there is less than one leg', () => {
    expect(curveFromExtremes([])).toEqual([])
    expect(curveFromExtremes([{ at: HIGH, feet: 4, kind: 'high' }])).toEqual([])
  })

  /* And the whole point: tideStateAt works off it. */
  it('drives a full tide state, direction and turns included', () => {
    const curve = curveFromExtremes(extremes)
    const state = tideStateAt(curve, extremes, new Date('2026-10-20T02:00:00Z'))
    expect(state).not.toBeNull()
    expect(state?.direction).toBe('falling')
    expect(state?.next?.kind).toBe('low')
    expect(state?.feet).toBeGreaterThan(2)
    expect(state?.feet).toBeLessThan(4)
  })
})
