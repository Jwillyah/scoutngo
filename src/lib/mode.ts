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
    /*
     * Deliberately not a list of fields. This is the rail's tooltip and the
     * gate's reason; the forward button says WHICH field is missing, from
     * SETUP_MISSING_COPY below. Enumerating three fields here named two that
     * the app now fills in by default.
     */
    return 'Finish Setup first.'
  }
  if (mode === 'field' && !available.hasPlan) {
    return 'Generate a plan first. Field mode shows the positions you are walking to.'
  }
  return null
}

/**
 * What SETUP is actually still waiting for, said one thing at a time.
 *
 * The old line was "Set a venue, a date and a window first" whatever was
 * missing. With the date and window now defaulted, that sentence named two
 * things that were already filled in and buried the one that was not.
 */
export const SETUP_MISSING_COPY: Record<'venue' | 'date' | 'window', string> = {
  venue: 'Drop a pin on the venue, or search for it.',
  date: 'Set the date.',
  window: 'Set the shooting window.',
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
