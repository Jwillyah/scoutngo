/*
 * THE 3D OVERVIEW, OFFLINE.
 *
 * The 3D view reads every tile through the same cache as the 2D map
 * (loadTile in offlineCache.ts), so the venue ring the 2D map already saves
 * (zoom 14 and up) is there with no signal. What the ring does not hold is
 * the coarse pyramid above it, which the 3D view stands the globe on and
 * draws the distance from. The first time 3D opens with a signal, imagery to
 * zoom 13 and elevation to zoom 15 over 1.5 km around the venue are saved as a "3D overview"
 * area: a few dozen tiles, listed with the other saved areas with their real
 * size, and deletable like them.
 */
import type { LatLon } from '../core/geo.ts'
import { downloadArea, isOnline, loadAreas, sameBox } from './offlineCache.ts'
import { boxAround } from './tileRange.ts'

export const OVERVIEW_RADIUS_M = 1500
/* Imagery to 13 (the ring has 14 and up); elevation to the source's deepest, 15, so near ground has its real height. */
export const OVERVIEW_IMAGERY_ZOOMS: readonly [number, number] = [0, 13]
export const OVERVIEW_TERRAIN_ZOOMS: readonly [number, number] = [0, 15]

export async function ensure3dOverview(venue: LatLon, venueLabel: string, signal: AbortSignal): Promise<'saved' | 'had' | 'offline' | 'failed'> {
  const box = boxAround(venue, OVERVIEW_RADIUS_M)
  if (loadAreas().some((a) => a.kind === '3d' && sameBox(a.box, box))) return 'had'
  if (!isOnline()) return 'offline'
  const result = await downloadArea(
    { kind: '3d', label: `3D overview around ${venueLabel}`, box, imageryZooms: [...OVERVIEW_IMAGERY_ZOOMS], terrainZooms: [...OVERVIEW_TERRAIN_ZOOMS] },
    signal,
  )
  return result.status === 'ok' ? 'saved' : 'failed'
}
