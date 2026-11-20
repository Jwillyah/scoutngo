/*
 * THE PLANNER OPENS ON A TAP, AND ONLY ON A TAP (Batch SIMPLE-2, Section 0).
 *
 * SIMPLE-1 started the app on the map and reset the map when the home stepped
 * off it. The planner still came up by itself, because the mode was a bare
 * word, 'setup', that anything could hold:
 *
 *   - a first run with no place started in 'setup' (where the pin goes); the
 *     spot picked from "Where do you go?" put the home over it, and the mode
 *     stayed 'setup' under the home. Any way off the home that was not its
 *     Map button (Escape, ☰ › Weather › Back, ☰ › Drone › Back) uncovered the
 *     Setup wizard on the map;
 *   - /setup, /kit and /saved, typed or pasted, opened it;
 *   - the map's sheet, raised by its handle or left up when a card closed,
 *     showed the shoot card ("0 positions · Suggest · BOTH GROUND AIR").
 *
 * So the planner is not a word any more. It is a `PlannerAsk`, and the one
 * way to make one is `askPlanner(door)`, called from a tap handler. An ask is
 * a live object this module remembers (a WeakSet), so nothing parsed from
 * localStorage, a URL or a history entry can be one: JSON has no way to say
 * it. The view holds the ask; the planner is on screen only while the view
 * holds a real one (shape A in docs/failure-modes.md: the bad state is not
 * representable, rather than reset in one more place).
 */
import { PLANNER_EXTRA_DOORS } from '../config/flags.ts'
import type { Mode } from './mode.ts'

/**
 * Where the tap was. The first three are the batch's doors (Menu › Plan a
 * shoot, Drone Preflight's "Plan a shoot ›", Sky Night's "Plan ›"); Kit and
 * Saved are Menu rows whose drawers live in setup; first-pin is a pin set in
 * the first run's setup (App keepFirstRun), so the wizard carries on. The rest are SIMPLE-1's
 * extra doors, shut behind PLANNER_EXTRA_DOORS.
 */
export type PlannerDoor =
  | 'menu'
  | 'drone-preflight'
  | 'sky-night'
  | 'menu-kit'
  | 'menu-saved'
  | 'first-pin'
  | 'features-tool'
  | 'now-plan-here'
  | 'viewfinder-set-up'

/** The doors the batch keeps open: Menu and the explicit Plan buttons. */
export const PLANNER_DOORS: readonly PlannerDoor[] = ['menu', 'drone-preflight', 'sky-night', 'menu-kit', 'menu-saved', 'first-pin']
/** SIMPLE-1's other doors, shut unless the flag is on. */
export const EXTRA_DOORS: readonly PlannerDoor[] = ['features-tool', 'now-plan-here', 'viewfinder-set-up']

export interface PlannerAsk {
  readonly door: PlannerDoor
}

const ASKS = new WeakSet<object>()

/** Whether a door is open in this build. */
export function doorOpen(door: PlannerDoor, extraDoors: boolean = PLANNER_EXTRA_DOORS): boolean {
  return PLANNER_DOORS.includes(door) || (extraDoors && EXTRA_DOORS.includes(door))
}

/**
 * The tap asked for the planner. Call it from a click handler, nowhere else.
 * Null when that door is shut in this build.
 */
export function askPlanner(door: PlannerDoor, extraDoors: boolean = PLANNER_EXTRA_DOORS): PlannerAsk | null {
  if (!doorOpen(door, extraDoors)) return null
  const ask: PlannerAsk = Object.freeze({ door })
  ASKS.add(ask)
  return ask
}

/** True only for an ask made by askPlanner in this page's life. */
export function isAsk(x: unknown): x is PlannerAsk {
  return typeof x === 'object' && x !== null && ASKS.has(x)
}

/**
 * THE ONE NAVIGATION STATE. The map can carry the ask too: setup's Done hands
 * it on, so the shoot card (the planner's second half, Suggest and the
 * positions) is there after the wizard and nowhere else.
 */
export type View =
  | { readonly mode: 'plan'; readonly ask: PlannerAsk | null }
  | { readonly mode: 'field' }
  /** ask null: the first run's setup, where the pin goes, good only while there is no place. */
  | { readonly mode: 'setup'; readonly ask: PlannerAsk | null }

/** The map, nothing asked. */
export const MAP: View = Object.freeze({ mode: 'plan', ask: null })
export const FIELD: View = Object.freeze({ mode: 'field' })
/** Setup with no place yet: the pin goes here. Not an ask: it ends when a place exists. */
export const FIRST_PIN: View = Object.freeze({ mode: 'setup', ask: null })

/** Where the app starts (src/lib/mode.ts startMode says the same): the map with a place, the pin's setup without. */
export const startView = (hasPlace: boolean): View => (hasPlace ? MAP : FIRST_PIN)

/**
 * Setup for this ask, or the view unchanged when there is no real ask. A
 * plan block's "fix this" is inside the planner already (the shoot card shows
 * only on an ask), so it passes on the ask it was opened with.
 */
export function setupFor(ask: PlannerAsk | null, current: View): View {
  return isAsk(ask) ? { mode: 'setup', ask } : current
}

/**
 * The mode on screen. Setup shows for a real ask, or for the first run's
 * pin while there is still no place (the "Where do you go?" picker covers it
 * on a bare launch). The moment a place exists the first run's setup is the
 * map: the spot picked under the home can never uncover the wizard.
 */
export function shownMode(view: View, hasPlace: boolean): Mode {
  if (view.mode !== 'setup') return view.mode
  if (isAsk(view.ask)) return 'setup'
  return view.ask === null && !hasPlace ? 'setup' : 'plan'
}

/** Whether the map's sheet may show the shoot card: only on an ask carried from setup. */
export function plannerOnMap(view: View): boolean {
  return view.mode === 'plan' && isAsk(view.ask)
}

/** The home went over whatever was there: the ask is spent. */
export function spent(view: View): View {
  if (view.mode === 'field') return view
  return view.mode === 'setup' || view.ask !== null ? MAP : view
}
