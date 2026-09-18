import { describe, expect, it } from 'vitest'
import { parseCurve, parseExtremes, parseNoaaTime, parseStations } from './noaa.ts'

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
