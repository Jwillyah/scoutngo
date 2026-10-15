import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { levelAt } from '../core/tide.ts'
import {
  clearPredictionCache,
  fetchPredictions,
  parseCurve,
  parseExtremes,
  parseNoaaTime,
  parseStations,
} from './noaa.ts'

describe('parseStations', () => {
  it('keeps only the fields the nearest-station search needs', () => {
    const stations = parseStations({
      stations: [
        { id: '8571616', name: 'Salisbury, Wicomico River', lat: 38.3653, lng: -75.6053, state: 'MD', products: {}, notices: [] },
      ],
    })
    expect(stations).toEqual([
      {
        id: '8571616',
        name: 'Salisbury, Wicomico River',
        at: { lat: 38.3653, lon: -75.6053 },
        state: 'MD',
      },
    ])
  })

  /* NOAA ships some entries with missing coordinates; they cannot be measured to. */
  it('drops entries without a usable coordinate rather than placing them at null island', () => {
    const stations = parseStations({
      stations: [
        { id: 'a', name: 'good', lat: 1, lng: 2, state: 'X' },
        { id: 'b', name: 'no coords' },
        { id: 'c', name: 'junk coords', lat: 'abc', lng: 'def' },
        { name: 'no id', lat: 1, lng: 2 },
      ],
    })
    expect(stations.map((s) => s.id)).toEqual(['a'])
  })

  it('survives a payload of the wrong shape entirely', () => {
    expect(parseStations(null)).toEqual([])
    expect(parseStations({})).toEqual([])
    expect(parseStations({ stations: 'nope' })).toEqual([])
  })
})

describe('parseNoaaTime', () => {
  /*
   * NOAA returns "2026-09-20 14:22" with no offset. Requested as gmt, so it is
   * UTC. Parsing it as LOCAL would silently shift every tide by the runner's
   * offset, which is the same class of bug the timezone work removed from the
   * venue window.
   */
  it('reads a NOAA timestamp as UTC, not as local time', () => {
    expect(parseNoaaTime('2026-09-20 14:22')?.toISOString()).toBe('2026-09-20T14:22:00.000Z')
  })

  it('accepts the ISO style separator too', () => {
    expect(parseNoaaTime('2026-09-20T14:22')?.toISOString()).toBe('2026-09-20T14:22:00.000Z')
  })

  it('returns null on anything it cannot read', () => {
    expect(parseNoaaTime('yesterday')).toBeNull()
    expect(parseNoaaTime('')).toBeNull()
  })
})

describe('parseExtremes', () => {
  it('reads the published highs and lows', () => {
    const extremes = parseExtremes({
      predictions: [
        { t: '2026-09-20 02:02', v: '3.285', type: 'H' },
        { t: '2026-09-20 08:45', v: '1.214', type: 'L' },
      ],
    })
    expect(extremes).toHaveLength(2)
    expect(extremes[0]).toMatchObject({ feet: 3.285, kind: 'high' })
    expect(extremes[1]).toMatchObject({ feet: 1.214, kind: 'low' })
    expect(extremes[0].at.toISOString()).toBe('2026-09-20T02:02:00.000Z')
  })

  it('skips rows it cannot read rather than emitting NaN feet', () => {
    const extremes = parseExtremes({
      predictions: [
        { t: '2026-09-20 02:02', v: 'n/a', type: 'H' },
        { t: 'bad', v: '1.0', type: 'L' },
        { t: '2026-09-20 08:45', v: '1.214', type: 'L' },
      ],
    })
    expect(extremes).toHaveLength(1)
  })

  it('survives an error payload, which NOAA sends with HTTP 200', () => {
    expect(parseExtremes({ error: { message: 'The station is not a valid station' } })).toEqual([])
  })
})

describe('parseCurve', () => {
  it('reads the six minute level curve', () => {
    const curve = parseCurve({
      predictions: [
        { t: '2026-09-20 00:00', v: '2.938' },
        { t: '2026-09-20 00:06', v: '2.9' },
      ],
    })
    expect(curve).toHaveLength(2)
    expect(curve[0].feet).toBe(2.938)
    expect(curve[1].at.getTime() - curve[0].at.getTime()).toBe(6 * 60_000)
  })

  it('survives junk', () => {
    expect(parseCurve(null)).toEqual([])
    expect(parseCurve({ predictions: [{ v: '1' }] })).toEqual([])
  })
})

