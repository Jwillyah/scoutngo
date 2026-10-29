/*
 * WHO OWNS THE DRAG UNDER THE FINGER. One answer per touch, decided once.
 *
 * The sheet and what is in it (the time bar's ruler, the tide curve) all
 * listen to the same finger. Each used to decide for itself, from its own
 * events, and two of them could both decide yes: a scrub that also moved the
 * sheet. Now the first to claim a drag owns it until the finger lifts, and
 * the others ask before they act (src/core/sheetMotion.ts dragAxis is the
 * rule they all claim by).
 */
export type GestureOwner = 'sheet' | 'scrub'

let owner: GestureOwner | null = null

/** A finger came down: nobody owns it yet. */
export function startGesture(): void {
  owner = null
}

/** Claims the drag; false when someone else already has it. */
export function claimGesture(who: GestureOwner): boolean {
  if (owner !== null && owner !== who) return false
  owner = who
  return true
}

export function gestureOwner(): GestureOwner | null {
  return owner
}
