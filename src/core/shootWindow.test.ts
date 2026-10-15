import { describe, expect, it } from 'vitest'
import { getSunPosition } from './sun.ts'
import {
  bandIntervals,
  KIND_BANDS,
  PEAK_BAND,
  peakIn,
  SET_UP_MARGIN_MINUTES,
  SHOOT_KIND_LABEL,
  suggestWindow,
} from './shootWindow.ts'

/* Virginia Beach oceanfront, the morning the field test happened. */
const VB = { lat: 36.8529, lon: -75.978 }
const altitudeAt = (at: Date) => getSunPosition(at, VB.lat, VB.lon).altitude
const DAY_START = new Date('2026-10-15T08:00:00Z') // 04:00 EDT
const DAY_END = new Date('2026-10-16T04:00:00Z') // midnight EDT
const local = (d: Date) =>
  d.toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

/*
 * THE FIELD MEASUREMENT, PINNED.
 *
 * Read off rewind cameras at Virginia Beach on 15 October 2026:
 *
 *   06:29   sun -8.8   dark deck, thin pink slot at horizon
 *   06:49   sun -4.8   PEAK, orange and red fire
 *   07:09   sun -0.9   flat, washed out
 *   07:11   sun -0.5   sun up, over
 *
 * The best light was twenty-two minutes BEFORE sunrise and over before the sun
 * appeared. These assert that the app now points at it.
 */
describe('the Virginia Beach sunrise that prompted this', () => {
  const intervals = bandIntervals(altitudeAt, DAY_START, DAY_END)
  const peak = peakIn('sunrise', intervals)

  it('puts the observed peak inside the band it nominates', () => {
    expect(peak).not.toBeNull()
    if (peak === null) return
    const observed = new Date('2026-10-15T10:49:00Z') // 06:49 EDT
    expect(peak.from.getTime()).toBeLessThanOrEqual(observed.getTime())
    expect(peak.to.getTime()).toBeGreaterThanOrEqual(observed.getTime())
    expect(peak.band).toBe('blue-hour')
  })

  /*
   * `to` is the LAST minute still in the band, not the first minute out of it.
   * The sun entered afterglow at 06:54, so blue hour's last minute is 06:53.
   */
  it('runs 06:43 to 06:53 local, which is what was measured', () => {
    if (peak === null) throw new Error('expected a peak')
    expect(local(peak.from)).toBe('06:43')
    expect(local(peak.to)).toBe('06:53')
    // The observed peak at 06:49 is nearer the middle than either end.
    const mid = (peak.from.getTime() + peak.to.getTime()) / 2
    expect(Math.abs(mid - new Date('2026-10-15T10:49:00Z').getTime())).toBeLessThan(90_000)
  })

  it('says to be set up by 06:38, before the peak rather than during it', () => {
    if (peak === null) throw new Error('expected a peak')
    expect(local(peak.beSetUpBy)).toBe('06:38')
    expect(peak.beSetUpBy.getTime()).toBeLessThan(peak.from.getTime())
    expect(peak.from.getTime() - peak.beSetUpBy.getTime()).toBe(
      SET_UP_MARGIN_MINUTES * 60_000,
    )
  })

  /*
   * AND THE PEAK IS BEFORE SUNRISE, which is the whole point. Sunrise computed
   * 07:11; the peak ends at 06:54, seventeen minutes earlier.
   */
  it('puts the whole peak before the sun appears', () => {
    if (peak === null) throw new Error('expected a peak')
    const horizon = intervals.find((i) => i.band === 'horizon')
    expect(horizon).toBeDefined()
    if (horizon === undefined) return
    expect(peak.to.getTime()).toBeLessThan(horizon.from.getTime())
  })

  /* The band before was too dark and the band after was washed out. */
  it('does not nominate the bands either side of it', () => {
    expect(PEAK_BAND.sunrise).toBe('blue-hour')
    expect(PEAK_BAND.sunrise).not.toBe('nautical')
    expect(PEAK_BAND.sunrise).not.toBe('afterglow')
  })

  it('suggests a window that starts in the dark and ends after sunrise', () => {
    const window = suggestWindow('sunrise', altitudeAt, DAY_START, DAY_END)
    expect(window).not.toBeNull()
    if (window === null) return
    expect(local(window.start)).toBe('06:13') // nautical begins
    expect(altitudeAt(window.start)).toBeLessThan(-6)
    expect(altitudeAt(window.end)).toBeGreaterThan(5)
    // And the peak is inside the window it suggests.
    if (peak === null) return
    expect(window.start.getTime()).toBeLessThanOrEqual(peak.from.getTime())
    expect(window.end.getTime()).toBeGreaterThanOrEqual(peak.to.getTime())
  })
})

