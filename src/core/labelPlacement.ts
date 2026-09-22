/*
 * Keeping a map label out from under the floating chrome.
 *
 * THE PROBLEM. The sun and shadow labels are placed a fixed distance along
 * their own ray from the venue pin. That is the right place for them: a label
 * that is not on its ray is a label you have to work out. But when the venue
 * sits near the top of the view, the north-ish ray puts its label underneath
 * the HUD, and the reading disappears behind a button.
 *
 * THE RULE. Slide the label along its own ray until it is clear. Never move it
 * off the ray, because then it stops meaning "this direction". If no point on
 * the ray inside the view is clear, hide the label; the RAY ITSELF ALWAYS DRAWS,
 * so the direction is never lost, only the degrees.
 *
 * This module is the arithmetic: rectangles, overlap, and the order to try
 * distances in. Projecting a bearing and a distance to a screen rectangle is
 * the map's job and stays in the component.
 */

export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

/** Do these two rectangles share any area? Touching edges do not count. */
export function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
}

/** Is `inner` completely inside `outer`? */
export function within(outer: Rect, inner: Rect): boolean {
  return (
    inner.left >= outer.left &&
    inner.right <= outer.right &&
    inner.top >= outer.top &&
    inner.bottom <= outer.bottom
  )
}

/**
 * A candidate is usable when it is fully on screen and touching nothing.
 *
 * FULLY on screen, not merely intersecting: half a bearing readout at the edge
 * of the map reads as a different number, which is worse than no number.
 */
export function isClear(candidate: Rect, obstacles: Rect[], viewport: Rect): boolean {
  if (!within(viewport, candidate)) return false
  return !obstacles.some((obstacle) => overlaps(candidate, obstacle))
}

/**
 * The distances to try, in order, starting from where the label wants to be.
 *
 * ALTERNATING OUT AND IN, because which way helps depends on where the venue
 * is. With the venue near the top of the view a northward ray has to come IN,
 * toward the pin, to escape the HUD; a southward one going under the sheet has
 * to go OUT. Trying one direction only would fix half the cases and would move
 * labels much further than they need to go in the other half.
 *
 * The preferred distance is always first, so a label that is already fine never
 * moves at all.
 */
export function slideOrder(
  preferred: number,
  min: number,
  max: number,
  step: number,
): number[] {
  if (!Number.isFinite(preferred) || !Number.isFinite(step) || step <= 0) return []
  if (!(max >= min)) return []

  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  const order: number[] = []
  const seen = new Set<number>()
  const push = (value: number) => {
    const at = clamp(value)
    if (seen.has(at)) return
    seen.add(at)
    order.push(at)
  }

  push(preferred)
  /*
   * Bounded by the span rather than by a magic count, so the step size and the
   * band stay independent: halving the step doubles the attempts instead of
   * silently searching half the ray.
   */
  const steps = Math.ceil((max - min) / step)
  for (let i = 1; i <= steps; i++) {
    const out = preferred + i * step
    const back = preferred - i * step
    if (out <= max) push(out)
    if (back >= min) push(back)
  }
  // The ends are worth one try each even when the step does not land on them.
  push(max)
  push(min)
  return order
}

/** A rectangle of `width` by `height` centred on a point. */
export function centredRect(
  x: number,
  y: number,
  width: number,
  height: number,
): Rect {
  const halfW = width / 2
  const halfH = height / 2
  return { left: x - halfW, top: y - halfH, right: x + halfW, bottom: y + halfH }
}

/** Grow a rectangle by `by` on every side, for a breathing gap around chrome. */
export function pad(rect: Rect, by: number): Rect {
  return {
    left: rect.left - by,
    top: rect.top - by,
    right: rect.right + by,
    bottom: rect.bottom + by,
  }
}
