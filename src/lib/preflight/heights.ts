/*
 * WHAT STANDS UNDER THE PATH, FOR THE FLIGHT CARD.
 *
 * With a kept 3D scan: its ground (DTM) and its top surface (DSM), metres.
 * Without one: flat ground at 0 and the map's buildings as solid boxes of
 * their known heights; a building with no known height is not in the
 * surface at all, and the card says the ground was taken as flat.
 */
import type { Heights } from '../../core/flight.ts'
import type { LatLon } from '../../core/geo.ts'
import type { Building } from '../buildings.ts'
import { mercator } from '../lidar/grid.ts'
import { cellIndex } from '../lidar/raster.ts'
import type { ScanContext } from '../lidar/applyScan.ts'

export interface PreflightHeights extends Heights {
  boxes: { ring: [number, number][]; topM: number }[]
  /** 'scan' with its year, or 'map' (flat ground, boxes). */
  source: { kind: 'scan'; year: number | null } | { kind: 'map' }
}

function inRing(ring: readonly [number, number][], at: LatLon): boolean {
  let c = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[j]
    if (y1 > at.lat !== y2 > at.lat && at.lon < ((x2 - x1) * (at.lat - y1)) / (y2 - y1) + x1) c = !c
  }
  return c
}

export function preflightHeights(scan: ScanContext | null, buildings: readonly Building[]): PreflightHeights {
  if (scan !== null) {
    const r = scan.rasters
    const sample = (g: Float32Array) => (at: LatLon) => {
      const m = mercator(at.lat, at.lon)
      const i = cellIndex(r, m.x, m.y)
      return i < 0 || Number.isNaN(g[i]) ? null : g[i]
    }
    const ground = sample(r.dtm)
    const boxes = buildings
      .filter((b) => b.height.metres !== null)
      .map((b) => {
        const lon = b.ring.reduce((s, p) => s + p[0], 0) / b.ring.length
        const lat = b.ring.reduce((s, p) => s + p[1], 0) / b.ring.length
        return { ring: b.ring, topM: (ground({ lat, lon }) ?? 0) + (b.height.metres as number) }
      })
    return { groundAt: ground, surfaceAt: sample(r.dsm), boxes, source: { kind: 'scan', year: scan.scan.year } }
  }
  const boxes = buildings.filter((b) => b.height.metres !== null).map((b) => ({ ring: b.ring, topM: b.height.metres as number }))
  return {
    groundAt: () => 0,
    surfaceAt: (at) => {
      let top = 0
      for (const b of boxes) if (b.topM > top && inRing(b.ring, at)) top = b.topM
      return top
    },
    boxes,
    source: { kind: 'map' },
  }
}
