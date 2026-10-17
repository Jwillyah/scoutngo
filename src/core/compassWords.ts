/*
 * A BEARING, IN WORDS.
 *
 * "Look west-southwest" is something you can do at a windscreen. "Look 254.1°"
 * is something you can do with a compass app and thirty seconds you do not
 * have. The degrees are not wrong, they are just the receipt: they belong in
 * the planner, where there is a map to check them against.
 *
 * SEPARATE FROM compassPoint() IN field.ts, which answers the abbreviation
 * ("WSW") for a readout beside a number. This answers the spoken form, for a
 * sentence with no number in it at all. Both read the same 16-point table, so
 * they cannot disagree about which way WSW is.
 */

import { normalizeBearing } from './sun.ts'

/**
 * The 16 points, spoken.
 *
 * Hyphenated the way they are said: "west-southwest", not "west south west".
 * Sixteen rather than eight because eight is 45° wide, and at these latitudes
 * the difference between west and west-southwest is most of the difference
 * between the sun over the water and the sun behind a treeline.
 */
const SPOKEN = [
  'north',
  'north-northeast',
  'northeast',
  'east-northeast',
  'east',
  'east-southeast',
  'southeast',
  'south-southeast',
  'south',
  'south-southwest',
  'southwest',
  'west-southwest',
  'west',
  'west-northwest',
  'northwest',
  'north-northwest',
] as const

export type CompassWord = (typeof SPOKEN)[number]

/** The spoken 16-point name for a bearing. */
export function compassWord(bearing: number): CompassWord {
  if (!Number.isFinite(bearing)) return 'north'
  return SPOKEN[Math.round(normalizeBearing(bearing) / 22.5) % 16]
}

/**
 * "Look west-southwest."
 *
 * A whole sentence rather than a fragment, because this is read aloud in the
 * head at a junction and a bare compass word reads as a label.
 */
export function lookSentence(bearing: number): string {
  return `Look ${compassWord(bearing)}.`
}
