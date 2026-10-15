import { describe, expect, it } from 'vitest'
import {
  centredRect,
  isClear,
  overlaps,
  pad,
  slideOrder,
  within,
  type Rect,
} from './labelPlacement.ts'

const r = (left: number, top: number, right: number, bottom: number): Rect => ({
  left,
  top,
  right,
  bottom,
})

describe('overlaps', () => {
  it('sees a real intersection', () => {
    expect(overlaps(r(0, 0, 10, 10), r(5, 5, 15, 15))).toBe(true)
  })

  it('separates on either axis alone', () => {
    expect(overlaps(r(0, 0, 10, 10), r(20, 0, 30, 10))).toBe(false)
    expect(overlaps(r(0, 0, 10, 10), r(0, 20, 10, 30))).toBe(false)
  })

  /* Touching is not overlapping: a label flush against a panel edge is legible. */
  it('treats a shared edge as clear', () => {
    expect(overlaps(r(0, 0, 10, 10), r(10, 0, 20, 10))).toBe(false)
    expect(overlaps(r(0, 0, 10, 10), r(0, 10, 10, 20))).toBe(false)
  })

  it('handles one rectangle swallowing the other', () => {
    expect(overlaps(r(0, 0, 100, 100), r(40, 40, 60, 60))).toBe(true)
    expect(overlaps(r(40, 40, 60, 60), r(0, 0, 100, 100))).toBe(true)
  })
})

describe('within', () => {
  it('requires the whole rectangle to be inside', () => {
    const view = r(0, 0, 390, 844)
    expect(within(view, r(10, 10, 100, 40))).toBe(true)
    expect(within(view, r(-5, 10, 100, 40))).toBe(false)
    expect(within(view, r(300, 10, 400, 40))).toBe(false)
    expect(within(view, r(10, 820, 100, 860))).toBe(false)
  })

  it('counts a flush fit as inside', () => {
    expect(within(r(0, 0, 100, 100), r(0, 0, 100, 100))).toBe(true)
  })
})

describe('isClear', () => {
  const view = r(0, 0, 390, 844)
  const hud = r(12, 12, 378, 68)
  const sheet = r(0, 668, 390, 844)

  it('accepts a spot in the open middle', () => {
    expect(isClear(r(150, 300, 250, 330), [hud, sheet], view)).toBe(true)
  })

  /* The reported collision: a label under the HUD when the venue is up top. */
  it('rejects a spot under the floating chrome', () => {
    expect(isClear(r(150, 40, 250, 70), [hud, sheet], view)).toBe(false)
    expect(isClear(r(150, 700, 250, 730), [hud, sheet], view)).toBe(false)
  })

  it('rejects a spot hanging off the edge of the view', () => {
    expect(isClear(r(-20, 300, 80, 330), [hud, sheet], view)).toBe(false)
  })

  it('is clear when there is no chrome at all', () => {
    expect(isClear(r(150, 40, 250, 70), [], view)).toBe(true)
  })
})

describe('slideOrder', () => {
  it('tries where the label already wants to be, first', () => {
    expect(slideOrder(300, 100, 900, 100)[0]).toBe(300)
  })

  /*
   * BOTH DIRECTIONS, ALTERNATING. Near the top of the view a northward ray has
   * to come IN toward the pin to escape the HUD; a southward one under the
   * sheet has to go OUT. One direction only would fix half the cases.
   */
  it('alternates outward and inward from the preferred distance', () => {
    expect(slideOrder(500, 100, 900, 100).slice(0, 5)).toEqual([500, 600, 400, 700, 300])
  })

  it('never proposes a distance outside the band', () => {
    for (const d of slideOrder(500, 120, 800, 90)) {
      expect(d).toBeGreaterThanOrEqual(120)
      expect(d).toBeLessThanOrEqual(800)
    }
  })

  it('offers no duplicates, so nothing is measured twice', () => {
    const order = slideOrder(400, 100, 900, 125)
    expect(new Set(order).size).toBe(order.length)
  })

  it('reaches both ends of the band', () => {
    const order = slideOrder(500, 100, 900, 100)
    expect(order).toContain(100)
    expect(order).toContain(900)
  })

  /* A smaller step searches more finely rather than searching less of the ray. */
  it('scales the number of attempts with the step, not the other way round', () => {
    expect(slideOrder(500, 100, 900, 50).length).toBeGreaterThan(
      slideOrder(500, 100, 900, 100).length,
    )
    expect(slideOrder(500, 100, 900, 50)).toContain(100)
  })

  it('clamps a preferred distance that sits outside the band', () => {
    expect(slideOrder(5000, 100, 900, 100)[0]).toBe(900)
    expect(slideOrder(0, 100, 900, 100)[0]).toBe(100)
  })

  it('returns nothing rather than looping on junk', () => {
    expect(slideOrder(300, 100, 900, 0)).toEqual([])
    expect(slideOrder(Number.NaN, 100, 900, 100)).toEqual([])
    expect(slideOrder(300, 900, 100, 100)).toEqual([])
  })
})

describe('centredRect and pad', () => {
  it('centres a box on a point', () => {
    expect(centredRect(100, 50, 60, 20)).toEqual({ left: 70, top: 40, right: 130, bottom: 60 })
  })

  it('grows a rectangle evenly, for a breathing gap around chrome', () => {
    expect(pad(r(10, 10, 20, 20), 5)).toEqual({ left: 5, top: 5, right: 25, bottom: 25 })
  })
})

/*
 * LABELS MUST NOT STACK ON EACH OTHER.
 *
 * Found by scripts/audit-labels.mjs at zoom 12, where the rays converge enough
 * that Shadow, Rise and Set all wanted the same spot: three overlaps at once,
 * and the result is one unreadable readout rather than three.
 *
 * The placement loop accumulates each label's box as it goes, so every label
 * is checked against the ones already placed as well as against the chrome.
 * These pin the arithmetic that makes that work.
 */
describe('a label placed against the ones already placed', () => {
  const viewport: Rect = { left: 0, top: 0, right: 390, bottom: 844 }
  const taken: Rect = { left: 100, top: 100, right: 160, bottom: 140 }

  it('refuses a spot an earlier label already took', () => {
    const wanted: Rect = { left: 120, top: 110, right: 180, bottom: 150 }
    expect(isClear(wanted, [], viewport)).toBe(true)
    expect(isClear(wanted, [taken], viewport)).toBe(false)
  })

  it('accepts a spot that only touches it', () => {
    // Touching edges do not count as an overlap, which overlaps() documents.
    const abutting: Rect = { left: 160, top: 100, right: 220, bottom: 140 }
    expect(isClear(abutting, [taken], viewport)).toBe(true)
  })

  /*
   * THE ACCUMULATION ORDER MATTERS: the first label gets its first choice and
   * later ones move. That is deliberate, and it is why the list grows rather
   * than being computed up front.
   */
  it('lets the first label keep its spot and moves the second', () => {
    const first: Rect = { left: 100, top: 100, right: 160, bottom: 140 }
    const placed: Rect[] = []
    expect(isClear(first, placed, viewport)).toBe(true)
    placed.push(first)
    expect(isClear(first, placed, viewport)).toBe(false)
  })

  /* And the venue pin is in the same list, for the same reason. */
  it('treats the pin as something to avoid', () => {
    const pin: Rect = { left: 184, top: 410, right: 206, bottom: 436 }
    const onThePin: Rect = { left: 180, top: 405, right: 240, bottom: 445 }
    expect(isClear(onThePin, [pin], viewport)).toBe(false)
  })
})
