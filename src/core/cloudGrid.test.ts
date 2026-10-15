import { describe, expect, it } from 'vitest'
import { bearingBetween, distanceMeters, type LatLon, type Position } from './geo.ts'
import {
  CELL_HALF_METERS,
  cellCover,
  cellPolygon,
  cloudGridPoints,
  GRID_CELLS,
  GRID_HALF_SPAN_METERS,
} from './cloudGrid.ts'

const VENUE: LatLon = { lat: 36.9063, lon: -76.0836 }
const at = (p: Position): LatLon => ({ lat: p[1], lon: p[0] })

describe('the forecast grid', () => {
  const points = cloudGridPoints(VENUE)

  it('is one request worth of points', () => {
    expect(points).toHaveLength(GRID_CELLS * GRID_CELLS)
    expect(points.length).toBeLessThanOrEqual(25)
  })

  it('is centred on the venue, with one cell on it', () => {
    const middle = points.find((p) => p.ix === 2 && p.iy === 2)
    expect(middle).toBeDefined()
    if (middle === undefined) return
    expect(distanceMeters(VENUE, middle.at)).toBeLessThan(1)
  })

  it('reaches the span it says it does', () => {
    const far = Math.max(...points.map((p) => distanceMeters(VENUE, p.at)))
    // The corner cell centre, which is inside the full span by half a cell.
    expect(far).toBeGreaterThan(GRID_HALF_SPAN_METERS * 0.8)
    expect(far).toBeLessThan(GRID_HALF_SPAN_METERS * 1.6)
  })

  /*
   * SPACED IN METRES, NOT DEGREES. A grid built by adding degrees stretches
   * with latitude and misreports where the cloud is.
   */
  it('spaces cells evenly in metres', () => {
    const row = points.filter((p) => p.iy === 2).sort((a, b) => a.ix - b.ix)
    const gaps: number[] = []
    for (let i = 1; i < row.length; i++) gaps.push(distanceMeters(row[i - 1].at, row[i].at))
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0], -1)
  })

  it('runs west to east and south to north', () => {
    const row = points.filter((p) => p.iy === 2).sort((a, b) => a.ix - b.ix)
    expect(row[0].at.lon).toBeLessThan(row[row.length - 1].at.lon)
    const col = points.filter((p) => p.ix === 2).sort((a, b) => a.iy - b.iy)
    expect(col[0].at.lat).toBeLessThan(col[col.length - 1].at.lat)
  })
})

describe('a cell square', () => {
  const ring = cellPolygon(VENUE)[0]

  it('is a closed ring of four corners', () => {
    expect(ring).toHaveLength(5)
    expect(ring[0]).toEqual(ring[4])
  })

  it('is centred on its point, every corner the same distance away', () => {
    const d = ring.slice(0, 4).map((p) => distanceMeters(VENUE, at(p)))
    for (const one of d) expect(one).toBeCloseTo(d[0], 0)
  })

  it('is the size the cell spacing says', () => {
    const top = distanceMeters(at(ring[0]), at(ring[1]))
    expect(top).toBeCloseTo(CELL_HALF_METERS * 2, -2)
  })

  it('has its corners on the diagonals', () => {
    const nw = bearingBetween(VENUE, at(ring[0]))
    expect(nw).toBeGreaterThan(300)
    expect(nw).toBeLessThan(330)
  })
})

/*
 * TOTAL COVER IS THE MOST BLOCKING LAYER, not a sum and not a mean.
 *
 * Layers overlap, so the worst single one decides whether light gets through,
 * which is the same reasoning src/core/cloud.ts uses when it keeps worstLow.
 */
describe('how much cloud one cell has', () => {
  it('takes the most blocking layer', () => {
    expect(cellCover({ low: 20, mid: 80, high: 10 })).toBe(80)
    expect(cellCover({ low: 90, mid: 0, high: 0 })).toBe(90)
  })

  it('does not add the layers together', () => {
    expect(cellCover({ low: 50, mid: 50, high: 50 })).toBe(50)
  })

  /* A CELL THE FORECAST DID NOT COVER IS NOT A CLEAR CELL. */
  it('is null when no layer reported', () => {
    expect(cellCover({ low: null, mid: null, high: null })).toBeNull()
  })

  it('uses the layers it does have', () => {
    expect(cellCover({ low: null, mid: 40, high: null })).toBe(40)
  })

  it('keeps a genuine nought as nought', () => {
    expect(cellCover({ low: 0, mid: 0, high: 0 })).toBe(0)
  })
})
