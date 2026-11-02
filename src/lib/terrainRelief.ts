/*
 * THE 2D TERRAIN LAYER'S DATA: the relief round the venue and its 10 m
 * contours, from the same terrarium elevation tiles the 3D view and the
 * horizon read (s3 elevation-tiles-prod, already on the privacy page).
 * Arithmetic in src/core/contours.ts; heights decoded from the PNG's bytes
 * (src/lib/png.ts), never through a canvas.
 *
 * A 3 x 3 block of z14 tiles centred on the venue, about 7 km across at the
 * latitudes this is used at; GRID points a tile.
 */
import { contourSegments, CONTOUR_M, despike, relief } from '../core/contours.ts'
import type { LatLon } from '../core/geo.ts'
import { heightGrid } from '../core/terrarium.ts'
import { TERRAIN_TEMPLATE } from './offlineSources.ts'
import { decodePng } from './png.ts'

export const RELIEF_ZOOM = 14
const GRID = 48

const tileOf = (at: LatLon, z: number) => {
  const n = 2 ** z
  const x = ((at.lon + 180) / 360) * n
  const r = (at.lat * Math.PI) / 180
  const y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n
  return { x, y }
}
const lonOf = (x: number, z: number) => (x / 2 ** z) * 360 - 180
const latOf = (y: number, z: number) => {
  const m = Math.PI - (2 * Math.PI * y) / 2 ** z
  return (180 / Math.PI) * Math.atan(Math.sinh(m))
}

export interface Relief {
  /** Highest minus lowest, metres. */
  metres: number
  contours: GeoJSON.FeatureCollection
}

export async function reliefAround(venue: LatLon, fetchImpl: typeof fetch = fetch): Promise<Relief | null> {
  const z = RELIEF_ZOOM
  const c = tileOf(venue, z)
  const cx = Math.floor(c.x)
  const cy = Math.floor(c.y)
  const side = GRID * 3
  const grid = new Float32Array(side * side)
  try {
    await Promise.all(
      [-1, 0, 1].flatMap((dy) =>
        [-1, 0, 1].map(async (dx) => {
          const url = TERRAIN_TEMPLATE.replace('{z}', String(z)).replace('{x}', String(cx + dx)).replace('{y}', String(cy + dy))
          const r = await fetchImpl(url)
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          const px = await decodePng(new Uint8Array(await r.arrayBuffer()))
          const g = heightGrid(px.data, px.width, GRID)
          for (let j = 0; j < GRID; j += 1) for (let i = 0; i < GRID; i += 1) grid[((dy + 1) * GRID + j) * side + (dx + 1) * GRID + i] = g[j * GRID + i]
        }),
      ),
    )
  } catch {
    return null
  }
  /* Towers out first, so they are neither relief nor rings over the water (src/core/contours.ts). */
  const land = despike(grid, side)
  const metres = relief(land)
  if (metres === null) return null
  /* Grid point (i, j) of the stitched block, as a place: each tile's GRID points span it edge to edge. */
  const place = (gx: number, gy: number): [number, number] => {
    const tx = cx - 1 + Math.floor(gx / GRID) + (gx % GRID) / (GRID - 1)
    const ty = cy - 1 + Math.floor(gy / GRID) + (gy % GRID) / (GRID - 1)
    return [lonOf(tx, z), latOf(ty, z)]
  }
  const features: GeoJSON.Feature[] = contourSegments(land, side, CONTOUR_M).map((s) => ({
    type: 'Feature',
    properties: { level: s.level, major: s.level % 50 === 0 },
    geometry: { type: 'LineString', coordinates: [place(s.a[0], s.a[1]), place(s.b[0], s.b[1])] },
  }))
  return { metres, contours: { type: 'FeatureCollection', features } }
}
