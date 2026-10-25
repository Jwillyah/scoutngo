/*
 * THE AIRSPACE OVERLAY'S DATA, loaded the first time the layer is switched on.
 *
 * Returns a function from a view to its geometry, so the map can redraw on
 * every pan without reloading or re-decoding anything. All three sources are
 * baked into the bundle: nothing about the view is sent anywhere.
 */
import { airspaceLayer, type AirspaceLayer, type ViewBox } from '../core/airspaceLayer.ts'
import { airspaceShapes } from './airspace.ts'
import { restrictions } from './restrictions.ts'
import { facilityCellAt, facilityGrid } from './uasfm.ts'

export type AirspaceOverlay = (view: ViewBox) => AirspaceLayer

export async function loadAirspaceOverlay(): Promise<AirspaceOverlay> {
  const [classShapes, closed] = await Promise.all([airspaceShapes(), restrictions()])
  const cellsPerDegree = facilityGrid().cellsPerDegree
  return (view) =>
    airspaceLayer({
      view,
      classShapes,
      specialUse: closed.specialUse,
      parks: closed.parks,
      ceilingAt: (lat, lon) => facilityCellAt(lat, lon)?.ceilingFeet ?? null,
      cellsPerDegree,
    })
}
