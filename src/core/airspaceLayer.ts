/*
 * THE AIRSPACE OVERLAY, AS MAP GEOMETRY FOR ONE VIEW.
 *
 * Four kinds of shape, all from the baked official data (docs/airspace-sources.md):
 *
 *   class       Class B, C, D and surface E areas, outlined.
 *   cell        the FAA facility map grid, one square per half arc-minute,
 *               carrying the ceiling LAANC can approve there.
 *   restricted  restricted (R) and prohibited (P) areas.
 *   park        National Park Service units: no drone launch inside.
 *
 * ONLY WHAT IS IN VIEW. Shapes are kept when their box meets the view; grid
 * squares are enumerated for the view and given up past MAX_GRID_CELLS rather
 * than freezing the phone at a state-wide zoom. The result says when that
 * happened, so a missing grid reads as "zoom in", never as "no grid".
 *
 * FILLED, NOT ONLY OUTLINED. Standing inside a Class D the boundary is miles
 * off screen; an outline alone draws nothing at street zoom, which reads as no
 * airspace. So every area is a filled polygon as well as a line. The baked
 * rings mean "inside an odd number of them", pieces and holes mixed, and a
 * fill needs them sorted: a ring inside an odd number of other rings is a
 * hole of the smallest one holding it; otherwise it is a piece of its own.
 */
import type { AirspaceShape } from './airspaceLookup.ts'
import type { LatLon, Position } from './geo.ts'
import type { ParkUnit, SpecialUseArea } from './restrictions.ts'

export interface ViewBox {
  south: number
  west: number
  north: number
  east: number
}

/** Above this many squares in view the grid is not drawn; the caller says to zoom in. */
export const MAX_GRID_CELLS = 400

export interface AirspaceLayerInput {
  view: ViewBox
  classShapes: readonly AirspaceShape[]
  specialUse: readonly SpecialUseArea[]
  parks: readonly ParkUnit[]
  /** The facility map ceiling at a point, in feet above ground, or null with no square there. */
  ceilingAt: (lat: number, lon: number) => number | null
  /** The grid's own squares per degree, read from the baked grid rather than restated here. */
  cellsPerDegree: number
}

export interface GridLabel {
  at: LatLon
  feet: number
}

export interface AirspaceLayer {
  collection: GeoJSON.FeatureCollection
  /** One per grid square drawn, at its centre: the ceiling, for a label. */
  gridLabels: GridLabel[]
  /** True when the view held more than MAX_GRID_CELLS squares and the grid was left out. */
  gridTooDense: boolean
}

const meets = (bbox: readonly number[], view: ViewBox) =>
  bbox[0] <= view.east && bbox[2] >= view.west && bbox[1] <= view.north && bbox[3] >= view.south

function ringLine(flat: readonly number[]): Position[] {
  const out: Position[] = []
  for (let i = 0; i + 1 < flat.length; i += 2) out.push([flat[i], flat[i + 1]])
  if (out.length > 0) {
    const [a, b] = [out[0], out[out.length - 1]]
    if (a[0] !== b[0] || a[1] !== b[1]) out.push([a[0], a[1]])
  }
  return out
}

function inFlatRing(ring: readonly number[], lon: number, lat: number): boolean {
  let inside = false
  const n = ring.length / 2
  for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
    const xi = ring[i * 2]
    const yi = ring[i * 2 + 1]
    const xj = ring[j * 2]
    const yj = ring[j * 2 + 1]
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function ringArea(ring: readonly number[]): number {
  let a = 0
  const n = ring.length / 2
  for (let i = 0, j = n - 1; i < n; j = i, i += 1) a += ring[j * 2] * ring[i * 2 + 1] - ring[i * 2] * ring[j * 2 + 1]
  return Math.abs(a / 2)
}

/**
 * Pieces with their holes, from rings that mean "inside an odd number".
 * A ring's first vertex decides which rings hold it: shapes in the extract do
 * not cross, so one vertex is enough.
 */
export function polygonsOf(rings: readonly (readonly number[])[]): Position[][][] {
  const usable = rings.filter((r) => r.length >= 6)
  const holders = usable.map((ring, i) =>
    usable
      .map((other, j) => ({ other, j }))
      .filter(({ other, j }) => j !== i && inFlatRing(other, ring[0], ring[1]))
      .map(({ j }) => j),
  )
  const polygons = new Map<number, Position[][]>()
  usable.forEach((ring, i) => {
    if (holders[i].length % 2 === 0) polygons.set(i, [ringLine(ring)])
  })
  usable.forEach((ring, i) => {
    if (holders[i].length % 2 === 0) return
    /* The smallest outer piece holding it is the one it is a hole in. */
    const outer = holders[i]
      .filter((j) => polygons.has(j))
      .sort((a, b) => ringArea(usable[a]) - ringArea(usable[b]))[0]
    if (outer !== undefined) polygons.get(outer)?.push(ringLine(ring))
  })
  return [...polygons.values()]
}

function outline(rings: readonly (readonly number[])[], properties: GeoJSON.GeoJsonProperties): GeoJSON.Feature[] {
  return [
    {
      type: 'Feature',
      properties: { ...properties, draw: 'line' },
      geometry: { type: 'MultiLineString', coordinates: rings.map(ringLine).filter((r) => r.length > 1) },
    },
    {
      type: 'Feature',
      properties: { ...properties, draw: 'fill' },
      geometry: { type: 'MultiPolygon', coordinates: polygonsOf(rings) },
    },
  ]
}

export function airspaceLayer(input: AirspaceLayerInput): AirspaceLayer {
  const { view } = input
  const features: GeoJSON.Feature[] = []

  for (const shape of input.classShapes) {
    if (meets(shape.bbox, view)) features.push(...outline(shape.rings, { kind: 'class', cls: shape.cls }))
  }
  for (const area of input.specialUse) {
    if (meets(area.bbox, view)) features.push(...outline(area.rings, { kind: 'restricted', type: area.type }))
  }
  for (const park of input.parks) {
    if (meets(park.bbox, view)) features.push(...outline(park.rings, { kind: 'park' }))
  }

  const per = input.cellsPerDegree
  const south = Math.floor(view.south * per)
  const north = Math.floor(view.north * per)
  const west = Math.floor(view.west * per)
  const east = Math.floor(view.east * per)
  const count = (north - south + 1) * (east - west + 1)
  const gridLabels: GridLabel[] = []
  const gridTooDense = count > MAX_GRID_CELLS

  if (!gridTooDense) {
    for (let y = south; y <= north; y += 1) {
      for (let x = west; x <= east; x += 1) {
        const s = y / per
        const w = x / per
        const n = (y + 1) / per
        const e = (x + 1) / per
        const centre = { lat: (s + n) / 2, lon: (w + e) / 2 }
        const feet = input.ceilingAt(centre.lat, centre.lon)
        if (feet === null) continue
        features.push({
          type: 'Feature',
          properties: { kind: 'cell', feet },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [w, s],
                [e, s],
                [e, n],
                [w, n],
                [w, s],
              ],
            ],
          },
        })
        gridLabels.push({ at: centre, feet })
      }
    }
  }

  return { collection: { type: 'FeatureCollection', features }, gridLabels, gridTooDense }
}
