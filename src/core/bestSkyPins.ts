/*
 * THE BEST SKY MAP'S PINS AND LABELS (Batch LIVE, Section 8.1; 14 Nov 2:45
 * PM: labels floating away from their pins, two pins on top of each other,
 * "You" over the sun's label).
 *
 *   pins     never overlap: two closer than PIN_GAP_PX are pushed apart
 *            along the line between them (or fanned out when they share a
 *            place), a few rounds; each keeps a hairline to where it is
 *   labels   one row above or below their pin at most, the sun's label and
 *            every pin an obstacle, and a leader from the pill to its pin:
 *            a label with no room is left off, never floated elsewhere
 */
export const PIN_GAP_PX = 28
export const LABEL_ROWS = 2

export interface Pt {
  x: number
  y: number
}
export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** The pins moved apart until none is closer than `gap`; the same order as given. */
export function spreadPins(pins: readonly Pt[], gap = PIN_GAP_PX, rounds = 12): Pt[] {
  const out = pins.map((p) => ({ ...p }))
  for (let r = 0; r < rounds; r += 1) {
    let moved = false
    for (let i = 0; i < out.length; i += 1) {
      for (let j = i + 1; j < out.length; j += 1) {
        let dx = out[j].x - out[i].x
        let dy = out[j].y - out[i].y
        let d = Math.hypot(dx, dy)
        if (d >= gap) continue
        if (d < 0.01) {
          const a = (j * 2 * Math.PI) / Math.max(2, out.length)
          dx = Math.cos(a)
          dy = Math.sin(a)
          d = 1
        }
        const push = (gap - d) / 2 + 0.5
        out[i].x -= (dx / d) * push
        out[i].y -= (dy / d) * push
        out[j].x += (dx / d) * push
        out[j].y += (dy / d) * push
        moved = true
      }
    }
    if (!moved) break
  }
  return out
}

const hit = (a: Box, b: Box, g = 2) => a.x < b.x + b.w + g && b.x < a.x + a.w + g && a.y < b.y + b.h + g && b.y < a.y + a.h + g

/** Each label beside its pin (up or down, at most LABEL_ROWS rows), clear of the obstacles, the pins and each other; null where there is no room. */
export function attachLabels(items: readonly { pin: Pt; w: number; h: number }[], width: number, height: number, obstacles: readonly Box[], pinR = 13): (Box | null)[] {
  const placed: Box[] = []
  const pins = items.map((p) => ({ x: p.pin.x - pinR, y: p.pin.y - pinR, w: pinR * 2, h: pinR * 2 }))
  return items.map((p) => {
    for (let k = 0; k < LABEL_ROWS; k += 1) {
      for (const dx of [0, -p.w / 2 - 6, p.w / 2 + 6]) {
        for (const y of [p.pin.y - pinR - 4 - p.h - k * (p.h + 3), p.pin.y + pinR + 4 + k * (p.h + 3)]) {
          const box = { x: p.pin.x - p.w / 2 + dx, y, w: p.w, h: p.h }
          if (box.x < 2 || box.x + box.w > width - 2 || box.y < 2 || box.y + box.h > height - 2) continue
          if (placed.some((q) => hit(box, q)) || pins.some((q) => hit(box, q, 0)) || obstacles.some((q) => hit(box, q))) continue
          placed.push(box)
          return box
        }
      }
    }
    return null
  })
}

/** The leader from a label to its pin: from the label's edge nearest the pin. */
export function leader(box: Box, pin: Pt): { x1: number; y1: number; x2: number; y2: number } {
  const x1 = Math.max(box.x + 8, Math.min(box.x + box.w - 8, pin.x))
  const y1 = pin.y < box.y ? box.y : box.y + box.h
  return { x1, y1, x2: pin.x, y2: pin.y }
}