/*
 * SUBORDINATE STATIONS. THE BUG THAT SENT A VENUE TO "NO TIDE PREDICTIONS".
 *
 * NOAA publishes two different things, and which ones a station has depends on
 * what kind of station it is:
 *
 *   REFERENCE   (type R)  a six minute curve AND the high and low waters
 *   SUBORDINATE (type S)  the high and low waters only, because it is defined
 *                         as time and height offsets from a reference station
 *
 * fetchPredictions used to require both and fail the station if EITHER request
 * errored, so every subordinate station in the country was discarded. Measured
 * at Lynnhaven Inlet, where the sandbars are the shot:
 *
 *   8638888  Lynnhaven Inlet, Virginia Pilots Dock  0.57km  S  hilo OK, curve ERROR
 *   8638916  Long Creek                             1.25km  S  hilo OK, curve ERROR
 *   8638923  Broad Bay Canal                        2.01km  S  hilo OK, curve ERROR
 *   8638863  Chesapeake Bay Bridge Tunnel           7.22km  R  hilo OK, curve OK
 *
 * STATION_ATTEMPTS is 3, so all three attempts were subordinate, all three
 * were discarded, and the panel said there were no predictions for the date
 * while the station 570m from the bridge was publishing good high and low
 * water the whole time.
 */
describe('a station that publishes turns but no curve', () => {
  const HILO = {
    predictions: [
      { t: '2026-10-20 08:35', v: '2.08', type: 'H' },
      { t: '2026-10-20 14:42', v: '1.04', type: 'L' },
      { t: '2026-10-20 21:03', v: '2.33', type: 'H' },
    ],
  }
  /* Verbatim what NOAA answers a subordinate station's curve request with. */
  const CURVE_ERROR = {
    error: { message: 'No Predictions data was found. Please make sure the Datum input is valid.' },
  }
  const CURVE_OK = {
    predictions: [
      { t: '2026-10-20 08:35', v: '2.08' },
      { t: '2026-10-20 08:41', v: '2.06' },
      { t: '2026-10-20 08:47', v: '2.03' },
    ],
  }

  /** Answers the hilo request and the curve request differently, as NOAA does. */
  const stubFetch = (curveAnswer: unknown) =>
    vi.fn(async (url: string | URL) => {
      const text = String(url)
      const body = text.includes('interval=hilo') ? HILO : curveAnswer
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

  const at = new Date('2026-10-20T11:12:00Z')

  beforeEach(() => {
    clearPredictionCache()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is used, with a curve derived from its turns', async () => {
    vi.stubGlobal('fetch', stubFetch(CURVE_ERROR))
    const result = await fetchPredictions('8638888', at)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.predictions.extremes).toHaveLength(3)
    expect(result.predictions.curveSource).toBe('derived')
    expect(result.predictions.curve.length).toBeGreaterThan(100)
  })

  it('still reports a published curve as published', async () => {
    vi.stubGlobal('fetch', stubFetch(CURVE_OK))
    const result = await fetchPredictions('8638863', at)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.predictions.curveSource).toBe('published')
    expect(result.predictions.curve).toHaveLength(3)
  })

  /*
   * The derived curve must agree with the turns it came from, or the level
   * between turns would contradict the times printed above it.
   */
  it('lands on each published turn exactly', async () => {
    vi.stubGlobal('fetch', stubFetch(CURVE_ERROR))
    const result = await fetchPredictions('8638888', at)
    if (result.status !== 'ok') throw new Error('expected ok')
    for (const extreme of result.predictions.extremes) {
      expect(levelAt(result.predictions.curve, extreme.at)).toBeCloseTo(extreme.feet, 6)
    }
  })

  /* A station with no turns either really has nothing, and is still refused. */
  it('is refused when the turns are missing too', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify(CURVE_ERROR), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    )
    const result = await fetchPredictions('0000000', at)
    expect(result.status).toBe('unavailable')
    if (result.status !== 'unavailable') return
    expect(result.reason).toMatch(/no tide predictions/i)
  })
})
