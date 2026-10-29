import { describe, expect, it } from 'vitest'
import { dragAxis, FLICK_PX_PER_MS, landing, releaseVelocity, VERTICAL_SLOP_ON_SIDEWAYS_PX } from './sheetMotion.ts'

const H = { peek: 88, half: 380, full: 776 }

describe('where a released sheet lands', () => {
  it('a flick goes one detent on, however short it was', () => {
    /* From full, a 12 px flick down. */
    expect(landing('full', 764, 1.2, H)).toBe('half')
    /* From half, a 10 px flick up. */
    expect(landing('half', 390, -0.9, H)).toBe('full')
    expect(landing('half', 372, 0.8, H)).toBe('peek')
    expect(landing('peek', 100, -1.5, H)).toBe('half')
  })
  it('from full, a fast drag let go just under half is half, not peek', () => {
    expect(landing('full', 370, 1.4, H)).toBe('half')
  })
  it('goes on past the next detent only when the drag had already gone a quarter of the way beyond it', () => {
    /* Peek dragged to 450 (16% of half to full) and flicked up: half. To 520 (35%): full. */
    expect(landing('peek', 450, -1, H)).toBe('half')
    expect(landing('peek', 520, -1, H)).toBe('full')
  })
  it('stops at the ends', () => {
    expect(landing('full', 790, -2, H)).toBe('full')
    expect(landing('peek', 80, 2, H)).toBe('peek')
  })
  it('a slow drag settles on the nearest', () => {
    expect(landing('half', 600, 0.1, H)).toBe('full')
    expect(landing('full', 500, -0.1, H)).toBe('half')
    expect(landing('half', 200, 0, H)).toBe('peek')
  })
  it('the line between the two is the flick speed', () => {
    expect(landing('half', 420, -FLICK_PX_PER_MS, H)).toBe('full')
    expect(landing('half', 420, -FLICK_PX_PER_MS * 0.99, H)).toBe('half')
    expect(FLICK_PX_PER_MS).toBe(0.25)
  })
  it('a card at its own height, where half and full are the same, still lands', () => {
    const fit = { peek: 88, half: 300, full: 300 }
    expect(['half', 'full']).toContain(landing('half', 320, -1, fit))
    expect(landing('half', 290, 1, fit)).toBe('peek')
  })
})

describe('the speed at release', () => {
  it('reads the last 80 ms, not the whole drag', () => {
    /* A slow pull, then a quick flick at the end: 60 px in the last 40 ms is 1.5 px/ms. */
    const s: [number, number][] = [[0, 500], [200, 480], [400, 460], [600, 440], [620, 410], [640, 380]]
    expect(releaseVelocity(s)).toBeCloseTo(-1.5, 6)
  })
  it('is nothing with one sample, or a hold before letting go', () => {
    expect(releaseVelocity([[0, 10]])).toBe(0)
    expect(releaseVelocity([[0, 400], [10, 380], [300, 380]])).toBe(0)
  })
})

describe('which way a drag goes', () => {
  it('waits for 8 px', () => {
    expect(dragAxis(3, -5)).toBeNull()
  })
  it('straight up or down is the sheet', () => {
    expect(dragAxis(2, 9)).toBe('y')
    expect(dragAxis(-4, -12)).toBe('y')
  })
  it("on the ruler, a thumb's sideways swipe that hooks 12 px up first is still sideways", () => {
    /* The hook: up 12, across 3. Not decided yet on a sideways control; then it goes across. */
    expect(dragAxis(3, -12, VERTICAL_SLOP_ON_SIDEWAYS_PX)).toBeNull()
    expect(dragAxis(15, -12, VERTICAL_SLOP_ON_SIDEWAYS_PX)).toBe('x')
    /* Off the ruler the same hook is the sheet's. */
    expect(dragAxis(3, -12)).toBe('y')
  })
  it('on the ruler, straight up is still the sheet, once it has gone 16 px', () => {
    expect(dragAxis(1, -15, VERTICAL_SLOP_ON_SIDEWAYS_PX)).toBeNull()
    expect(dragAxis(1, -16, VERTICAL_SLOP_ON_SIDEWAYS_PX)).toBe('y')
  })
})
