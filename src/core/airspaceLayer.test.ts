import { describe, expect, it } from 'vitest'
import { airspaceLayer, MAX_GRID_CELLS, polygonsOf } from './airspaceLayer.ts'
import type { AirspaceShape } from './airspaceLookup.ts'

const square = (w: number, s: number, e: number, n: number) => [w, s, e, s, e, n, w, n]
const classD: AirspaceShape = {
  cls: 'D',
  local: 'CLASS_D',
  name: 'Test D',
  upper: 2500,
  upperUom: 'FT',
  rings: [square(-76.05, 36.8, -75.95, 36.9)],
  bbox: [-76.05, 36.8, -75.95, 36.9],
}
const view = { south: 36.84, west: -76.0, north: 36.85, east: -75.99 }

describe('the airspace overlay for one view', () => {
  it('outlines a shape in view, closes its ring, and leaves out one that is not', () => {
    const far: AirspaceShape = { ...classD, name: 'Far', bbox: [-80, 30, -79.9, 30.1], rings: [square(-80, 30, -79.9, 30.1)] }
    const out = airspaceLayer({ view, classShapes: [classD, far], specialUse: [], parks: [], ceilingAt: () => null, cellsPerDegree: 120 })
    const classes = out.collection.features.filter((f) => f.properties?.kind === 'class' && f.properties.draw === 'line')
    expect(classes).toHaveLength(1)
    const line = (classes[0].geometry as GeoJSON.MultiLineString).coordinates[0]
    expect(line[0]).toEqual(line[line.length - 1])
  })

  it('draws a square for every grid cell in view, with its ceiling, and none where the grid has none', () => {
    const out = airspaceLayer({
      view,
      classShapes: [],
      specialUse: [],
      parks: [],
      ceilingAt: (lat) => (lat > 36.845 ? 200 : null),
      cellsPerDegree: 120,
    })
    /* 36.84..36.85 at 120 per degree is rows 4420..4422; -76.00..-75.99 is columns -9120..-9119. */
    expect(out.gridTooDense).toBe(false)
    expect(out.gridLabels.length).toBeGreaterThan(0)
    expect(out.gridLabels.every((l) => l.feet === 200 && l.at.lat > 36.845)).toBe(true)
    const cell = out.collection.features.find((f) => f.properties?.kind === 'cell')
    expect(cell).toBeDefined()
    if (cell === undefined) return
    const ring = (cell.geometry as GeoJSON.Polygon).coordinates[0]
    expect(Math.abs(ring[1][0] - ring[0][0])).toBeCloseTo(1 / 120, 9)
  })

  it('says the grid was left out when the view is too wide, rather than drawing nothing silently', () => {
    const wide = { south: 36, west: -77, north: 37, east: -76 }
    const out = airspaceLayer({ view: wide, classShapes: [], specialUse: [], parks: [], ceilingAt: () => 100, cellsPerDegree: 120 })
    expect(120 * 120).toBeGreaterThan(MAX_GRID_CELLS)
    expect(out.gridTooDense).toBe(true)
    expect(out.gridLabels).toHaveLength(0)
  })
})

describe('rings that mean inside an odd number of them, sorted for a fill', () => {
  it('makes a ring inside another its hole, and a ring beside it its own piece', () => {
    const outer = square(0, 0, 10, 10)
    const hole = square(4, 4, 6, 6)
    const island = square(4.5, 4.5, 5.5, 5.5)
    const beside = square(20, 0, 25, 5)
    const polys = polygonsOf([outer, hole, island, beside])
    /* The outer with its hole; the island in the hole is a piece again; and the one beside. */
    expect(polys).toHaveLength(3)
    expect(polys.find((p) => p[0][0][0] === 0)).toHaveLength(2)
    expect(polys.find((p) => p[0][0][0] === 4.5)).toHaveLength(1)
    expect(polys.find((p) => p[0][0][0] === 20)).toHaveLength(1)
  })
})
