/*
 * The app is three modes on a time axis, not five parallel tabs.
 *
 * SETUP is done at home, PLAN is the work, FIELD is on the day. That order is
 * the whole point: the old five tab shell put Kit next to Shots as equals, when
 * one is configured a week before the other is used.
 *
 * Forward is a step and it is earned. FIELD cannot be entered until there is a
 * plan to walk to, which is what stops the rail reading as a channel selector.
 */

export type Mode = 'setup' | 'plan' | 'field'

export const MODES: { id: Mode; label: string; when: string }[] = [
  { id: 'setup', label: 'Setup', when: 'before the day' },
  { id: 'plan', label: 'Plan', when: 'the work' },
  { id: 'field', label: 'Field', when: 'on the day' },
]

export const modeIndex = (mode: Mode): number => MODES.findIndex((m) => m.id === mode)

export interface ModeAvailability {
  /** A venue with valid coordinates and a window. Without it nothing can be planned. */
  venueReady: boolean
  /** At least one generated position. Without it there is nothing to walk to. */
  hasPlan: boolean
}

/** Why a mode cannot be entered yet, or null when it can. */
export function blockedReason(mode: Mode, available: ModeAvailability): string | null {
  if (mode === 'plan' && !available.venueReady) {
    return 'Set a venue, a date and a window first.'
  }
  if (mode === 'field' && !available.hasPlan) {
    return 'Generate a plan first. Field mode shows the positions you are walking to.'
  }
  return null
}

export const canEnter = (mode: Mode, available: ModeAvailability): boolean =>
  blockedReason(mode, available) === null

/** The next mode along, or null at the end of the line. */
export function nextMode(mode: Mode): Mode | null {
  const next = MODES[modeIndex(mode) + 1]
  return next?.id ?? null
}

/** What the forward button says. Phrased as finishing a step, not switching to one. */
export const FORWARD_LABEL: Record<Mode, string | null> = {
  setup: 'Setup done · Plan',
  plan: 'Plan done · Go to field',
  field: null,
}
