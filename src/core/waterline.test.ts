import { describe, expect, it } from 'vitest'
import { borrowedLabel, chooseOffset, crossingAlong, KIND_BAND, KIND_SEA, KIND_THIN, meanRange, nearGround, offsetOf, offsetScaled, waterlineMap, waterNavd, type StationDatums } from './waterline.ts'

/* NOAA's published datums, metres on station zero (mdapi, 27 Oct 2026). */
const CBBT: StationDatums = { id: '8638863', name: 'Chesapeake Bay Bridge Tunnel', lat: 36.9667, lon: -76.1133, mllw: 7.704, navd88: null, msl: 8.135, gt: 0.885 }
const DUCK: StationDatums = { id: '8651370', name: 'Duck', lat: 36.1833, lon: -75.7467, mllw: 5.663, navd88: 6.33, msl: 6.202, gt: 1.124 }
const SEWELLS: StationDatums = { id: '8638610', name: 'Sewells Point', lat: 36.94278, lon: -76.32861, mllw: 1.336, navd88: 1.827, msl: 1.748, gt: 0.841 }

describe('which offset, at Virginia Beach Fishing Pier', () => {
  /* Ocean shares within 5 km, from the map tiles: CBBT 0.99, Duck 0.55, Sewells 0.01. */
  const candidates = [
    { datums: SEWELLS, distanceKm: 33, oceanShare: 0.01 },
    { datums: CBBT, distanceKm: 19, oceanShare: 0.99 },
    { datums: DUCK, distanceKm: 75, oceanShare: 0.55 },
  ]
  it('skips the Bridge Tunnel (no NAVD88), passes over Sewells Point (up the bay), borrows Duck', () => {
    const c = chooseOffset(null, candidates, 1.0)
    expect(c?.station.name).toBe('Duck')
    expect(c?.borrowed).toBe(true)
    expect(c?.offsetM).toBeCloseTo(0.667, 6)
    expect(borrowedLabel(c!, '75 km')).toBe('Height offset borrowed from Duck, 75 km away.')
  })
  it('falls back to Sewells Point only with no open-water station', () => {
    expect(chooseOffset(null, candidates.filter((c) => c.datums !== DUCK), 1)?.station.name).toBe('Sewells Point')
  })
  it("uses the venue's own station when it publishes both, as a thin line", () => {
    const c = chooseOffset(DUCK, candidates, 1.1)
    expect(c?.borrowed).toBe(false)
    expect(c?.uncertaintyM).toBe(0.02)
  })
  it('the second way: scaled to the venue range; by hand, 0.128 + (0.539 / 1.124) x 1.0 = 0.608', () => {
    expect(offsetScaled(DUCK, 1.0)).toBeCloseTo(6.33 - 6.202 + (0.539 / 1.124) * 1.0, 6)
    expect(chooseOffset(null, candidates, 1.0)?.uncertaintyM).toBeCloseTo(Math.abs(0.667 - offsetScaled(DUCK, 1.0)!), 6)
    expect(offsetOf(CBBT)).toBeNull()
    expect(meanRange([{ feet: 0 }, { feet: 4 }, { feet: 0.5 }])).toBeCloseTo(((4 + 3.5) / 2) * 0.3048, 6)
  })
})

/* A SYNTHETIC BEACH: rising 1 m in 30 m (run 30) eastward from -2 m, then flat at 2 m. Cells 1 m. */
const W = 120
const H = 20
const dtm = new Float32Array(W * H)
for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) dtm[y * W + x] = x < 90 ? -2 + x / 30 : 1
const r = { width: W, height: H, cellM: 1, dtm }

describe('the waterline band', () => {
  it('at a 0 m water level sits at x = 60, 2 x u x run wide, and a transect crosses inside it', () => {
    const u = 0.06
    const m = waterlineMap(r, 0, -0.5, u)
    const band = [...m.kind.keys()].filter((i) => m.kind[i] === KIND_BAND)
    const xs = band.map((i) => i % W)
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(58)
    expect(Math.max(...xs)).toBeLessThanOrEqual(62)
    expect(m.run).toBeCloseTo(30, 4)
    expect(m.widthFt).toBeCloseTo((2 * u * 30) / 0.3048, 3)
    expect(m.kind[10 * W + 20]).toBe(KIND_SEA)
    /* The second way: walking a row east, the ground crosses 0 m at x = 60. */
    const row = Array.from({ length: W }, (_, x) => 10 * W + x)
    expect((crossingAlong(r, row, 0) ?? -1) % W).toBe(60)
  })
  it('marks the flat strip at low tide as thin water only where flatter than 1 in 40', () => {
    const flat = Float32Array.from(dtm, (_, i) => ((i % W) < 90 ? -2 + (i % W) / 60 : 1))
    const m = waterlineMap({ ...r, dtm: flat }, 0, -1, 0.05)
    expect(m.kind.some((k) => k === KIND_THIN)).toBe(true)
    const steep = waterlineMap(r, 0, -1, 0.05)
    expect(steep.kind.some((k) => k === KIND_THIN)).toBe(false)
  })
  it('draws nothing where the scan measured no ground (the sea, filled in from the beach)', () => {
    const m = waterlineMap(r, 0, -0.5, 0.06, (i) => i % W >= 62)
    expect(m.kind.some((k) => k === KIND_BAND)).toBe(false)
    expect(crossingAlong(r, Array.from({ length: W }, (_, x) => 10 * W + x), 0, (i) => i % W >= 62)).toBeNull()
  })

  it('finds the crossing across a short gap in the ground returns, not a long one', () => {
    const row = Array.from({ length: W }, (_, x) => 10 * W + x)
    expect((crossingAlong(r, row, 0, (i) => i % W < 58 || i % W > 60) ?? -1) % W).toBe(61)
    expect(crossingAlong(r, row, 0, (i) => i % W < 55 || i % W > 64)).toBeNull()
  })

  it('counts a cell as measured ground one cell from a ground return, not two', () => {
    const g = new Uint8Array(5 * 5)
    g[2 * 5 + 2] = 1
    const n = nearGround(g, 5, 5)
    expect(n[1 * 5 + 1]).toBe(1)
    expect(n[3 * 5 + 3]).toBe(1)
    expect(n[0]).toBe(0)
    expect(n[2 * 5 + 4]).toBe(0)
  })

  it('turns feet above MLLW into NAVD88 metres', () => {
    expect(waterNavd(0, 0.667)).toBeCloseTo(-0.667, 6)
    expect(waterNavd(-0.123 / 0.3048, 0.667)).toBeCloseTo(-0.79, 6)
  })
})
