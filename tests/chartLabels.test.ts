import { describe, expect, it } from 'vitest'
import { overlaps, planChartLabels, type Box } from '../src/core/chartLabels.ts'

/* Batch NOW, Section 3.2: the home charts' bubbles never on the axis numbers, the ticks or the dots. */
const area: Box = { x: 0, y: 0, w: 140, h: 60 }
const gl = (y: number): Box => ({ x: 118, y: y - 7, w: 22, h: 14 })
const ticks: Box[] = [{ x: 0, y: 60, w: 20, h: 14 }]

describe('chart labels', () => {
  it('a bubble on a gridline label moves to its other side', () => {
    /* The surf's 1.8 ft at the right edge on its 1.0 ft label. */
    const p = planChartLabels({ area, grid: [gl(56), gl(30), gl(6)], ticks, fixed: [], bubble: { usual: 'right', boxes: { right: { x: 104, y: 24, w: 34, h: 14 }, left: { x: 66, y: 24, w: 34, h: 14 }, above: { x: 90, y: 8, w: 34, h: 14 }, below: { x: 90, y: 40, w: 34, h: 14 } } } })
    expect(p.bubble).toBe('left')
    expect(p.grid).toEqual([true, true, true])
  })
  it('then below its dot; with nowhere clear, the axis number it hits goes', () => {
    const blocked = { x: 60, y: 20, w: 60, h: 30 }
    const p = planChartLabels({ area, grid: [gl(56), gl(30), gl(6)], ticks, fixed: [blocked], bubble: { usual: 'right', boxes: { right: { x: 104, y: 24, w: 34, h: 14 }, left: { x: 66, y: 24, w: 34, h: 14 }, above: { x: 90, y: 8, w: 34, h: 14 }, below: { x: 90, y: 38, w: 34, h: 14 } } } })
    expect(p.bubble).toBe('right')
    expect(p.grid).toEqual([true, false, true])
  })
  it('gridline labels on the ticks or on each other: the middle one goes first', () => {
    /* The small tide chart at 664 px: 1.5, 3 and 0 on top of each other. */
    const p = planChartLabels({ area: { x: 0, y: 0, w: 140, h: 30 }, grid: [gl(28), gl(18), gl(8)], ticks: [{ x: 110, y: 30, w: 30, h: 14 }], fixed: [], bubble: null })
    expect(p.grid[1]).toBe(false)
    const shown = [gl(28), gl(18), gl(8)].filter((_, i) => p.grid[i])
    for (const a of shown) for (const b of shown) if (a !== b) expect(overlaps(a, b)).toBe(false)
  })
  it('two ticks on a narrow card: the later goes, "now" stays; a tick under a dot goes (the drone\'s "now" on "6p", 13 Nov)', () => {
    const now: Box = { x: 0, y: 60, w: 26, h: 14 }
    const sixp: Box = { x: 20, y: 60, w: 18, h: 14 }
    const noon: Box = { x: 80, y: 60, w: 30, h: 14 }
    const p = planChartLabels({ area, grid: [], ticks: [now, sixp, noon], fixed: [], bubble: null, dots: [{ x: 84, y: 58, w: 8, h: 8 }] })
    expect(p.ticks).toEqual([true, false, false])
  })
})
