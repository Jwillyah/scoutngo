import { describe, expect, it } from 'vitest'
import { buildRasters, canopyAt, cellIndex, fillHoles, KIND } from './raster.ts'
import { HEIGHT_AGREE_M, rasterHeight, scanHeight } from './buildingHeights.ts'

/*
 * A SYNTHETIC BLOCK OF KNOWN HEIGHT on flat ground at 2.0 m: a 20 x 20 m box
 * whose roof is at 14.0 m (12 m tall), a tree 6 m tall, and a puddle. Points
 * every half metre. One unit is one metre here (metresPerUnit 1).
 */
const area = { minx: 0, miny: 0, maxx: 100, maxy: 100, id: 't', metresPerUnit: 1 }
function scene(): Float64Array {
  const pts: number[] = []
  for (let x = 0.25; x < 100; x += 0.5) {
    for (let y = 0.25; y < 100; y += 0.5) {
      const inBox = x > 40 && x < 60 && y > 40 && y < 60
      const inTree = Math.hypot(x - 20, y - 80) < 3
      const inWater = x > 80 && y < 10
      /* The roof as the USGS projects deliver it: unclassified (1), not building (6). */
      if (inBox) pts.push(x, y, 14, 1, 1)
      else if (inTree) pts.push(x, y, 8, 5, 1, x, y, 2, 2, 2)
      else pts.push(x, y, 2, inWater ? 9 : 2, 1)
    }
  }
  return Float64Array.from(pts)
}
const box = [
  { x: 40, y: 40 },
  { x: 60, y: 40 },
  { x: 60, y: 60 },
  { x: 40, y: 60 },
]

describe('the scan as rasters', () => {
  const pts = scene()
  const r = buildRasters(pts, area)

  it('puts the ground at 2 m everywhere, under the roof too (filled from around it)', () => {
    expect(r.width).toBe(100)
    expect(r.dtm[cellIndex(r, 50, 50)]).toBeCloseTo(2, 6)
    expect(r.dtm[cellIndex(r, 10, 10)]).toBeCloseTo(2, 6)
    expect(r.kind[cellIndex(r, 50, 50)]).toBe(KIND.tall)
    expect(r.kind[cellIndex(r, 90, 5)]).toBe(KIND.water)
  })

  it('reads the tree as 6 m of canopy', () => {
    expect(canopyAt(r, cellIndex(r, 20, 80))).toBeCloseTo(6, 6)
    expect(canopyAt(r, cellIndex(r, 10, 10))).toBe(0)
  })

  it('measures the block 12 m tall, both ways, within the agreement', () => {
    const h = scanHeight(box, pts, r)
    expect(h.kind).toBe('measured')
    if (h.kind !== 'measured') return
    expect(h.metres).toBeCloseTo(12, 6)
    expect(Math.abs(h.metres - h.byRaster)).toBeLessThan(HEIGHT_AGREE_M)
  })

  it('a classified roof (6) measures the same as an unclassified one (1)', () => {
    const six = Float64Array.from(pts)
    for (let p = 0; p < six.length; p += 5) if (six[p + 2] === 14) six[p + 3] = 6
    const h = scanHeight(box, six, buildRasters(six, area))
    expect(h.kind === 'measured' ? h.metres : null).toBeCloseTo(12, 6)
  })

  it('a footprint with no roof returns in the scan is newer than the scan; one off it is outside', () => {
    const empty = [{ x: 5, y: 5 }, { x: 15, y: 5 }, { x: 15, y: 15 }, { x: 5, y: 15 }]
    expect(scanHeight(empty, pts, r).kind).toBe('newer-than-scan')
    expect(scanHeight(empty.map((p) => ({ x: p.x + 500, y: p.y })), pts, r).kind).toBe('outside-scan')
  })

  it('from the rasters alone (no points kept), the block is still 12 m', () => {
    const h = rasterHeight(box, r)
    expect(h.kind === 'measured' ? h.metres : null).toBeCloseTo(12, 6)
  })

  it('fills holes from their neighbours', () => {
    const g = Float32Array.from([1, Number.NaN, 3, Number.NaN])
    fillHoles(g, 2, 2)
    expect([...g].every((v) => !Number.isNaN(v))).toBe(true)
  })
})
