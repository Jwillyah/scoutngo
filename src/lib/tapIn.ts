/*
 * THE TAP-IN PAGE'S RULES, as plain functions (Batch SIMPLE-2, Section 1;
 * src/components/TapInPage.tsx draws with them, tests/tapIn tests read them).
 */
/** The rows card's cap. A sixth row is a second page's worth: it goes behind More details. */
export const MAX_ROWS = 5
/** A swipe is at least this far across and at least twice as far across as down. */
export const SWIPE_MIN_PX = 56

export interface TapInTab {
  id: string
  label: string
}

/** The tab a page opens on: `initial` when it names one of the tabs, else the first; '' for a page with none. */
export function openTab(tabs: readonly TapInTab[] | undefined, initial: string | undefined): string {
  if (tabs === undefined || tabs.length === 0) return ''
  return initial !== undefined && tabs.some((t) => t.id === initial) ? initial : tabs[0].id
}

/** The tab a swipe of (dx, dy) px moves to from `current`: null for a swipe too short, too slanted (that is the scroll), or at the last tab. A swipe left goes to the next tab. */
export function swipeTarget(tabs: readonly TapInTab[] | undefined, current: string, dx: number, dy: number): string | null {
  if (tabs === undefined || tabs.length < 2) return null
  if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < 2 * Math.abs(dy)) return null
  const i = tabs.findIndex((t) => t.id === current)
  if (i < 0) return null
  return tabs[i + (dx < 0 ? 1 : -1)]?.id ?? null
}

/** The rows the card shows: the first `max`; the rest are the page's More details. */
export const capRows = <T,>(rows: readonly T[], max: number = MAX_ROWS): T[] => rows.slice(0, max)

