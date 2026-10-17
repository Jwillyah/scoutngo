/*
 * WHICH PATH THIS VENUE TAKES, AND HOW LONG THAT PATH TAKES.
 *
 * The facility map carries a ceiling per cell. The decision that actually
 * shapes a shoot day is not the ceiling, it is which process the ceiling puts
 * you in: minutes on a phone, ninety days of coordination, or a manual
 * application. This file turns a cell and an altitude into that answer.
 *
 * NOTHING HERE IS AN AUTHORIZATION. The FAA's own words are that these maps
 * do not grant approval and are informational only. So this returns the ROUTE
 * and the CEILING, and the wording layer states the rule and the computed
 * boundary. It never says a flight is cleared, compliant or permitted, and
 * laanc.test.ts fails on those words.
 *
 * THE THREE-BRANCH VERSION OF THIS WAS WRONG ON 22,213 CELLS.
 *
 * The obvious rule is ceiling at or above your altitude means auto-approval,
 * below means further coordination, zero means manual. It reads correctly and
 * it is wrong, because it assumes every facility offers LAANC at all. The
 * service publishes a per-facility field listing which routes are actually
 * enabled, and 22,213 cells carry a workable non-zero ceiling at a facility
 * with no Part 107 LAANC route whatsoever. The ceiling-only rule promises
 * those "auto-approval, minutes" when the real answer is a manual DroneZone
 * application. That is wrong in the one direction that costs a shoot: it
 * tells you the fast path exists when it does not.
 *
 * So the route gate is read from the data, not inferred from the ceiling.
 */

import type { FacilityCell } from './faaGrid.ts'

/** The Part 107 auto-approval route, as the FAA names it in the data. */
export const ROUTE_AUTO = '107-AA'
/** The Part 107 further-coordination route, as the FAA names it. */
export const ROUTE_FURTHER = '107-FC'

/**
 * Why a venue ends up on the manual path. Named rather than boolean because
 * the four reasons need four different sentences.
 */
export type ManualReason =
  /** The extract has no facility-map cell at this coordinate. */
  | 'outside-coverage'
  /** There is a cell and its ceiling is zero: no altitude is auto-approvable. */
  | 'ceiling-zero'
  /** Altitude fits the ceiling, but the facility has no auto-approval route. */
  | 'no-auto-route'
  /** Altitude exceeds the ceiling, and there is no further-coordination route. */
  | 'no-further-route'

/**
 * WHAT THE MAP SAYS ABOUT THIS COORDINATE AND THIS ALTITUDE.
 *
 * A union rather than a record with optional fields, so a caller cannot read a
 * ceiling off a result that has none. Outside coverage there is no cell, and
 * therefore no ceiling to print: the type makes that unprintable rather than
 * leaving a zero to be mistaken for a measured ground-level ceiling.
 */
export type LaancPath =
  | { route: 'auto-approval'; cell: FacilityCell; ceilingFeet: number; altitudeFeet: number }
  | { route: 'further-coordination'; cell: FacilityCell; ceilingFeet: number; altitudeFeet: number }
  | { route: 'manual'; reason: 'outside-coverage'; cell: null; altitudeFeet: number }
  | {
      route: 'manual'
      reason: Exclude<ManualReason, 'outside-coverage'>
      cell: FacilityCell
      ceilingFeet: number
      altitudeFeet: number
    }

function has(cell: FacilityCell, route: string): boolean {
  return cell.routes.includes(route)
}

/**
 * The decision.
 *
 * ALTITUDE AT OR BELOW THE CEILING IS THE AUTO-APPROVAL BAND, not strictly
 * below it. The published ceiling is the maximum altitude that can be
 * auto-approved, so an altitude equal to it is inside the band. Using a strict
 * comparison would push every round number at a 400ft cell onto the ninety-day
 * path, which is both wrong and the most common case there is.
 */
