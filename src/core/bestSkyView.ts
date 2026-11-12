/*
 * WHERE'S THE COLOR? PAGE 1, THE AREA AS A MAP (Batch BEST SKY, Section 3;
 * board BestSky_Map). Web Mercator arithmetic only: the zoom and the box that
 * hold the radius's ring, the imagery tiles under it (never more than
 * AREA_TILE_CAP), and the soft wash's spots, the grid's points that score.
 */
import { POSSIBLE_FROM, type RadiusMi, type ScoredPoint } from './bestSky.ts'
import { destinationPoint, type LatLon } from './geo.ts'
import { TILE_PX, viewTiles, worldPx, type TileView } from './tileView.ts'

const KM_PER_MI = 1.609344
/** The ring is drawn at most this many px across at the chosen zoom; the box is a little wider and taller than it. */
export const RING_MAX_PX = 400
export const BOX_OVER_RING = 1.12
export const BOX_TALL = 1.25
/** At most this many imagery tiles for the page's map, whatever the radius. */
export const AREA_TILE_CAP = 16
const ZOOMS: readonly [number, number] = [5, 13]

/** The box round the spot that holds the ring at the closest zoom it fits. */
export function areaView(spot: LatLon, radiusMi: RadiusMi): TileView {
  const m = radiusMi * KM_PER_MI * 1000
  const n = destinationPoint(spot, 0, m)
  const s = destinationPoint(spot, 180, m)
  let z = ZOOMS[1]
  while (z > ZOOMS[0] && worldPx(s, z).y - worldPx(n, z).y > RING_MAX_PX) z -= 1
  const across = worldPx(s, z).y - worldPx(n, z).y
  const width = Math.round(across * BOX_OVER_RING)
  const height = Math.round(width * BOX_TALL)
  const c = worldPx(spot, z)
  /* The spot sits a little below the middle, as on the board: the sheet covers the foot of the box. */
  const view = { z, left: c.x - width / 2, top: c.y - height * 0.42, width, height }
  return view
}

/** The tiles under the box, capped. */
export const areaTiles = (view: TileView) => viewTiles(view).slice(0, AREA_TILE_CAP)

/** The ring's radius in the box's px. */
export function ringPx(view: TileView, spot: LatLon, radiusMi: RadiusMi): number {
  const n = destinationPoint(spot, 0, radiusMi * KM_PER_MI * 1000)
  return worldPx(spot, view.z).y - worldPx(n, view.z).y
}

/** The grid's spacing in the box's px. */
function gridStepPx(view: TileView, grid: readonly ScoredPoint[]): number {
  return grid.length < 2 ? TILE_PX / 32 : Math.abs(worldPx(grid[1], view.z).x - worldPx(grid[0], view.z).x) || TILE_PX / 32
}

/** The wash's softness: about half a grid step, so the points melt into patches. */
export const washBlur = (view: TileView, grid: readonly ScoredPoint[]): number => gridStepPx(view, grid) * 0.55

/** The wash: the grid's points that score Possible or better, each a soft spot as strong as its score. Clear and blocked points draw nothing. */
export function washSpots(view: TileView, grid: readonly ScoredPoint[]): { x: number; y: number; r: number; o: number }[] {
  if (grid.length < 2) return []
  const step = gridStepPx(view, grid)
  return grid
    .filter((g) => !g.blocked && g.score >= POSSIBLE_FROM)
    .map((g) => {
      const w = worldPx(g, view.z)
      return { x: w.x - view.left, y: w.y - view.top, r: step * 1.1, o: Math.min(0.85, 0.15 + g.score * 0.7) }
    })
}
