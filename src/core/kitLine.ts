/*
 * WHAT IS COMING, IN ONE LINE, FOR THE SETUP SUMMARY.
 *
 * WHAT WAS WRONG. The line was built from the PLAN's shared optic, which is
 * right once there is a plan and says nothing at all before there is one. In
 * Setup, which is where this line lives, there is usually no plan yet: so a
 * ground shoot showed the lens only after positions existed, and a drone
 * shoot showed the lens the shooter was not using, or nothing.
 *
 * AND THE DRONE CASE WAS WRONG EVEN WITH A PLAN. On a drone shoot the answer
 * is the AIRCRAFT and the camera it carries, because that pair is what decides
 * every frame: the camera's focal length is fixed, so naming a lens there is
 * naming a thing that is staying in the bag.
 *
 * SO IT IS BUILT FROM THE PACKED KIT instead, which exists from the first
 * launch, and it answers per platform:
 *
 *   ground   the lens, or how many lenses when there is more than one
 *   air      the aircraft and its camera's focal length
 *   both     the aircraft first, because that is the thing with a ceiling
 *
 * NULL WHEN THE KIT IS EMPTY. Not "no kit": the chips are right there and a
 * line telling somebody their bag is empty is a line telling them what they
 * can already see.
 */

import type { KitProfile } from './kit.ts'
import type { PlatformFilter } from './platformFilter.ts'

export interface PackedKit {
  bodyIds: readonly string[]
  lensIds: readonly string[]
  droneIds: readonly string[]
}

/** The aircraft and the glass it flies with, named the way the spec sheet does. */
function airLine(profile: KitProfile, packed: PackedKit): string | null {
  const drones = profile.drones.filter((d) => packed.droneIds.includes(d.id))
  if (drones.length === 0) return null

  if (drones.length > 1) {
    /*
     * More than one aircraft is a real answer and not worth expanding: the
     * cameras differ, so naming one focal length would be naming it for the
     * wrong aircraft. The count is honest and the cards carry the detail.
     */
    return `${drones.length} aircraft`
  }

  const drone = drones[0]
  const camera = drone.cameras[0]
  if (camera === undefined) return drone.name
  /*
   * THE 35MM EQUIVALENT, because that is the number that means something
   * across sensors and the only focal length this camera has. It is the same
   * figure the position cards print.
   */
  return `${drone.name} · ${Math.round(camera.equiv35)}mm`
}

/** The glass, named. */
function groundLine(profile: KitProfile, packed: PackedKit): string | null {
  const lenses = profile.lenses.filter((l) => packed.lensIds.includes(l.id))
  if (lenses.length === 0) return null
  if (lenses.length === 1) return lenses[0].name
  return `${lenses.length} lenses`
}

export function kitLine(
  profile: KitProfile,
  packed: PackedKit,
  platform: PlatformFilter,
): string | null {
  const air = airLine(profile, packed)
  const ground = groundLine(profile, packed)

  switch (platform) {
    case 'air':
      /*
       * AIR MEANS AIR. Falling back to the lens here is what produced the
       * reported line: a Sigma named on a drone shoot. If there is no aircraft
       * packed, the honest answer is nothing, and the chips say so better than
       * a sentence could.
       */
      return air
    case 'ground':
      return ground
    case 'both':
      /*
       * THE AIRCRAFT LEADS, same reason the kit row does: it is the thing with
       * a ceiling, a wind limit and paperwork attached, and the one whose
       * absence changes the day.
       */
      if (air !== null && ground !== null) return `${air} · ${ground}`
      return air ?? ground
  }
}