export function laancPath(
  cell: FacilityCell | null,
  altitudeFeet: number,
): LaancPath {
  const altitude = Number.isFinite(altitudeFeet) ? altitudeFeet : 0

  if (cell === null) {
    return { route: 'manual', reason: 'outside-coverage', cell: null, altitudeFeet: altitude }
  }

  const ceilingFeet = cell.ceilingFeet

  if (ceilingFeet <= 0) {
    return { route: 'manual', reason: 'ceiling-zero', cell, ceilingFeet, altitudeFeet: altitude }
  }

  if (altitude <= ceilingFeet) {
    return has(cell, ROUTE_AUTO)
      ? { route: 'auto-approval', cell, ceilingFeet, altitudeFeet: altitude }
      : { route: 'manual', reason: 'no-auto-route', cell, ceilingFeet, altitudeFeet: altitude }
  }

  return has(cell, ROUTE_FURTHER)
    ? { route: 'further-coordination', cell, ceilingFeet, altitudeFeet: altitude }
    : { route: 'manual', reason: 'no-further-route', cell, ceilingFeet, altitudeFeet: altitude }
}

/**
 * HOW LONG THE PATH TAKES, as the FAA describes each process rather than as a
 * promise about this particular request.
 *
 * "Usually" and "plan for" are doing real work in these strings. LAANC
 * auto-approval is near-instant when it succeeds, and further coordination is
 * published as a 90-day lead time; neither is a guarantee about one request,
 * and neither sentence claims to be.
 */
export const ROUTE_TIMING: Record<LaancPath['route'], string> = {
  'auto-approval': 'Usually minutes, through a LAANC supplier.',
  'further-coordination': 'Plan for 90 days. Further Coordination is not a fast path.',
  manual: 'Manual application through FAA DroneZone. Allow well over 90 days.',
}

/** The route's name, for a heading. */
export const ROUTE_LABEL: Record<LaancPath['route'], string> = {
  'auto-approval': 'LAANC auto-approval',
  'further-coordination': 'Further Coordination',
  manual: 'DroneZone application',
}

/**
 * WHY, IN ONE SENTENCE, stating the rule and the computed boundary.
 *
 * Each of these names the number it compared and the rule it applied. None of
 * them says the flight is fine, and none of them says the area is clear: the
 * sentence for outside-coverage is the one that would be easiest to write as
 * "no restrictions here", which is exactly the lie this app does not tell.
 */
export function laancWhy(path: LaancPath): string {
  switch (path.route) {
    case 'auto-approval':
      return (
        `The map's ceiling for this cell is ${path.ceilingFeet} ft AGL, and ${path.altitudeFeet} ft ` +
        `is at or under it. Requests at or under the ceiling go through the auto-approval route.`
      )
    case 'further-coordination':
      return (
        `The map's ceiling for this cell is ${path.ceilingFeet} ft AGL, and ${path.altitudeFeet} ft ` +
        `is above it. Above the ceiling the auto-approval route does not apply.`
      )
    case 'manual':
      switch (path.reason) {
        case 'outside-coverage':
          return (
            'This extract has no facility-map cell at this pin, so it carries no ceiling to ' +
            'compare against. That is an absence of data, not a statement about the airspace.'
          )
        case 'ceiling-zero':
          return (
            `The map's ceiling for this cell is 0 ft AGL. A zero ceiling means no altitude here ` +
            `is auto-approvable, whatever altitude is set.`
          )
        case 'no-auto-route':
          return (
            `The map's ceiling for this cell is ${path.ceilingFeet} ft AGL and ${path.altitudeFeet} ft ` +
            `is under it, but the FAA does not list a ${ROUTE_AUTO} route at this facility.`
          )
        case 'no-further-route':
          return (
            `The map's ceiling for this cell is ${path.ceilingFeet} ft AGL and ${path.altitudeFeet} ft ` +
            `is above it, and the FAA does not list a ${ROUTE_FURTHER} route at this facility.`
          )
      }
  }
}

/**
 * WHETHER 107.41 AUTHORIZATION IS IN PLAY AT ALL, from the classes the cell
 * carries.
 *
 * Returns the classes, not a verdict. A cell inside Class B, C, D or a
 * surface-area E lies in controlled airspace at the surface, which is the
 * condition 107.41 attaches authorization to. An EMPTY LIST IS NOT A CLEAR
 * SKY: it means this extract records no surface-area class for the cell, and
 * the wording layer says that rather than saying no authorization is needed.
 */
export function surfaceClasses(cell: FacilityCell | null): readonly string[] {
  return cell === null ? [] : cell.classes
}
