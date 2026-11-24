/*
 * THE SPOT SEARCH IS A MODAL OF THE SCREEN IT WAS OPENED OVER (Batch SIMPLE-3,
 * Section 0.4; field: "Back sometimes lands on Find a spot").
 *
 * It was one boolean in App, true until its own × or a pick cleared it, and
 * while it was true the home under it was not drawn. Any way of leaving that
 * screen other than those two (a page opening over the home, the home closed
 * for the map, a Back that brought the home back) left the boolean true, and
 * the next Back to that screen found the search sitting on it.
 *
 * Now the open search carries the screen it was opened over (a signature of
 * which surfaces are up) and is shown only while that same screen is: leave
 * the screen any way at all and it is gone, so no Back can land on it. It
 * never enters the browser's history either (no pushState): the phone's Back
 * goes where it went before, and a Back that does arrive (a popstate) closes
 * it. tests/spotPick.test.ts walks every back path through these.
 */
export interface SpotPick {
  /** The surfaces that were up when it was opened (spotSurface). */
  over: string
}

/** Which surfaces are up, as one string: the home and every page that opens over it or the map. */
export function spotSurface(up: Record<string, boolean>): string {
  return Object.keys(up)
    .sort()
    .map((k) => `${k}:${up[k] ? 1 : 0}`)
    .join(',')
}

export const openSpotPick = (surface: string): SpotPick => ({ over: surface })

/** Shown only over the very screen it was opened on. */
export function spotPickShown(pick: SpotPick | null, surface: string): boolean {
  return pick !== null && pick.over === surface
}

/** After any change of screen: the search stays only if its screen is still the one up; once gone, it is gone (a Back to that screen does not bring it back). */
export function followSurface(pick: SpotPick | null, surface: string): SpotPick | null {
  return spotPickShown(pick, surface) ? pick : null
}
