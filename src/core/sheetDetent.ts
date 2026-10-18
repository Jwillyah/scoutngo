/*
 * THE SHEET'S THREE DETENTS, as data.
 *
 * In its own file because BottomSheet.tsx exports components and the audit
 * and the sheet both need the list. Not in src/core/ as geometry: this is a
 * UI vocabulary, and nothing here computes anything about the world.
 */
export type SheetDetent = 'peek' | 'half' | 'full'

export const SHEET_DETENTS: readonly SheetDetent[] = ['peek', 'half', 'full'] as const

/** Index, so "raise, never lower" is expressible as a comparison. */
export function detentRank(detent: SheetDetent): number {
  return SHEET_DETENTS.indexOf(detent)
}

/**
 * RAISE, NEVER LOWER.
 *
 * The single rule every programmatic detent change goes through, so there is
 * one place to read it and one place it could ever be wrong. A card or a
 * section at PEEK is content nobody can read, so opening one lifts a peeking
 * sheet; a shooter who has already set HALF or FULL keeps what they set.
 */
export function raisedTo(current: SheetDetent, wanted: SheetDetent): SheetDetent {
  return detentRank(wanted) > detentRank(current) ? wanted : current
}
