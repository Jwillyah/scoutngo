/*
 * EVERYTHING THE APP HOLDS ABOUT THE AIR OVER ONE POINT, for the card.
 *
 * Three baked sources, read on the phone: the class airspace extract, the
 * facility map grid, and the restricted, prohibited and park shapes. The point
 * is used as an index into data already in the bundle and never sent.
 */
import type { AirspaceAtPoint } from '../core/airspaceCard.ts'
import type { LatLon } from '../core/geo.ts'
import { parkUnitsAt, specialUseAt } from '../core/restrictions.ts'
import { airspaceAnswer } from './airspace.ts'
import { restrictions } from './restrictions.ts'
import { facilityCellAt } from './uasfm.ts'

export async function airspaceAtPoint(at: LatLon, droneFeet: number): Promise<AirspaceAtPoint> {
  const [answer, closed] = await Promise.all([airspaceAnswer(at), restrictions()])
  return {
    classes: answer.hits.map((hit) => hit.cls),
    gridCeilingFeet: facilityCellAt(at.lat, at.lon)?.ceilingFeet ?? null,
    specialUse: specialUseAt(closed.specialUse, at),
    parks: parkUnitsAt(closed.parks, at),
    droneFeet,
  }
}
