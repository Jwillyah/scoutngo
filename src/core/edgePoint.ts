/*
 * WHERE A RAY LEAVES THE FREE PART OF THE SCREEN, for the time pill at its end.
 *
 * From the pin's screen point along the ray's screen direction to the first
 * edge of the box -- the map left between the top chrome and the sheet --
 * pulled in by half the pill's size so the pill sits wholly inside. Null when
 * the pin itself is outside the box (the ray starts off screen) or the
 * direction is degenerate.
 */
export interface Pt {
  x: number
  y: number
}
export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

export function edgePoint(origin: Pt, direction: Pt, box: Box, half: { w: number; h: number }): Pt | null {
  const inner = { left: box.left + half.w, right: box.right - half.w, top: box.top + half.h, bottom: box.bottom - half.h }
  if (inner.left > inner.right || inner.top > inner.bottom) return null
  if (origin.x < box.left || origin.x > box.right || origin.y < box.top || origin.y > box.bottom) return null
  const length = Math.hypot(direction.x, direction.y)
  if (!(length > 0)) return null
  const dx = direction.x / length
  const dy = direction.y / length
  const hits: number[] = []
  if (dx > 0) hits.push((inner.right - origin.x) / dx)
  if (dx < 0) hits.push((inner.left - origin.x) / dx)
  if (dy > 0) hits.push((inner.bottom - origin.y) / dy)
  if (dy < 0) hits.push((inner.top - origin.y) / dy)
  const t = Math.min(...hits.filter((h) => h >= 0))
  if (!Number.isFinite(t)) return null
  return { x: origin.x + dx * t, y: origin.y + dy * t }
}
