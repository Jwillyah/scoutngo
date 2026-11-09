import { describe, expect, it } from 'vitest'
import { windToBeach } from '../src/core/coastFacing.ts'
import {
  beachLine,
  boxesOverlap,
  cardinalBoxes,
  DIAL_C,
  DIAL_SIZE,
  dialLabels,
  dialPoint,
  dialSectors,
  hourIndexOf,
  LABEL_H,
  LABEL_MAX_SHIFT_DEG,
  LABEL_R,
  labelWidth,
  modelsAgreeing,
  RING_R,
  windFlip,
} from '../src/core/windDial.ts'

const apart = (a: number, b: number) => {
  const d = Math.abs((((a - b) % 360) + 360) % 360)
  return Math.min(d, 360 - d)
}

describe('dialPoint', () => {
  it('puts north up and east right', () => {
    expect(dialPoint(0, 10)).toEqual({ x: DIAL_C, y: DIAL_C - 10 })
    const e = dialPoint(90, 10)
    expect(e.x).toBeCloseTo(DIAL_C + 10, 9)
    expect(e.y).toBeCloseTo(DIAL_C, 9)
  })
})

describe('the dial labels never sit on N, E, S or W', () => {
  it('can fail: the board drew "offshore" on the W, and that spot is caught', () => {
    const at = { ...dialPoint(270, LABEL_R), w: labelWidth('offshore'), h: LABEL_H }
    const w = cardinalBoxes().find((c) => c.text === 'W')
    expect(w).toBeDefined()
    expect(boxesOverlap(at, w as NonNullable<typeof w>)).toBe(true)
  })

  it('holds for every facing, half a degree at a time, inside the drawing and the ring', () => {
    const letters = cardinalBoxes()
    let placed = 0
    let moved = 0
    for (let facing = 0; facing < 360; facing += 0.5) {
      const labels = dialLabels(facing)
      expect(labels.map((l) => l.text)).toEqual(['offshore', 'onshore'])
      for (const l of labels) {
        for (const c of letters) expect(boxesOverlap(l, c), `${l.text} at facing ${facing} on ${c.text}`).toBe(false)
        expect(l.x - l.w / 2).toBeGreaterThanOrEqual(0)
        expect(l.x + l.w / 2).toBeLessThanOrEqual(DIAL_SIZE)
        /* Every corner inside the ring. */
        for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) expect(Math.hypot(l.x + (dx * l.w) / 2 - DIAL_C, l.y + (dy * l.h) / 2 - DIAL_C)).toBeLessThan(RING_R)
        expect(apart(l.bearing, l.wanted)).toBeLessThanOrEqual(LABEL_MAX_SHIFT_DEG)
        if (apart(l.bearing, l.wanted) > 0) moved += 1
        placed += 1
      }
      expect(boxesOverlap(labels[0], labels[1])).toBe(false)
    }
    expect(placed).toBe(1440)
    /* The shift was needed somewhere; a geometry that never moves a label is not testing the move. */
    expect(moved).toBeGreaterThan(0)
  })

  it('stays at its own bearing where nothing is in the way', () => {
    const [off, on] = dialLabels(45)
    expect(off.bearing).toBe(225)
    expect(on.bearing).toBe(45)
  })
})

describe('the tint is windToBeach, degree by degree', () => {
  it('matches the one onshore/offshore function for every facing tried', () => {
    for (const facing of [0, 37, 90, 133.5, 200, 359]) {
      const sectors = dialSectors(facing)
      expect(sectors.reduce((s, x) => s + (x.end - x.start), 0)).toBe(360)
      for (let b = 0; b < 360; b += 1) {
        const s = sectors.find((x) => (b >= x.start && b < x.end) || (b + 360 >= x.start && b + 360 < x.end))
        expect(s?.kind, `facing ${facing} bearing ${b}`).toBe(windToBeach(b + 0.5, facing))
      }
      /* Four runs: onshore, cross, offshore, cross. */
      expect(sectors.length).toBe(4)
    }
  })
  it('puts offshore at the land, behind the facing', () => {
    const off = dialSectors(90).find((s) => s.kind === 'offshore')
    expect(off).toBeDefined()
    expect(((off?.start ?? 0) + (off?.end ?? 0)) / 2).toBeCloseTo(270, 0)
  })
})

describe('beachLine', () => {
  it('runs square to the facing through the middle', () => {
    const l = beachLine(90)
    expect(l.x1).toBeCloseTo(DIAL_C, 6)
    expect(l.x2).toBeCloseTo(DIAL_C, 6)
    expect(Math.abs(l.y2 - l.y1)).toBeGreaterThan(2 * RING_R)
  })
})

describe('windFlip', () => {
  const at = (h: number) => new Date(Date.UTC(2026, 10, 2, h))
  it('finds the first hour that changes', () => {
    expect(windFlip([{ at: at(9), kind: 'offshore' }, { at: at(10), kind: null }, { at: at(11), kind: 'offshore' }, { at: at(14), kind: 'onshore' }, { at: at(15), kind: 'cross' }])).toEqual({ at: at(14), to: 'onshore' })
  })
  it('says nothing when it holds, or when nothing is known', () => {
    expect(windFlip([{ at: at(9), kind: 'cross' }, { at: at(10), kind: 'cross' }])).toBeNull()
    expect(windFlip([{ at: at(9), kind: null }])).toBeNull()
  })
})

describe('modelsAgreeing', () => {
  it('counts the models within AGREE_MPS of the median', () => {
    expect(modelsAgreeing([4, 5, 5.5, 6, 9], 5.5)).toEqual({ agree: 4, of: 5 })
    expect(modelsAgreeing([4, null, 5], 4.5)).toEqual({ agree: 2, of: 2 })
  })
  it('is null with nothing said', () => {
    expect(modelsAgreeing([null], 3)).toBeNull()
    expect(modelsAgreeing([3], null)).toBeNull()
  })
})

describe('hourIndexOf', () => {
  it('takes the hour holding now', () => {
    const hours = [0, 1, 2].map((h) => new Date(Date.UTC(2026, 10, 2, h)))
    expect(hourIndexOf(hours, new Date(Date.UTC(2026, 10, 2, 1, 20)))).toBe(1)
    expect(hourIndexOf(hours, new Date(Date.UTC(2026, 10, 2, 1, 40)))).toBe(2)
    expect(hourIndexOf(hours, new Date(Date.UTC(2026, 10, 2, 5)))).toBe(-1)
  })
})
