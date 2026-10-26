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

import type { VenueErrors, VenueField } from './venue.ts'

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
     * setupGap() below. Enumerating three fields here named two that
     * the app now fills in by default.
     */
    return 'Finish Setup first.'
  }
  if (mode === 'field' && !available.hasPlan) {
    return 'Generate a plan first. Field mode shows the positions you are walking to.'
  }
  return null
}

/** Where on the SETUP screen a field lives, for scrolling to and ringing it. */
export type SetupTarget = 'venue' | 'date' | 'window'

/**
 * Every venue field, and the control that sets it, or null when it never blocks.
 *
 * A Record over VenueField rather than a switch, so adding a field to the draft
 * fails to compile until someone decides here whether it can block, and if so
 * what on screen fixes it.
 */
export const SETUP_FIELD_TARGET: Record<VenueField, SetupTarget | null> = {
  latitude: 'venue',
  longitude: 'venue',
  date: 'date',
  startTime: 'window',
  endTime: 'window',
  name: null,
  eventDescription: null,
  desiredOutcome: null,
  /* NEVER BLOCKS. Off is the default and keeps drones out of controlled airspace. */
  laanc: null,
  /* NEVER BLOCKS. Empty means the grid value. */
  laancCeilingFeet: null,
  /*
   * NEVER BLOCKS. An empty subject size is a perfectly good state: it means
   * nobody has said, and the app then measures the frame and claims nothing
   * about it. Blocking on it would be demanding a number in order to produce a
   * judgement the shooter never asked for.
   */
  subjectAcrossMeters: null,
}

/** In screen order, so the first gap is the highest one on the page. */
const SETUP_ORDER: VenueField[] = ['latitude', 'longitude', 'date', 'startTime', 'endTime']

const SETUP_FIELD_COPY: Record<SetupTarget, string> = {
  venue: 'Drop a pin on the venue, or search for it.',
  date: 'Set the date.',
  window: 'Set the shooting window.',
}

export interface SetupGap {
  /** The field validateVenue actually flagged. */
  field: VenueField
  /** The control that fixes it. */
  target: SetupTarget
  /** What the forward button says. */
  copy: string
}

/**
 * What SETUP is actually still waiting for, said one thing at a time, and
 * derived from the errors themselves.
 *
 * The old version mapped a hand-written list of fields to a category, and the
 * category to a sentence. "name" was on that list, so a missing name came out
 * as "Drop a pin on the venue" with the pin already dropped. Reading the field
 * straight off the errors means the sentence cannot name something that is
 * already satisfied: if validateVenue did not flag it, it is not said.
 *
 * When the error is more specific than "Required." (an end before the start,
 * a date that does not exist) that detail is said too, because "Set the
 * shooting window" over a window that is visibly set is the same bug again.
 */
export function setupGap(errors: VenueErrors): SetupGap | null {
  for (const field of SETUP_ORDER) {
    const error = errors[field]
    const target = SETUP_FIELD_TARGET[field]
    if (error === undefined || target === null) continue
    const copy =
      error === 'Required.' || target === 'venue'
        ? SETUP_FIELD_COPY[target]
        : `${SETUP_FIELD_COPY[target]} ${error}`
    return { field, target, copy }
  }
  return null
}

/** The part of a DOM node ringNode touches, so it can be tested without a DOM. */
export interface RingableNode {
  scrollIntoView: (options: ScrollIntoViewOptions) => void
  classList: { add: (name: string) => void; remove: (name: string) => void }
}

export const RING_MS = 2200

/**
 * Scrolls a missing field into view and rings it for a moment. Returns the
 * cleanup, so a second press restarts the ring rather than stacking timers.
 */
export function ringNode(node: RingableNode, ms: number = RING_MS): () => void {
  node.scrollIntoView({ behavior: 'smooth', block: 'center' })
  node.classList.add('is-wanted')
  const timer = setTimeout(() => node.classList.remove('is-wanted'), ms)
  return () => {
    clearTimeout(timer)
    node.classList.remove('is-wanted')
  }
}

/*
 * canEnter IS GONE WITH THE STEPPER.
 *
 * It was `blockedReason(mode, available) === null`, and its only caller was
 * App's goTo, which refused to change stage when it returned false. The nav
 * is navigation now -- any stage from any stage -- so there is nothing left
 * that asks permission to move, and a helper whose whole purpose was granting
 * it is better deleted than left for somebody to find and reuse.
 *
 * blockedReason stays. It says WHY the next step is not earned yet, which is
 * a statement about the work; it is not a lock on the navigation.
 */

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
