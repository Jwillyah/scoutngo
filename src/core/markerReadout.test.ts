import { describe, expect, it } from 'vitest'
import { percentLine, readoutBeside, stationLine, swellLine, tideLines, windLine, type ReadoutIn } from './markerReadout.ts'

/* Batch FIX, Section 2.3: the card beside the marker, never on it. LayerMarker.tsx's gap and edge, a 390 x 700 map, the 44 px ring. */
describe('where the readout sits', () => {
  const base: ReadoutIn = { px: 195, py: 350, w: 200, h: 70, boxW: 390, boxH: 700, gap: 30, edge: 8 }
  const RING = 22
  /* The card's box and the ring's box share no pixel. */
  const apart = (r: ReadoutIn) => {
    const at = readoutBeside(r)
    const w = at.maxWidth ?? r.w
    const ringL = r.px - RING
    const ringR = r.px + RING
    return at.x >= ringR || at.x + w <= ringL
  }
  it('the old bug: a 200 px card on a marker in the middle of a 390 px phone fits on neither side, and is not put over it', () => {
    /* The old rule: x = max(EDGE, px - GAP - w) = max(8, -35) = 8, the card from 8 to 208 over a marker at 195. */
    const old = Math.max(8, base.px - base.gap - base.w)
    expect(old < base.px && old + base.w > base.px).toBe(true)
    const at = readoutBeside(base)
    expect(apart(base)).toBe(true)
    expect(at.maxWidth).toBe(157)
  })
  it('to the right when it fits there', () => {
    expect(readoutBeside({ ...base, px: 100 })).toEqual({ x: 130, y: 315, side: 'right', maxWidth: null })
  })
  it('to the left near the right edge', () => {
    expect(readoutBeside({ ...base, px: 340 })).toEqual({ x: 110, y: 315, side: 'left', maxWidth: null })
  })
  it('held inside the map top and bottom, and still beside', () => {
    expect(readoutBeside({ ...base, px: 100, py: 10 }).y).toBe(8)
    expect(readoutBeside({ ...base, px: 100, py: 695 }).y).toBe(622)
  })
  it('never on the marker, anywhere across the screen, for any card width', () => {
    for (let px = 0; px <= 390; px += 5) for (const w of [80, 150, 200, 260]) expect(apart({ ...base, px, w }), `px ${px} w ${w}`).toBe(true)
  })
})

/* The boards' readout (docs/mockups/Map_Timeline_Wind.png, Map_Timeline_Tide.png). */
describe('the marker readout', () => {
  it('wind: speed, where from, gusts', () => {
    expect(windLine(9.2, 337.5, 13, 'kt')).toBe('9 kt NNW · g13')
    expect(windLine(9, null, null, 'mph')).toBe('9 mph')
  })
  it('a dash, never a zero, when the forecast did not say', () => {
    expect(windLine(null, 10, 3, 'kt')).toBe('— kt')
    expect(percentLine(null, 'cloud')).toBe('— cloud')
    expect(tideLines(null, null, null)).toEqual(['— ft'])
  })
  it('swell at sea; nothing on land', () => {
    expect(swellLine(0.7, 12.2, 67.5)).toBe('swell 0.7 ft 12 s ENE')
    expect(swellLine(null, 12, 67.5)).toBeNull()
  })
  it('the nearest station with its age', () => {
    expect(stationLine('KNTU', 13, 0, 'kt', '1 h ago')).toBe('KNTU 13 kt N · 1 h ago')
    expect(stationLine('KNTU', 0.4, null, 'kt', null)).toBe('KNTU calm')
    expect(stationLine('KNTU', 5, null, 'kt', null)).toBe('KNTU 5 kt var')
  })
  it('tide: level, which way, the next turn', () => {
    expect(tideLines(2.44, 'falling', { kind: 'low', feet: 0.5, at: '2:24 PM' })).toEqual(['2.4 ft · falling', 'low 0.5 ft at 2:24 PM'])
    expect(tideLines(3, 'slack', null)).toEqual(['3.0 ft · turning'])
  })
  it('cloud and rain as a %', () => {
    expect(percentLine(62.4, 'cloud')).toBe('62% cloud')
    expect(percentLine(140, 'rain')).toBe('100% chance of rain')
  })
  it('never says safe or clear', () => {
    const all = [windLine(0, 0, 0, 'kt'), percentLine(0, 'cloud'), percentLine(0, 'rain'), stationLine('X', 0, 0, 'kt', null), ...tideLines(0, 'slack', null)].join(' ')
    expect(all).not.toMatch(/safe|clear/i)
  })
})
