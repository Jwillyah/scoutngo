import type { KitProfile } from './kit.ts'

/*
 * WHAT THE KIT PROFILE CAN DO, AND NOTHING ABOUT WHAT IS SELECTED.
 *
 * WHAT USED TO BE IN THIS FILE, AND WHY IT IS GONE.
 *
 * packForPlatform, KitHolds, holdToggle and packingLine implemented a rule
 * asked for in an earlier pass: "Drone packs the aircraft and unticks the
 * bodies and glass. Ground does the reverse." It was watched off the platform
 * filter, so changing what you wanted to SEE rewrote what you were carrying.
 *
 * IT MADE THE CONTROL ONE-WAY. Selecting GROUND removed the aircraft from the
 * selection; the AIR segment asked the selection whether a drone was
 * available, got no, and disabled itself -- with every kit chip in Setup
 * still ticked and the drone still in the bag. The only way back to AIR was
 * reloading the app.
 *
 * THE RULE THAT REPLACED IT, stated once and enforced by the surface audit:
 *
 *   THE KIT IS WHAT THE SHOOTER OWNS. THE FILTER IS WHAT THEY WANT TO SEE.
 *   A VIEW FILTER NEVER WRITES TO THE KIT.
 *
 * GROUND hides air positions and air optics from the view -- visiblePlan and
 * opticsFor already do that by platform, at read time -- and the aircraft
 * stays where it was. The holds machinery went with it: it existed only to
 * stop the packing chip undoing a hand tick, and with nothing writing to the
 * selection but the shooter, every tick is a hand tick.
 *
 * This is shape D in docs/failure-modes.md, second instance.
 */

/**
 * Whether this profile has an aircraft that can carry a camera at all.
 *
 * ABOUT THE PROFILE, DELIBERATELY, which is the whole point of keeping it.
 * It used to be paired with droneAvailable(selection), and the AIR segment
 * used the selection one -- so any state that emptied the selection of drones
 * disabled the only control that could put them back. Owning a drone is a
 * fact about the bag, not about what is ticked this minute, so the segment
 * that switches to air asks this.
 */
export function canPackAir(profile: KitProfile): boolean {
  return profile.drones.some((drone) => drone.cameras.length > 0)
}
