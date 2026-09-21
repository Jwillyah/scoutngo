/*
 * Placeholder examples.
 *
 * These used to be one hardcoded example: a boat docking contest at Brew River.
 * That is the author's own shoot, and baking it into the product told every
 * other photographer that this tool is for someone else's work. The set below
 * spans weddings, surf, cars, product and music so that whatever someone shoots,
 * something here looks like it.
 *
 * Picked once per load rather than per keystroke: a placeholder that changes
 * while you are reading it is a distraction, not a hint.
 */

export const SHOOT_EXAMPLES = [
  'Wedding at the pier, Saturday 4 to 8pm, golden hour portraits',
  'Surf contest at First Street jetty, Sunday dawn to noon',
  'Car meet in a parking lot, Friday night, rolling shots and drone',
  'Product shoot on the beach, Tuesday morning, flat lays and lifestyle',
  'Concert at the amphitheatre, Saturday 7 to 11pm, crowd and stage',
] as const

/** Matched to the shoot examples: what a sent shot list actually looks like. */
export const SHOT_LIST_EXAMPLES = [
  'Ring exchange from the aisle\nFirst dance wide\nCouple walking the pier at sunset',
  'Barrel sections from the jetty\nHeat winner reaction\nLineup wide at dawn',
  'Rolling shot along the seafront\nEngine bay detail\nDrone top down of the rows',
  'Flat lay on wet sand\nModel holding the product\nWide lifestyle with the surf behind',
  'Stage wide from the sound desk\nSinger close from the pit\nCrowd from behind the stage',
] as const

/** A whole number in [0, count), used to keep the two sets in step. */
export function exampleIndex(count: number, random: number = Math.random()): number {
  if (count <= 0) return 0
  const index = Math.floor(random * count)
  // Math.random() can return values that floor to count only through rounding.
  return Math.min(count - 1, Math.max(0, index))
}
