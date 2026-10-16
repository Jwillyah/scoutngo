/**
 * HOW OLD THE GROUND VIEW IS, AND WHETHER THAT MATTERS.
 *
 * WHAT WAS REPORTED. "Yesterday's pane said 2018 on a shot where trees were
 * the problem. Eight years of growth is the difference between the view I
 * planned and the one I got. Today's said 2026, which is fine, so the number
 * is there; it just needs to carry weight when it is old."
 *
 * THE NUMBER WAS ALWAYS THERE AND ALWAYS LOOKED THE SAME. A quiet grey "2018"
 * in the corner and a quiet grey "2026" in the corner are the same thing on
 * screen, which means the one that matters is invisible exactly when it
 * matters. So age becomes a band, and the band changes the treatment.
 *
 * WHY THESE BOUNDARIES. They are about what CHANGES on a site, not about
 * precision:
 *
 *   under 3 years   the picture is broadly what you will find. Quiet.
 *   3 to 7 years    a tree is noticeably bigger and a building may have gone
 *                   up. Worth a glance, so it is stated rather than tucked away.
 *   over 7 years    the reported case. Scrub becomes canopy, car parks become
 *                   buildings, and planning a sightline off it is planning off
 *                   a different place. Loud.
 *
 * NOTHING HERE SAYS THE VIEW IS WRONG. It says how old it is and what tends to
 * change in that time. The imagery is not a claim about today and the app does
 * not turn it into one in either direction.
 */

export type ImageryAge = 'current' | 'ageing' | 'old' | 'unknown'

export const AGEING_YEARS = 3
export const OLD_YEARS = 7

/** Google give "YYYY-MM". The year is the part that matters and the part shown. */
export function imageryYear(date: string | undefined | null): number | null {
  if (typeof date !== 'string') return null
  const year = Number(date.slice(0, 4))
  if (!Number.isInteger(year)) return null
  /* A year outside the life of street imagery is a parse failure, not a date. */
  if (year < 2000 || year > 2100) return null
  return year
}

export function imageryAge(
  imageYear: number | null,
  /** The year of the shoot, so the gap is to the day being planned. */
  shootYear: number,
): ImageryAge {
  if (imageYear === null) return 'unknown'
  const years = shootYear - imageYear
  /* Imagery dated after the shoot is not older than it. */
  if (years < AGEING_YEARS) return 'current'
  if (years < OLD_YEARS) return 'ageing'
  return 'old'
}

/** How many years old, or null when the date did not parse. */
export function imageryYearsOld(imageYear: number | null, shootYear: number): number | null {
  return imageYear === null ? null : Math.max(0, shootYear - imageYear)
}

/**
 * What to say about it, or null when there is nothing worth saying.
 *
 * Null for 'current', deliberately: a line on every card saying the picture is
 * recent is the wallpaper problem again, and the year is still in the corner
 * for anyone who wants it.
 */
export function imageryNote(age: ImageryAge, years: number | null): string | null {
  if (age === 'current' || age === 'unknown' || years === null) return null
  if (age === 'ageing') {
    return `This view is ${years} years old. Trees grow and buildings go up; check anything you are planning a sightline past.`
  }
  return `This view is ${years} years old. Scrub becomes canopy and car parks become buildings in that time, so treat it as the shape of the place rather than what is there now.`
}
