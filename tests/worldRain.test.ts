import { describe, expect, it } from 'vitest'
import { droppedPixels, estimateArea, frameFor, parseRainMaps, RADAR_COVER, rainTileUrl, underRadar } from '../src/lib/worldRain.ts'

/* Batch Map, Section 5: rain worldwide, radar where it exists, the satellite estimate hatched elsewhere. */
const MAPS = { version: '2.0', generated: 1, host: 'https://api.librewxr.net', radar: { past: [{ time: 1000, path: '/v2/radar/1000' }, { time: 1600, path: '/v2/radar/1600' }], nowcast: [{ time: 2200, path: '/v2/radar/nowcast_2200' }] } }

describe('world rain', () => {
  it('reads the RainViewer v2 frame list and builds its tile URLs', () => {
    const m = parseRainMaps(MAPS)
    expect(m?.past).toHaveLength(2)
    /* Through the phone's mask (Batch MAP2, Section 3), which asks https://api.librewxr.net for it. */
    expect(rainTileUrl(m!, m!.past[1])).toBe('rainw://api.librewxr.net/v2/radar/1600/256/{z}/{x}/{y}/2/1_0.png')
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
  it('drops MetMalaysia and PAGASA by their terms: those boxes are no radar, and their tiles are cleared', () => {
    expect(underRadar(3.14, 101.69)).toBe(false) /* Kuala Lumpur */
    expect(underRadar(14.6, 121.0)).toBe(false) /* Manila */
    /* A zoom 6 tile over Manila is cleared where the Philippines box covers it; one over Tokyo is not touched. */
    const manila = droppedPixels(6, 53, 29)
    expect(manila.length).toBeGreaterThan(0)
    expect(droppedPixels(6, 56, 25)).toEqual([])
  })
})

describe('the satellite estimate: softer, dotted at its edge, only where it rains (Batch Polish 2, Section 1)', () => {
  it('outside radar a rain patch keeps a share of its alpha and its edge is dotted white; dry pixels and radar are left alone', async () => {
    const { softenEstimate, ESTIMATE_ALPHA, radarPixels } = await import('../src/lib/worldRain.ts')
    const w = 8
    const h = 8
    const px = new Uint8ClampedArray(w * h * 4)
    /* A 4 x 4 patch of rain in the middle, alpha 200, blue. */
    for (let y = 2; y < 6; y += 1) for (let x = 2; x < 6; x += 1) px.set([40, 90, 220, 200], (y * w + x) * 4)
    const a = (x: number, y: number) => px[(y * w + x) * 4 + 3]
    const changed = softenEstimate(px, w, h, [])
    expect(changed).toBe(16)
    /* The middle: softer, still blue. */
    expect(a(3, 3)).toBe(Math.round(200 * ESTIMATE_ALPHA))
    expect(px[(3 * w + 3) * 4 + 2]).toBe(220)
    /* The edge: some white dots, and dry pixels stay dry. */
    const edge = [[2, 2], [3, 2], [4, 2], [5, 2], [2, 3], [2, 4], [2, 5]].map(([x, y]) => px[(y * w + x) * 4])
    expect(edge.some((r) => r === 255)).toBe(true)
    expect(edge.some((r) => r === 40)).toBe(true)
    expect(a(0, 0)).toBe(0)
    /* Under radar: untouched. */
    const radar = new Uint8ClampedArray(w * h * 4).fill(200)
    expect(softenEstimate(radar, w, h, [{ x0: 0, y0: 0, x1: w, y1: h }])).toBe(0)
    expect([...radar].every((v) => v === 200)).toBe(true)
    /* A tile over Kansas is all radar; one over the mid-Atlantic none. */
    expect(radarPixels(6, 14, 24).some((q) => q.x0 <= 0 && q.y0 <= 0 && q.x1 >= 256 && q.y1 >= 256)).toBe(true)
    expect(radarPixels(6, 24, 24)).toEqual([])
  })
})
