/**
 * A SHORT NAME FOR THE OPTIC, FOR THE MAP PLATE.
 *
 * WHAT WAS REPORTED. "The map badges say '28' with no body attached. 28 on
 * what? A focal length with no camera is the same ambiguity that let the Sigma
 * stand in for my drone in the first place."
 *
 * The plate had room for a number and nothing else, which is why it only ever
 * carried one. A full name does not fit: "Sigma 28-75 f2.8" beside six markers
 * is the overlapping-paragraph problem that got the warning text cut down in
 * the first place, and scripts/audit-labels.mjs would start failing on it.
 *
 * So the name is shortened, by DROPPING WHAT THE PLATE ALREADY SAYS. The plate
 * carries the focal length, so the focal length comes out of the name: "Sigma
 * 28-75 f2.8" at 28mm becomes "SIGMA 28", and "Air 3S wide" at 24mm becomes
 * "AIR 3S 24". Nothing is invented and nothing that distinguishes two optics is
 * thrown away, because the focal length does the distinguishing: the two Sigmas
 * are 28 and 30, and the aircraft's two cameras are 24 and 70.
 *
 * DERIVED RATHER THAN A FIELD IN THE KIT, because a `shortName` on every lens
 * would have to be filled in by anybody adding their own gear, and the one
 * thing worse than a cryptic tag is a blank one.
 */

/** A focal length or an aperture, written the way lens names write them. */
const SPEC = /\b(f\/?\d+(\.\d+)?|\d+(\.\d+)?-\d+(\.\d+)?(mm)?|\d+(\.\d+)?mm)\b/i

/** How much of the plate the name may take before it crowds the next marker. */
export const OPTIC_TAG_MAX = 7

/**
 * The optic's name, cut to what fits beside a focal length.
 *
 * Everything before the first focal length or aperture in the name; failing
 * that, the first two words, which is what carries a name like "Air 3S wide"
 * whose distinguishing word is the focal length the plate is already showing.
 */
export function opticTag(name: string): string {
  const trimmed = name.trim()
  if (trimmed === '') return ''

  const spec = SPEC.exec(trimmed)
  const head =
    spec !== null && spec.index > 0
      ? trimmed.slice(0, spec.index)
      : trimmed.split(/\s+/).slice(0, 2).join(' ')

  return head.trim().toUpperCase().slice(0, OPTIC_TAG_MAX)
}
