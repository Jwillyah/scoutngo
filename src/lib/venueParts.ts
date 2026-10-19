/*
 * THE PART OF THE VENUE LINE THE SHORT NAME LEFT BEHIND.
 *
 * "Brew River Dock Bar, Salisbury MD" does not fit in the venue bar beside a
 * date and an avatar, and what it did instead of not fitting was ellipsise in
 * the middle of the town: "Brew River Dock Bar, Salisbury M…". So the bar
 * takes the name and the shoot card takes the town.
 *
 * DERIVED FROM CORE'S ANSWER, NOT FROM A SECOND SPLIT.
 *
 * core/venueName.ts already decides where the name ends -- everything before
 * the first comma -- and that decision has a test and a reason. Writing
 * `full.split(',').slice(1)` here would be a SECOND definition of the same
 * boundary, and the day somebody teaches core to handle "Sandbridge Beach,
 * Virginia Beach, VA" the two would disagree about which half the second
 * comma belongs to. This takes whatever core did not take, so there is one
 * boundary and this is its remainder.
 *
 * NOT IN src/core/ because it is about what fits on a screen, which is not a
 * fact about a venue.
 */
export function venueTown(full: string, short: string): string | null {
  if (!full.startsWith(short)) return null
  const rest = full.slice(short.length).replace(/^\s*,\s*/, '').trim()
  return rest === '' ? null : rest
}
