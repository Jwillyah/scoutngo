/*
 * WHERE THE WATER IS, FOR THE GROUND (Batch D, Section 3).
 *
 * The elevation over near-shore water is the water's own surface, often a
 * little above the tide: drawn as it is, the photo's sea stood above the
 * water mesh as a dark slab (the pier, 1 Nov). So the ground is carved under
 * the map's water polygons: inside them it is taken below any tide, and the
 * water surface covers it everywhere the map says water.
 *
 * The polygons are filled into a mask on a canvas and read back. WebKit adds
 * a little noise to pixels read back from a canvas; the mask is 0 or 255 and
 * read against 128, so a few units of noise cannot flip it.
 */
import { loadVectorTile, vectorExtent } from '../../lib/vectorTiles.ts'
import { latOf, lonOf, tileX, tileY } from './sources.ts'

export const MASK_PX = 1024

export interface WaterMask {
  inWater(lat: number, lon: number): boolean
}

const NONE: WaterMask = { inWater: () => false }

/** Which polygons fill the mask: a layer of the tiles, and optionally only some classes in it. */
export interface MaskOf {
  layer: string
  keep?: (props: Record<string, unknown>) => boolean
}

/** The water over a lat/lon box, from vector tiles at zoom `z`; nothing where they cannot be had. */
export function waterMaskFor(north: number, south: number, west: number, east: number, z: number): Promise<WaterMask> {
  return polygonMaskFor({ layer: 'water' }, north, south, west, east, z)
}

/** Any of the map's polygons over a box, the same way (woods.ts asks for the woodland). */
export async function polygonMaskFor(of: MaskOf, north: number, south: number, west: number, east: number, z: number): Promise<WaterMask> {
  const x0 = Math.floor(tileX(west, z))
  const x1 = Math.floor(tileX(east, z))
  const y0 = Math.floor(tileY(north, z))
  const y1 = Math.floor(tileY(south, z))
  const canvas = new OffscreenCanvas(MASK_PX, MASK_PX)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (ctx === null) return NONE
  const yN = tileY(north, 0)
  const yS = tileY(south, 0)
  const px = (lon: number) => ((lon - west) / (east - west)) * MASK_PX
  const py = (lat: number) => ((tileY(lat, 0) - yN) / (yS - yN)) * MASK_PX
  ctx.fillStyle = '#fff'
  let any = false
  await Promise.all(
    Array.from({ length: (x1 - x0 + 1) * (y1 - y0 + 1) }, async (_, k) => {
      const x = x0 + (k % (x1 - x0 + 1))
      const y = y0 + Math.floor(k / (x1 - x0 + 1))
      const tile = await loadVectorTile({ z, x, y })
      const layer = tile?.layers[of.layer]
      if (tile == null || layer === undefined) return
      const ext = layer.extent || vectorExtent(tile)
      for (let i = 0; i < layer.length; i += 1) {
        const f = layer.feature(i)
        if (f.type !== 3) continue
        if (of.keep !== undefined && !of.keep(f.properties)) continue
        ctx.beginPath()
        for (const ring of f.loadGeometry()) {
          ring.forEach((p, j) => {
            const X = px(lonOf(x + p.x / ext, z))
            const Y = py(latOf(y + p.y / ext, z))
            if (j === 0) ctx.moveTo(X, Y)
            else ctx.lineTo(X, Y)
          })
          ctx.closePath()
        }
        /* Even-odd: a hole is a hole (an island in a lake). */
        ctx.fill('evenodd')
        any = true
      }
    }),
  )
  if (!any) return NONE
  const data = ctx.getImageData(0, 0, MASK_PX, MASK_PX).data
  return {
    inWater: (lat, lon) => {
      const X = Math.floor(px(lon))
      const Y = Math.floor(py(lat))
      if (X < 0 || Y < 0 || X >= MASK_PX || Y >= MASK_PX) return false
      return data[(Y * MASK_PX + X) * 4] > 128
    },
  }
}
