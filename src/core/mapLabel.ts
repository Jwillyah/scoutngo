import { opticTag } from './opticTag.ts'

/**
 * WHAT A MAP PLATE SAYS, GIVEN WHAT EVERY OTHER PLATE SAYS.
 *
 * WHAT WAS REPORTED. "Six positions, six labels reading SIGMA 40, SIGMA 50,
 * SIGMA 55, SIGMA 65, SIGMA 70, SIGMA 75. The word SIGMA is on all six, so it
 * carries no information and six copies of it is just noise over the map."
 *
 * THE RULE, stated as the shooter stated it: a label repeats nothing that
 * every other label also says.
 *
 * It is worth seeing why this is not a contradiction of the change that put
 * the optic there in the first place. That change answered "28 on what?",
 * which was a real ambiguity: a focal length alone does not say whether the
 * geometry under it was drawn for a lens in a hand or a camera on an aircraft.
 * The ambiguity is between DIFFERENT optics. When every position on the map is
 * on the same one, there is nothing to be ambiguous between, and the word that
 * resolved the ambiguity becomes six copies of a constant.
 *
 * So the plate carries the optic exactly when it distinguishes something, and
 * the plan says the optic once, elsewhere, when it does not. Neither version
 * leaves the question unanswered; they answer it in the cheaper place.
 */
export interface PlateLabel {
  /** The short optic tag, or null when every plate would carry the same one. */
  tag: string | null
  focalLength: number
}

/**
 * The plates for a set of positions.
 *
 * Takes the WHOLE SET because the rule cannot be evaluated one at a time: what
 * one plate should say depends on what the others say. A per-position function
 * would have to guess, and guessing is how it ended up printing SIGMA six
 * times.
 */
export function plateLabels(
  positions: readonly { opticName: string; focalLength: number }[],
): PlateLabel[] {
  const tags = positions.map((p) => opticTag(p.opticName))
  const distinct = new Set(tags)
  /*
   * ONE DISTINCT TAG MEANS IT SAYS NOTHING. Two or more and every plate keeps
   * its own, including the ones that share: dropping only the duplicates would
   * leave a map where the presence of a word is itself a code.
   */
  const carries = distinct.size > 1

  return positions.map((p, i) => ({
    tag: carries ? tags[i] : null,
    focalLength: p.focalLength,
  }))
}

/**
 * The optic to say ONCE, elsewhere, when every position shares it.
 *
 * Null when they do not share one, because then every plate is already saying
 * it and a summary would be the repetition this exists to remove.
 */
export function sharedOptic(
  positions: readonly { opticName: string }[],
): string | null {
  if (positions.length === 0) return null
  const names = new Set(positions.map((p) => p.opticName))
  if (names.size !== 1) return null
  /*
   * The FULL name here, not the tag. The plate is short because it is on the
   * map; this line has room, and "Sigma 28-75 f2.8" is the answer to "on
   * what" in a way that "SIGMA" is only shorthand for.
   */
  return positions[0].opticName
}
