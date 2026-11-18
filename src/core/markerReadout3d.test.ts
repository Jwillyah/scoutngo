import { describe, expect, it } from 'vitest'
import { AVOID_PAD, readoutBeside, stationLine, stationParts, windLines, type ReadoutIn, type Rect } from './markerReadout.ts'

/*
 * Batch 3D, Section 4.2: at 390 x 664 (the phone with the browser's bars) the
 * card beside a marker near the top covered the layer chip, "Wind · Blend ·
 * surface", the pill under the search (src/styles/timeline.css .lmark-source,
 * top = safe-top + 8 + 52 + 6). Its box is an obstacle now.
 */
describe('the readout keeps off the layer chip', () => {
  const chip: Rect = { x: 75, y: 66, w: 240, h: 26 }
  const base: ReadoutIn = { px: 195, py: 70, w: 200, h: 70, boxW: 390, boxH: 664, gap: 30, edge: 8, avoid: [chip] }
  const overlaps = (r: ReadoutIn, o: Rect) => {
    const at = readoutBeside(r)
    const w = at.maxWidth ?? r.w
    return at.x < o.x + o.w && at.x + w > o.x && at.y < o.y + o.h && at.y + r.h > o.y
  }
  it('without the chip as an obstacle the card covers it (the bug)', () => {
    expect(overlaps({ ...base, avoid: [] }, chip)).toBe(true)
  })
  it('with it, the card moves up or down beside the marker and touches nothing', () => {
    const at = readoutBeside(base)
    expect(overlaps(base, chip)).toBe(false)
    expect(at.y + base.h <= chip.y - AVOID_PAD || at.y >= chip.y + chip.h + AVOID_PAD).toBe(true)
    expect(at.y).toBeGreaterThanOrEqual(base.edge)
    expect(at.y + base.h).toBeLessThanOrEqual(base.boxH - base.edge)
  })
  it('across the map, at every marker height and width, it never covers the chip nor the marker', () => {
    for (let py = 0; py <= 664; py += 8) {
      for (const px of [40, 195, 350]) {
        for (const w of [90, 160, 230]) {
          const r = { ...base, px, py, w }
          const at = readoutBeside(r)
          expect(overlaps(r, chip), `px ${px} py ${py} w ${w}`).toBe(false)
          const cw = at.maxWidth ?? w
          expect(at.x >= px + 22 || at.x + cw <= px - 22, `marker px ${px} py ${py}`).toBe(true)
        }
      }
    }
  })
  it('the rail\'s compass is kept clear too (the 390 x 664 contact sheet, 17 Nov: the card on the right covered it)', () => {
    const compass: Rect = { x: 334, y: 110, w: 44, h: 44 }
    const r: ReadoutIn = { ...base, px: 190, py: 140, w: 150, h: 84, avoid: [chip, compass] }
    expect(overlaps({ ...r, avoid: [chip] }, compass)).toBe(true)
    expect(overlaps(r, compass)).toBe(false)
    expect(overlaps(r, chip)).toBe(false)
  })
  it('where it already clears the chip it does not move', () => {
    expect(readoutBeside({ ...base, py: 350 }).y).toBe(readoutBeside({ ...base, py: 350, avoid: [] }).y)
  })
})

/* Batch 3D, Section 4.3: the lines split where a phone would wrap them badly ("cross-/shore here", "14 / min ago"). */
describe('the wind and station lines split cleanly', () => {
  it('line 1 is the value, line 2 the side to the beach on its own', () => {
    expect(windLines(5.2, 22.5, 6.3, 'kt', 'cross')).toEqual(['5 kt NNE · g6', 'cross-shore'])
    expect(windLines(5.2, 22.5, 6.3, 'kt', 'offshore')).toEqual(['5 kt NNE · g6', 'offshore'])
    expect(windLines(5.2, 22.5, 6.3, 'kt', null)).toEqual(['5 kt NNE · g6'])
    expect(windLines(null, null, null, 'kt', null)).toEqual(['— kt'])
  })
  it('no "here" glued to the side, no side word inside line 1', () => {
    for (const l of windLines(9, 0, 12, 'kt', 'cross')) expect(l).not.toMatch(/here/)
    expect(windLines(9, 0, 12, 'kt', 'cross')[0]).not.toMatch(/shore/)
  })
  it('the station line is a name and a reading with its age, the age inside the part that is never cut', () => {
    expect(stationParts('Cape Henry', 14.2, 20, 'kt', '14 min ago')).toEqual({ name: 'Cape Henry', rest: '14 kt NNE · 14 min ago' })
    expect(stationParts('KNTU', 0.4, null, 'kt', '1 h ago')).toEqual({ name: 'KNTU', rest: 'calm · 1 h ago' })
    expect(stationParts('KNTU', 5, null, 'kt', null)).toEqual({ name: 'KNTU', rest: '5 kt var' })
    const p = stationParts('Cape Henry', 14, 20, 'kt', '14 min ago')
    expect(stationLine('Cape Henry', 14, 20, 'kt', '14 min ago')).toBe(`${p.name} ${p.rest}`)
  })
})