describe('band intervals', () => {
  /** A straight ramp, so the expected bands are arithmetic not astronomy. */
  const ramp = (from: number, to: number, start: Date, end: Date) => (at: Date) => {
    const share = (at.getTime() - start.getTime()) / (end.getTime() - start.getTime())
    return from + (to - from) * share
  }
  const A = new Date('2026-10-15T10:00:00Z')
  const B = new Date('2026-10-15T12:00:00Z')

  it('walks the bands in the order the sun crosses them', () => {
    const got = bandIntervals(ramp(-20, 20, A, B), A, B).map((i) => i.band)
    expect(got).toEqual([
      'night',
      'nautical',
      'blue-hour',
      'afterglow',
      'horizon',
      'late-golden',
      'open',
    ])
  })

  it('gives each interval a from before its to', () => {
    for (const i of bandIntervals(ramp(-20, 20, A, B), A, B)) {
      expect(i.to.getTime()).toBeGreaterThanOrEqual(i.from.getTime())
    }
  })

  it('is contiguous, with no gap between one band and the next', () => {
    const got = bandIntervals(ramp(-20, 20, A, B), A, B, 1)
    for (let i = 1; i < got.length; i++) {
      expect(got[i].from.getTime() - got[i - 1].to.getTime()).toBeLessThanOrEqual(60_000)
    }
  })

  it('returns one interval for a sun that does not move', () => {
    const got = bandIntervals(() => -5, A, B)
    expect(got).toHaveLength(1)
    expect(got[0].band).toBe('blue-hour')
  })

  it('returns nothing for a window that makes no sense', () => {
    expect(bandIntervals(() => 0, B, A)).toEqual([])
    expect(bandIntervals(() => 0, A, A)).toEqual([])
  })
})

describe('the three kinds of shoot', () => {
  it('names all three', () => {
    for (const kind of ['sunrise', 'sunset', 'daytime'] as const) {
      expect(SHOOT_KIND_LABEL[kind]).toBeTruthy()
      expect(KIND_BANDS[kind].length).toBeGreaterThan(0)
    }
  })

  /*
   * A SUNRISE SHOOT IS NOT THE HOUR AFTER SUNRISE. Most of it happens before
   * the sun appears, which is the thing this app was getting wrong when it
   * called below-the-horizon empty.
   */
  it('puts most of a sunrise shoot below the horizon', () => {
    const below = KIND_BANDS.sunrise.filter((b) =>
      ['nautical', 'blue-hour', 'afterglow'].includes(b),
    )
    expect(below.length).toBeGreaterThan(KIND_BANDS.sunrise.length / 2)
  })

  it('runs a sunset through the same bands in reverse', () => {
    expect([...KIND_BANDS.sunset]).toEqual([...KIND_BANDS.sunrise].reverse())
  })

  /*
   * DAYTIME HAS NO PEAK, and says so. Light at midday is decided by cloud and
   * by what you are pointing at; nominating a band there would be inventing a
   * recommendation.
   */
  it('nominates no peak for daytime', () => {
    expect(PEAK_BAND.daytime).toBeNull()
    const intervals = bandIntervals(altitudeAt, DAY_START, DAY_END)
    expect(peakIn('daytime', intervals)).toBeNull()
  })

  it('finds a sunset window in the evening, not the morning', () => {
    const window = suggestWindow('sunset', altitudeAt, DAY_START, DAY_END)
    expect(window).not.toBeNull()
    if (window === null) return
    expect(Number(local(window.start).slice(0, 2))).toBeGreaterThan(12)
    expect(altitudeAt(window.start)).toBeGreaterThan(5)
    expect(altitudeAt(window.end)).toBeLessThan(-6)
  })

  it('finds a daytime window that is actually daylight', () => {
    const window = suggestWindow('daytime', altitudeAt, DAY_START, DAY_END)
    expect(window).not.toBeNull()
    if (window === null) return
    expect(altitudeAt(window.start)).toBeGreaterThan(5)
    expect(altitudeAt(window.end)).toBeGreaterThan(5)
  })

  /* A window that never reaches the bands has none, which is not an error. */
  it('suggests nothing when the day never gets there', () => {
    expect(suggestWindow('sunrise', () => 40, DAY_START, DAY_END)).toBeNull()
    expect(suggestWindow('daytime', () => -40, DAY_START, DAY_END)).toBeNull()
  })

  it('finds no peak in a window that does not contain one', () => {
    const noon = new Date('2026-10-15T16:00:00Z')
    const later = new Date('2026-10-15T18:00:00Z')
    expect(peakIn('sunrise', bandIntervals(altitudeAt, noon, later))).toBeNull()
  })
})
