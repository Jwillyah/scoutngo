/*
 * THE FORECAST CLOUD FIELD, AS A COARSE GRID.
 *
 * WHY A GRID AND WHY COARSE. Open-Meteo answers for points, so a map layer
 * means asking for several of them: a 5x5 grid is twenty-five points in one
 * request, which is the same call shape src/core/cloud.ts already uses along a
 * sightline. The cells are left deliberately large, around thirty kilometres,
 * because the model's own cells are several kilometres across and drawing a
 * smooth field over it would invent detail the forecast does not have.
 *
 * BEING BLOCKY IS THE POINT. The satellite layer is a photograph and this is a
 * model, and they must not be mistakable at a glance. Hard-edged squares next
 * to real imagery is the difference, visible before any label is read.
 */

import { destinationPoint, toPosition, type LatLon, type Position } from './geo.ts'
import type { LevelWind } from './windProfile.ts'

/** Cells across and down. Odd, so one cell is centred on the venue. */
export const GRID_CELLS = 5

/** How far the grid reaches from the venue, in metres, in each direction. */
export const GRID_HALF_SPAN_METERS = 75_000

/** One cell's own half width, which is what the squares are drawn from. */
export const CELL_HALF_METERS = GRID_HALF_SPAN_METERS / GRID_CELLS

export interface GridPoint {
  /** Column and row, so a response can be matched back to a cell. */
  ix: number
  iy: number
  at: LatLon
}

/**
 * The points to ask the forecast about: a square grid centred on the venue.
 *
 * Built by walking north and east from the centre rather than by adding
 * degrees, so the cells are the same size in metres everywhere rather than
 * stretching with latitude.
 */
export function cloudGridPoints(
  centre: LatLon,
  cells = GRID_CELLS,
  halfSpanMeters = GRID_HALF_SPAN_METERS,
): GridPoint[] {
  const out: GridPoint[] = []
  const step = (2 * halfSpanMeters) / cells
  const first = -halfSpanMeters + step / 2

  for (let iy = 0; iy < cells; iy++) {
    const northing = first + iy * step
    const row = destinationPoint(centre, northing >= 0 ? 0 : 180, Math.abs(northing))
    for (let ix = 0; ix < cells; ix++) {
      const easting = first + ix * step
      out.push({
        ix,
        iy,
        at: destinationPoint(row, easting >= 0 ? 90 : 270, Math.abs(easting)),
      })
    }
  }
  return out
}

/**
 * The square around one grid point, as a closed polygon ring.
 *
 * Drawn from the point outward in metres, for the same reason the points are
 * spaced in metres: a cell that stretched with latitude would misreport where
 * the cloud is.
 */
export function cellPolygon(
  at: LatLon,
  halfMeters = CELL_HALF_METERS,
): Position[][] {
  const north = destinationPoint(at, 0, halfMeters)
  const south = destinationPoint(at, 180, halfMeters)
  const nw = destinationPoint(north, 270, halfMeters)
  const ne = destinationPoint(north, 90, halfMeters)
  const se = destinationPoint(south, 90, halfMeters)
  const sw = destinationPoint(south, 270, halfMeters)
  const ring = [toPosition(nw), toPosition(ne), toPosition(se), toPosition(sw)]
  return [[...ring, ring[0]]]
}

/**
 * Total cloud from the three layers, for shading one cell.
 *
 * NOT A SUM AND NOT AN AVERAGE. Layers overlap, so the most blocking single
 * layer is what decides whether light gets through, which is the same
 * reasoning src/core/cloud.ts uses when it keeps worstLow rather than a mean.
 *
 * Null when no layer reported, because a cell the forecast did not cover is
 * not a clear cell.
 */
export function cellCover(layers: {
  low: number | null
  mid: number | null
  high: number | null
}): number | null {
  const known = [layers.low, layers.mid, layers.high].filter(
    (v): v is number => v !== null,
  )
  return known.length === 0 ? null : Math.max(...known)
}

/**
 * One cell of the drawn forecast field.
 *
 * Separate from the fetch result in src/lib/forecast.ts so the map layer
 * depends on core rather than on the network module.
 */
export interface ForecastCell {
  at: LatLon
  /** Percent, or null where the forecast did not cover this cell. */
  cover: number | null
  /**
   * Wind at each level the model serves for this cell.
   *
   * Carried as LEVELS rather than one speed, because the height that matters
   * is the one being flown and that is decided elsewhere. Interpolating here
   * would be a second answer to a question src/core/windProfile.ts already
   * answers for the readout, and two answers to one question is the shape of
   * most of this app's history.
   */
  wind: LevelWind[]
}
