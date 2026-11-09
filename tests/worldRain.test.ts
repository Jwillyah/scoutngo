import { describe, expect, it } from 'vitest'
import { estimateArea, frameFor, parseRainMaps, RADAR_COVER, rainTileUrl, underRadar } from '../src/lib/worldRain.ts'

/* Batch Map, Section 5: rain worldwide, radar where it exists, the satellite estimate hatched elsewhere. */
const MAPS = { version: '2.0', generated: 1, host: 'https://api.librewxr.net', radar: { past: [{ time: 1000, path: '/v2/radar/1000' }, { time: 1600, path: '/v2/radar/1600' }], nowcast: [{ time: 2200, path: '/v2/radar/nowcast_2200' }] } }

describe('world rain', () => {
  it('reads the RainViewer v2 frame list and builds its tile URLs', () => {
    const m = parseRainMaps(MAPS)
    expect(m?.past).toHaveLength(2)
    expect(rainTileUrl(m!, m!.past[1])).toBe('https://api.librewxr.net/v2/radar/1600/256/{z}/{x}/{y}/2/1_0.png')
    expect(parseRainMaps({ radar: { past: [] } })).toBeNull()
    expect(parseRainMaps({ ...MAPS, host: 'http://evil' })?.host).toBe('https://api.librewxr.net')
  })
  it('picks the nearest frame, a nowcast frame ahead of the last scan', () => {
    const m = parseRainMaps(MAPS)!
    expect(frameFor(m, new Date(1500_000)).time).toBe(1600)
    expect(frameFor(m, new Date(2100_000)).time).toBe(2200)
  })
  it('knows where there is radar, and the boxes never overlap (each is one hole)', () => {
    expect(underRadar(36.03, -75.67)).toBe(true) /* Kill Devil Hills */
    expect(underRadar(48.85, 2.35)).toBe(true) /* Paris */
    expect(underRadar(-33.9, 151.2)).toBe(false) /* Sydney: the satellite estimate */
    expect(underRadar(21.3, -157.8)).toBe(true) /* Honolulu */
    for (const [i, a] of RADAR_COVER.entries()) for (const b of RADAR_COVER.slice(i + 1)) {
      const overlap = a.west < b.east && b.west < a.east && a.south < b.north && b.south < a.north
      expect(overlap, `${a.name} and ${b.name}`).toBe(false)
    }
    const poly = estimateArea().features[0].geometry as GeoJSON.Polygon
    expect(poly.coordinates).toHaveLength(1 + RADAR_COVER.length)
  })
})
