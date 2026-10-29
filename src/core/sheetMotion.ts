/*
 * THE SHEET'S MOTION, AS ARITHMETIC: where a release lands, and who owns a
 * drag. Pure, so the rules are tested here and not only by thumb.
 *
 * 29 Oct, from the pier: "Today you have to hold and pull slowly, and it
 * often doesn't move. Must work like Apple Maps: a quick flick moves it."
 */
import { SHEET_DETENTS, type SheetDetent } from './sheetDetent.ts'

/*
 * A FLICK IS SPEED, NOT DISTANCE. Released faster than this, the sheet goes
 * one detent on in the direction of the flick, however short the flick was;
 * slower, it settles on the nearest. 0.25 px/ms is 250 px a second: a quick
 * flick on a phone runs 800 to 2000, a deliberate slow pull under 150, and a
 * pull held still before letting go is 0.
 */
export const FLICK_PX_PER_MS = 0.25

/** How far a finger moves before the drag is anybody's: the axis is decided here. */
export const AXIS_SLOP_PX = 8

/*
 * ON A SIDEWAYS CONTROL (the time bar's ruler, the tide curve), up or down
 * needs twice as far. A thumb's sideways swipe starts with a hook upward as
 * it pivots, about 12 px up and 3 across (c35bbbf measured it: decided at
 * 8 px it lost 6 of 20 swipes to the sheet, and it did again on 29 Oct).
 * Sideways is still decided at 8.
 */
export const VERTICAL_SLOP_ON_SIDEWAYS_PX = 16

/**
 * Which way a drag goes, or null while it is still too short to say.
 * Sideways when it has gone at least 0.6 as far sideways as up or down, from
 * AXIS_SLOP_PX; up or down once it has gone `verticalSlop` that way.
 */
export function dragAxis(dx: number, dy: number, verticalSlop = AXIS_SLOP_PX): 'x' | 'y' | null {
  const sideways = Math.abs(dx) >= Math.abs(dy) * 0.6
  if (sideways) return Math.hypot(dx, dy) >= AXIS_SLOP_PX ? 'x' : null
  return Math.abs(dy) >= verticalSlop ? 'y' : null
}

/** Pixels a second from the last samples of a drag: [time ms, y px], oldest first. */
export function releaseVelocity(samples: readonly (readonly [number, number])[], windowMs = 80): number {
  if (samples.length < 2) return 0
  const last = samples[samples.length - 1]
  let first = samples[samples.length - 2]
  for (let i = samples.length - 2; i >= 0; i -= 1) {
    if (last[0] - samples[i][0] > windowMs) break
    first = samples[i]
  }
  const dt = last[0] - first[0]
  return dt <= 0 ? 0 : (last[1] - first[1]) / dt
}

/**
 * Where a released drag lands. `from` is the detent it started at,
 * `velocity` px/ms in screen y (positive is down, so the sheet shrinks),
 * `heights` each detent's height now.
 *
 * A FLICK GOES ONE DETENT ON FROM WHERE IT STARTED, in its direction: from
 * full any flick down is half, from peek any flick up is half. Only a drag
 * that had already gone a quarter of the way past that detent, toward the
 * next, goes on to the next: peek dragged well above half and flicked up is
 * full. Slow, the nearest.
 */
export function landing(from: SheetDetent, releasedHeight: number, velocity: number, heights: Readonly<Record<SheetDetent, number>>): SheetDetent {
  const order = [...SHEET_DETENTS].sort((a, b) => heights[a] - heights[b])
  if (Math.abs(velocity) < FLICK_PX_PER_MS) {
    return order.reduce((best, d) => (Math.abs(heights[d] - releasedHeight) < Math.abs(heights[best] - releasedHeight) ? d : best))
  }
  const step = velocity < 0 ? 1 : -1
  let at = Math.max(0, Math.min(order.length - 1, order.indexOf(from) + step))
  for (;;) {
    const next = at + step
    if (next < 0 || next >= order.length) break
    const here = heights[order[at]]
    const beyond = heights[order[next]]
    /* Gone a quarter of the way from this detent to the next one? Then that one. */
    const past = step > 0 ? releasedHeight - here : here - releasedHeight
    if (past < Math.abs(beyond - here) * 0.25) break
    at = next
  }
  return order[at]
}
