/**
 * IS THAT TREE LIKELY TO HAVE LEAVES ON IT ON THE DAY.
 *
 * "A building blocks year round, an oak blocks in July and not in January."
 *
 * BROAD AND HONEST, NOT A LEAF-OUT MODEL. Asked for in those words, and it is
 * the right call for a reason worth writing down: real leaf-out varies by
 * species, by latitude, by elevation, by that particular spring, and by the
 * individual tree. A model that answered "leaf-out 11 April" would be precise
 * and frequently wrong, and the shooter would have no way to tell which times.
 *
 * So there are THREE answers and one of them is "it depends on the year". The
 * shoulder months are named as shoulders rather than forced into a side,
 * because mid-April in Virginia genuinely goes either way and saying so is the
 * useful thing. "I judge" was the brief, and this gives something to judge
 * with rather than something to believe.
 *
 * NORTHERN AND SOUTHERN HEMISPHERES, by shifting six months. Nothing here is
 * tuned to one place: the bands are the broad temperate pattern, and the
 * wording never claims more than that.
 *
 * THE TROPICS ARE NOT GUESSED AT. Inside about 23 degrees of the equator the
 * temperate leaf cycle does not apply, dry-season deciduousness runs on
 * rainfall rather than daylength, and this module has no rainfall. It says it
 * does not know, which is the honest answer and is better than a confident
 * northern-hemisphere guess applied to Panama.
 */

export type LeafState = 'bare' | 'in-leaf' | 'turning' | 'unknown'

/** Beyond this far from the equator the temperate pattern is a fair broad guide. */
export const TEMPERATE_MIN_LATITUDE = 23.5

export const LEAF_COPY: Record<LeafState, string> = {
  bare: 'likely bare in your window',
  'in-leaf': 'likely in leaf',
  turning: 'could go either way at this time of year',
  unknown: 'leaf state not known at this latitude',
}

/**
 * The month bands, northern hemisphere, as month numbers 1..12.
 *
 * December to February is winter bare. May to September is full canopy. March,
 * April, October and November are the shoulders, where it depends on the year.
 * Deliberately wide shoulders: a wrong "bare" in late April is a tree the
 * shooter did not plan around.
 */
function northernState(month: number): LeafState {
  if (month === 12 || month <= 2) return 'bare'
  if (month >= 5 && month <= 9) return 'in-leaf'
  return 'turning'
}

/**
 * Whether a deciduous obstruction is likely to be carrying leaves on this date.
 *
 * Takes the date as a yyyy-mm-dd string, which is what the venue draft holds,
 * and reads the month from the string rather than through a Date, so the
 * device's timezone cannot shift the answer across a month boundary.
 */
export function leafState(isoDate: string, latitudeDegrees: number): LeafState {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim())
  if (match === null) return 'unknown'
  const month = Number(match[2])
  if (month < 1 || month > 12) return 'unknown'

  if (Math.abs(latitudeDegrees) < TEMPERATE_MIN_LATITUDE) return 'unknown'

  /* Six months out of phase below the equator, which is the whole difference. */
  const shifted = latitudeDegrees < 0 ? ((month + 5) % 12) + 1 : month
  return northernState(shifted)
}

/**
 * Whether to treat a deciduous obstruction as blocking.
 *
 * ANYTHING BUT 'bare' BLOCKS. A shoulder month is not a reason to delete a
 * tree from the geometry: the tree is still there, the leaves might be, and
 * the honest default when it could go either way is to show the obstruction
 * and say which way it could go. The alternative, treating 'turning' as clear,
 * is the app making the optimistic choice on the shooter's behalf about the
 * one thing it told them it cannot know.
 */
export function blocksOn(foliage: 'solid' | 'deciduous', state: LeafState): boolean {
  return foliage === 'solid' || state !== 'bare'
}
