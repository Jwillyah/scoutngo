import { describe, expect, it } from 'vitest'
import { cellCall, cellCalls, cellLine, findCells, latLonPixel, trackCells, type Grid, type Scan } from '../src/core/stormCells.ts'
import { destinationPoint } from '../src/core/geo.ts'

const VENUE = { lat: 36.85, lon: -75.98 }
const Z = 7

/** A 160 x 160 px grid round the venue with a round cell of `dbz` at `centre`, radius r px. */
function grid(centre: { lat: number; lon: number }, r = 3, dbz = 50): Grid {
  const v = latLonPixel(Z, VENUE)
  const px0 = Math.floor(v.gx) - 80
  const py0 = Math.floor(v.gy) - 80
  const c = latLonPixel(Z, centre)
  const g: Grid = { w: 160, h: 160, dbz: new Float32Array(160 * 160).fill(NaN), px0, py0, zoom: Z }
  for (let y = 0; y < 160; y += 1) for (let x = 0; x < 160; x += 1) if (Math.hypot(px0 + x + 0.5 - c.gx, py0 + y + 0.5 - c.gy) <= r) g.dbz[y * 160 + x] = dbz
  return g
}

const T0 = new Date('2026-07-15T23:00:00Z')
/** A cell moving `toward` at kmh, `startKm` from the venue at `fromDeg` at the newest scan; three scans 10 min apart. */
function scans(fromDeg: number, startKm: number, toward: number, kmh: number, dbz = 50): Scan[] {
  return [20, 10, 0].map((ago) => {
    const now = destinationPoint(VENUE, fromDeg, startKm * 1000)
    const then = destinationPoint(now, (toward + 180) % 360, (kmh * ago * 1000) / 60)
    return { at: new Date(T0.getTime() - ago * 60_000), cells: findCells(grid(then, 3, dbz)) }
  })
}

describe('storm cells (Batch K, Section 2)', () => {
  it('finds a 40 dBZ patch and not a 35 one', () => {
    expect(findCells(grid(VENUE, 3, 45)).length).toBe(1)
    expect(findCells(grid(VENUE, 3, 35)).length).toBe(0)
  })

  it('a cell 30 km W moving E at 40 km/h arrives in about 40 minutes and ends after', () => {
    const t = trackCells(scans(270, 30, 90, 40))
    expect(t.length).toBe(1)
    expect(t[0].scans).toBe(3)
    const c = cellCall(VENUE, t[0], T0)
    expect(Math.hypot(t[0].v?.e ?? 0, t[0].v?.n ?? 0)).toBeCloseTo(40, -1)
    expect(c.towardDeg).toBeGreaterThan(80)
    expect(c.towardDeg).toBeLessThan(100)
    const leadMin = ((c.arrives?.getTime() ?? 0) - T0.getTime()) / 60_000
    /* 30 km less the cell's own radius (~3.6 km) and the hit width, at 40 km/h. */
    expect(leadMin).toBeGreaterThan(30)
    expect(leadMin).toBeLessThan(46)
    expect((c.ends?.getTime() ?? 0)).toBeGreaterThan(c.arrives?.getTime() ?? Infinity)
    expect(c.sure).toBe('about')
    const line = cellLine(c, { dist: 'mi', clock: (d) => d.toISOString().slice(11, 16) })
    expect(line).toMatch(/^Cell 19 mi W · moving E \d+ mph · arrives about \d\d:\d\d · ends about \d\d:\d\d$/)
  })

  it('a cell that will pass to the north says how far and which side', () => {
    const start = destinationPoint(destinationPoint(VENUE, 0, 15_000), 270, 30_000)
    const ss = [20, 10, 0].map((ago) => ({ at: new Date(T0.getTime() - ago * 60_000), cells: findCells(grid(destinationPoint(start, 270, (40 * ago * 1000) / 60))) }))
    const c = cellCall(VENUE, trackCells(ss)[0], T0)
    expect(c.arrives).toBeNull()
    expect(c.passSide).toBe('N')
    expect(c.passKm).toBeGreaterThan(9)
    expect(c.passKm).toBeLessThan(14)
  })

  it('nothing past 90 minutes from extrapolation alone', () => {
    const c = cellCall(VENUE, trackCells(scans(270, 70, 90, 30))[0], T0)
    expect(c.arrives).toBeNull()
    expect(c.beyond).toBe(true)
    expect(cellLine(c, { dist: 'km', clock: () => 'x' })).toContain('later than 90 min')
  })

  it('a cell over you says when it ends', () => {
    const c = cellCall(VENUE, trackCells(scans(270, 1, 90, 30))[0], T0)
    expect(c.over).toBe(true)
    expect(c.ends).not.toBeNull()
  })

  it('a cell with no match moves with the others, a step less sure', () => {
    const a = scans(270, 30, 90, 40)
    /* A second cell appears only in the newest scan, 40 km S. */
    const extra = findCells(grid(destinationPoint(VENUE, 180, 40_000)))
    const ss = [a[0], a[1], { ...a[2], cells: [...a[2].cells, ...extra] }]
    const t = trackCells(ss)
    const lone = t.find((x) => x.borrowed)
    expect(lone).toBeDefined()
    expect(lone?.v?.e).toBeCloseTo(t.find((x) => !x.borrowed)?.v?.e ?? 0, 3)
    expect(cellCalls(VENUE, t, T0)[0].arrives).not.toBeNull()
  })
})
