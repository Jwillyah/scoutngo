import { selectedDroneCameras, type KitProfile } from './kit.ts'
import type { Platform } from './platformFilter.ts'

/**
 * WHAT A POSITION ON THIS PLATFORM CAN ACTUALLY SHOOT WITH.
 *
 * THE BUG THIS EXISTS TO END. An air position holds a drone camera id, but the
 * lens picker on the card listed `kit.lenses` whatever the platform was. A
 * `<select>` whose value matches none of its options displays the FIRST one, so
 * an Air 3S position at 24mm read "Sigma 28-75 f2.8" on screen, and touching
 * that select wrote a ground lens id onto an aircraft. Measured in the browser
 * before the fix, on a position that was genuinely air:
 *
 *   ADD BUTTON LABEL     "Add air position"
 *   map badge            24·200ft          (the real camera, the real focal)
 *   LENS PICKER OFFERS   Sigma 28-75 f2.8, Sigma 30mm, Sony 75-300,
 *                        Sony 200-600, Sony 10-18 f4
 *
 * Five pieces of glass, none of which fits on a Mavic.
 *
 * HIDING THE WRONG OPTIC IS NOT THE FIX. The same mistake would come back the
 * next time something built an optic list of its own. So the platform decides
 * what the set IS, here, once, and both the picker and the writer go through
 * it: `opticsFor` is the only place a list of optics is built, and `setOptic`
 * refuses an id this platform cannot carry. There is no arrangement of taps
 * that puts the 200-600 on an aircraft, the way there is no arrangement of taps
 * that gets a camera bearing out of a 360.
 *
 * ONE SHAPE FOR BOTH. A drone camera is a prime: DJI publish one 35mm
 * equivalent per camera and the aircraft has no other focal length, so min and
 * max are the same number and the focal field has nothing to slide. See the
 * Air 3S note in kit.ts.
 */
export interface OpticChoice {
  id: string
  name: string
  kind: 'lens' | 'drone'
  minFocalLength: number
  maxFocalLength: number
}

/**
 * Which of the kit is in play for this shoot.
 *
 * Structural rather than an import of lib/kitSelection's KitSelection, because
 * core does not depend on lib. KitSelection satisfies it.
 */
export interface OpticSelection {
  lensIds: readonly string[]
  droneIds: readonly string[]
}

const lensChoice = (lens: KitProfile['lenses'][number]): OpticChoice => ({
  id: lens.id,
  name: lens.name,
  kind: 'lens',
  minFocalLength: lens.minFocalLength,
  maxFocalLength: lens.maxFocalLength,
})

const cameraChoice = (camera: KitProfile['drones'][number]['cameras'][number]): OpticChoice => ({
  id: camera.id,
  name: camera.name,
  kind: 'drone',
  minFocalLength: camera.equiv35,
  maxFocalLength: camera.equiv35,
})

/**
 * EVERY optic this platform could carry, selected for the shoot or not.
 *
 * The membership test. `opticsFor` is what a picker shows; this is what the
 * platform is physically capable of, and the two differ because the kit screen
 * can deselect a lens that is still on a position from earlier in the plan.
 */
export function platformOptics(platform: Platform, kit: KitProfile): OpticChoice[] {
  return platform === 'air'
    ? kit.drones.flatMap((drone) => drone.cameras.map(cameraChoice))
    : kit.lenses.map(lensChoice)
}

/** Whether this platform can carry this optic at all. The gate setOptic uses. */
export function opticFitsPlatform(platform: Platform, kit: KitProfile, opticId: string): boolean {
  return platformOptics(platform, kit).some((optic) => optic.id === opticId)
}

/**
 * The optics to offer on a position: the selected ones for its platform.
 *
 * `currentId` is the optic the position is holding. If it is a real optic for
 * this platform but is not in the shoot's selection, it is included anyway, so
 * that the picker's value is ALWAYS one of its options. That is the invariant
 * whose absence caused the bug: a select displaying an option it does not hold
 * is a lie about the position, and the next change event acts on the lie.
 *
 * An id that does not fit the platform is NOT included. Nothing on screen will
 * then claim an aircraft is carrying it.
 */
export function opticsFor(
  platform: Platform,
  kit: KitProfile,
  selection: OpticSelection,
  currentId?: string,
): OpticChoice[] {
  const offered = selectedOptics(platform, kit, selection)
  const current =
    currentId === undefined
      ? undefined
      : platformOptics(platform, kit).find((optic) => optic.id === currentId)

  if (current === undefined) return offered
  return offered.some((optic) => optic.id === current.id) ? offered : [current, ...offered]
}

/**
 * The optics the shoot's kit selection puts in play for this platform.
 *
 * A DRONE IS SELECTED BY AIRCRAFT, NOT BY CAMERA. droneIds holds aircraft ids
 * and the cameras hang off those, so the air side goes through
 * selectedDroneCameras rather than testing camera ids against droneIds, which
 * would match nothing and offer an empty picker.
 */
function selectedOptics(
  platform: Platform,
  kit: KitProfile,
  selection: OpticSelection,
): OpticChoice[] {
  return platform === 'air'
    ? selectedDroneCameras(kit, [...selection.droneIds]).map(cameraChoice)
    : kit.lenses.filter((lens) => selection.lensIds.includes(lens.id)).map(lensChoice)
}

/** The optic a new position on this platform starts on, or null if it has none. */
export function defaultOpticFor(
  platform: Platform,
  kit: KitProfile,
  selection: OpticSelection,
): OpticChoice | null {
  return opticsFor(platform, kit, selection)[0] ?? null
}

/**
 * The focal length to keep when the optic changes.
 *
 * Held where the new optic allows it, so swapping the 28-75 for the 200-600 at
 * 50mm gives 200 rather than a 50mm the lens cannot produce. A drone camera
 * clamps to its one focal length by the same arithmetic, min and max being
 * equal.
 */
export function focalOn(optic: OpticChoice, focalLength: number): number {
  return Math.round(Math.min(optic.maxFocalLength, Math.max(optic.minFocalLength, focalLength)))
}
