/*
 * LABELS ON A SMALL MAP THAT NEVER OVERLAP (Batch MAP2, Section 2: the Buoys
 * page's map put two buoys' pills on top of each other). Each pill tries, in
 * order, above its pin, below it, then further up and down in steps, and
 * left and right; the first spot that is inside the box and clear of every
 * pill already placed (and of the pins) wins. When none is, the pill is left
 * off: a pill missing is better than two unreadable.
 */
export interface PillIn {
  /** The pin, px. */
  x: number
  y: number
  w: number
  h: number
}

export interface PillOut {
  x: number
  y: number
}

const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }, gap = 2) => a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap

export function placePills(items: readonly PillIn[], width: number, height: number, pinR = 7): (PillOut | null)[] {
  const placed: { x: number; y: number; w: number; h: number }[] = []
  const pins = items.map((p) => ({ x: p.x - pinR, y: p.y - pinR, w: pinR * 2, h: pinR * 2 }))
  return items.map((p) => {
    const tries: PillOut[] = []
    for (const k of [0, 1, 2, 3]) {
      const up = p.y - 12 - p.h - k * (p.h + 4)
      const down = p.y + 12 + k * (p.h + 4)
      for (const dx of [0, -p.w / 2 - 8, p.w / 2 + 8]) {
        tries.push({ x: p.x - p.w / 2 + dx, y: up }, { x: p.x - p.w / 2 + dx, y: down })
      }
    }
    for (const t of tries) {
      const box = { x: Math.max(2, Math.min(width - 2 - p.w, t.x)), y: t.y, w: p.w, h: p.h }
      if (box.y < 2 || box.y + box.h > height - 2) continue
      if (placed.some((q) => overlaps(box, q)) || pins.some((q) => overlaps(box, q, 0))) continue
      placed.push(box)
      return { x: box.x, y: box.y }
    }
    return null
  })
}
