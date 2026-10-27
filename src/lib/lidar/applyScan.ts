/*
 * THE SCAN'S HEIGHTS ON THE BUILDINGS EVERYTHING ELSE READS.
 *
 * Applied to the building list once, so the 3D view, the 2D shadows, the
 * sightlines and Suggest all use the same heights: a footprint inside the
 * scan gets its measured height ('lidar', with the scan's year); one inside
 * with no building points is marked newer than the scan and keeps whatever
 * height the map gave it (none is never filled with a guess); one outside
 * keeps what it had.
 */
import type { Building } from '../buildings.ts'
import { mercator } from './grid.ts'
import { rasterHeight } from './buildingHeights.ts'
import type { Rasters } from './raster.ts'
import { rastersOf, type StoredScan } from './store.ts'

export interface ScanContext {
  scan: StoredScan
  rasters: Rasters
}

export const scanContext = (scan: StoredScan): ScanContext => ({ scan, rasters: rastersOf(scan) })

/** A footprint the download did not see: its height from the rasters alone (no points are kept). */
const fromRasters = (b: Building, r: Rasters) => rasterHeight(b.ring.map(([lon, lat]) => mercator(lat, lon)), r)

export function applyScan(buildings: readonly Building[], ctx: ScanContext): Building[] {
  return buildings.map((b) => {
    const kept = ctx.scan.heights[b.id]
    if (kept === 'newer') return { ...b, height: { ...b.height, newerThanScan: true, scanYear: ctx.scan.year } }
    if (kept !== undefined) return { ...b, height: { ...b.height, metres: kept.metres, drawMetres: kept.metres, source: 'lidar', scanYear: ctx.scan.year, newerThanScan: false } }
    const h = fromRasters(b, ctx.rasters)
    if (h.kind === 'outside-scan' || h.kind === 'newer-than-scan') return b
    return { ...b, height: { ...b.height, metres: h.byRaster, drawMetres: h.byRaster, source: 'lidar', scanYear: ctx.scan.year, newerThanScan: false } }
  })
}

export const scanLabel = (year: number | null): string => `Scanned ${year ?? 'in a year the project does not name'} from public lidar. Newer buildings may be missing.`
