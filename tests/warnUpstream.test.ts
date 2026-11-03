import { describe, expect, it } from 'vitest'
import { inPolygon, nearestOnPolygon, parseMotion, upstream } from '../src/core/warnUpstream.ts'
import { parseAlerts, upstreamWarnings, WARNINGS_URL } from '../src/lib/stormData.ts'

/*
 * WARNINGS UPSTREAM (Batch L, Section 4): a warning near the venue whose
 * storm is heading at it, and not one heading away; the warnings asked
 * nationally, with no place in the request.
 */
const VB = { lat: 36.85, lon: -75.98 }
/* A box 0.2° wide, its east edge 0.25° (about 22 km) west of the venue. */
const box = (west: number, east: number, south = 36.75, north = 36.95): GeoJSON.Polygon => ({ type: 'Polygon', coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] })
const WEST = box(-76.43, -76.23)
const motion = (fromDeg: number, kt: number) => parseMotion(`2026-08-04T17:20:00-00:00...storm...${fromDeg}DEG...${kt}KT...36.85,-76.25`)

describe('upstream', () => {
  it('reads the NWS motion: from, speed and the storm’s line', () => {
    expect(parseMotion('2026-11-03T20:00:00-00:00...storm...236DEG...21KT...32.52,-93.21 32.51,-93.17')).toEqual({ fromDeg: 236, kt: 21, line: [{ lat: 32.52, lon: -93.21 }, { lat: 32.51, lon: -93.17 }] })
    expect(parseMotion('nonsense')).toBeNull()
    expect(parseMotion(undefined)).toBeNull()
  })

  it('a warning 14 mi west moving east at 25 kt is upstream; the venue is outside it', () => {
    expect(inPolygon(VB, WEST)).toBe(false)
    const up = upstream(VB, WEST, motion(270, 25))
    expect(up).not.toBeNull()
    expect(up!.km).toBeCloseTo(22.3, 0)
    expect(Math.round(up!.bearingDeg)).toBe(270)
    expect(up!.towardDeg).toBe(90)
    /* 22 km at 46 km/h. */
    expect(up!.etaMin).toBe(29)
    expect(up!.motionFrom).toBe('nws')
  })

  it('the same warning moving north passes by: not upstream', () => {
    expect(upstream(VB, WEST, motion(180, 25))).toBeNull()
  })

  it('moving away (from the east) is not upstream', () => {
    expect(upstream(VB, WEST, motion(90, 25))).toBeNull()
  })

  it('farther than 30 mi is not said', () => {
    expect(upstream(VB, box(-77.2, -76.6), motion(270, 25))).toBeNull()
    expect(nearestOnPolygon(VB, box(-77.2, -76.6))!.km).toBeGreaterThan(48.28)
  })

  it('a warning holding the venue is the inside card’s, not upstream', () => {
    expect(upstream(VB, box(-76.1, -75.9), motion(270, 25))).toBeNull()
  })

  it('no motion in the warning: the radar’s flow stands in, and says so', () => {
    const up = upstream(VB, WEST, null, { towardDeg: 85, kt: 20 })
    expect(up?.motionFrom).toBe('radar')
    expect(upstream(VB, WEST, null, null)).toBeNull()
  })

  it('the national ask carries no place, and the phone picks upstream ones out', () => {
    expect(WARNINGS_URL).toBe('https://api.weather.gov/alerts/active?event=Severe%20Thunderstorm%20Warning%2CTornado%20Warning')
    expect(WARNINGS_URL).not.toMatch(/point|lat|lon|area|zone|\d\d\.\d/)
    const alerts = parseAlerts({
      features: [
        { properties: { event: 'Severe Thunderstorm Warning', headline: 'west', parameters: { eventMotionDescription: ['2026-08-04T17:20:00-00:00...storm...270DEG...25KT...36.85,-76.25'] } }, geometry: WEST },
        { properties: { event: 'Tornado Warning', headline: 'Louisiana', parameters: { eventMotionDescription: ['...storm...236DEG...21KT...32.52,-93.21'] } }, geometry: box(-93.4, -93.1, 32.3, 32.6) },
      ],
    })
    const ups = upstreamWarnings(VB, alerts, null)
    expect(ups.map((u) => u.alert.headline)).toEqual(['west'])
  })
})
