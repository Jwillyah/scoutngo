/*
 * WHAT A WIND COMPASS SAYS (Batch SIMPLE-1, Section 1). A compass with no
 * arrow and no word is an empty circle: it said nothing, and a pilot cannot
 * tell calm from "the forecast did not say". Three states, each with its
 * picture (src/components/DroneNow.tsx DroneCompass, Home.tsx WindDial):
 *
 *   calm    "Calm": the app's own rule (src/core/markerWind.ts isCalm, under
 *           3 kt, which has no direction), or a speed that rounds to 0 in the
 *           unit shown
 *   arrow   a direction, and the wind is not calm
 *   none    no direction and not calm: a dash, and "no direction" for a
 *           screen reader
 *
 * (The Wind page's dial geometry is src/core/windDial.ts; this is the reading.)
 */
import { isCalm } from './markerWind.ts'

export type DialRead = 'calm' | 'arrow' | 'none'

/** `mps` the speed the compass sits beside; `shownRounded` that speed in the pilot's unit, rounded, as the screen prints it. */
export function dialRead(mps: number | null, shownRounded: number | null, fromDeg: number | null): DialRead {
  if (mps !== null && (isCalm(mps) || shownRounded === 0)) return 'calm'
  return fromDeg === null ? 'none' : 'arrow'
}
