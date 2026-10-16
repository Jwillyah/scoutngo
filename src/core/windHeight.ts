import { DEFAULT_ALTITUDE_FEET } from './air.ts'
import type { PlatformFilter } from './platformFilter.ts'

/**
 * WHAT HEIGHT TO READ THE WIND AT.
 *
 * WHAT WAS REPORTED. "Yesterday the panel read WIND AT THE GROUND, 10 M
 * because I had no air position placed. Correct behaviour, wrong default. If
 * the shoot is set to Drone, show wind at a sensible flight height and say
 * which. The ground number is the one every other app already gives me."
 *
 * THE OLD RULE was one question: is anything in the air yet. That is the right
 * question once a plan exists and the wrong one before it does, which is
 * exactly when the wind decides whether to drive out at all. A shooter who has
 * tapped Drone has said what the day is; waiting for them to place a position
 * before answering the question they came to ask is the app being literal
 * rather than useful.
 *
 * THREE ANSWERS, AND THE SCREEN SAYS WHICH IT GAVE:
 *
 *   'position'       the highest air position in the plan. The one the wind
 *                    limits first, and a real number from a real decision.
 *   'drone-default'  no air positions, but the shoot is set to Drone. A stated
 *                    assumption at the default altitude, labelled as an
 *                    assumption so it is never mistaken for a plan.
 *   'ground'         neither. Ten metres, said plainly.
 *
 * THE DEFAULT IS NOT INVENTED. It is DEFAULT_ALTITUDE_FEET, the same height a
 * new air position starts at, so the number the panel assumes and the number
 * the app would actually give you are the same number.
 */
export type WindHeightSource = 'position' | 'drone-default' | 'ground'

export interface WindHeight {
  /** Feet above ground, or null at ground level. */
  feet: number | null
  source: WindHeightSource
}

/** Ten metres: what every weather service serves and what 'ground' means here. */
export const GROUND_WIND_METERS = 10

export function windHeightFor(
  /** Altitudes of the air positions in the plan, in feet. */
  airFeet: readonly number[],
  /** What the Ground/Drone/Both choice is set to. */
  platformFilter: PlatformFilter,
): WindHeight {
  if (airFeet.length > 0) {
    return { feet: Math.max(...airFeet), source: 'position' }
  }
  /*
   * ONLY ON 'air'. On 'both' the shoot has not committed to flying, and
   * assuming a flight height there would put a 200 ft wind in front of
   * somebody who is shooting a wedding from the lawn.
   */
  if (platformFilter === 'air') {
    return { feet: DEFAULT_ALTITUDE_FEET, source: 'drone-default' }
  }
  return { feet: null, source: 'ground' }
}

/** How the panel says which of the three it is reading. */
export function windHeightLabel(height: WindHeight): string {
  if (height.source === 'ground') return `at the ground, ${GROUND_WIND_METERS} m`
  if (height.source === 'drone-default') {
    return `at ${Math.round(height.feet ?? 0)} ft, assumed`
  }
  return `at ${Math.round(height.feet ?? 0)} ft`
}

/** The sentence under it when the height is an assumption rather than a plan. */
export function windHeightNote(height: WindHeight): string | null {
  if (height.source !== 'drone-default') return null
  return `No air position placed yet, so this reads at the default ${Math.round(
    height.feet ?? 0,
  )} ft. Place one and it follows the highest.`
}
