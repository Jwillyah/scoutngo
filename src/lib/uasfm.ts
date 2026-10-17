/*
 * THE BAKED FACILITY MAP, BOUND TO THE APP.
 *
 * src/core/faaGrid.ts is the pure decoder and knows no data. This is the one
 * place the generated extract is attached to it, so core stays testable
 * against synthetic grids and the 900KB file is imported exactly once.
 *
 * DECODED ONCE, LAZILY. The decode is a single pass that takes a few
 * milliseconds, but it is pointless on a ground-only shoot, so it happens on
 * the first lookup rather than at module load.
 */
import { decodeGrid, lookupCell, type FacilityCell, type FacilityGrid } from '../core/faaGrid.ts'
import {
  UASFM_CELLS_PER_DEGREE,
  UASFM_EFFECTIVE,
  UASFM_GRID,
  UASFM_PROFILES,
} from '../data/uasfm.ts'

let grid: FacilityGrid | null = null

export function facilityGrid(): FacilityGrid {
  grid ??= decodeGrid(UASFM_GRID, UASFM_PROFILES, UASFM_CELLS_PER_DEGREE)
  return grid
}

/** The cell at a coordinate, or null when the extract has none there. */
export function facilityCellAt(lat: number, lon: number): FacilityCell | null {
  return lookupCell(facilityGrid(), lat, lon)
}

/** The chart cycle this extract came from, as the FAA published it. */
export const facilityEffective = UASFM_EFFECTIVE
