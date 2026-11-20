import { describe, expect, it } from 'vitest'
import { readoutBeside, type ReadoutIn } from './markerReadout.ts'

/*
 * Batch SIMPLE-2, Section 5.5 (board Wind_Map): the marker's readout sits
 * beside the marker and never off the glass. Right of it; flipped to the left
 * near the right edge; held below the bar at the top (whose box starts under
 * the 47 px status bar in standalone) and above the sheet with the timeline.
 *
 * A 390 x 844 phone in standalone: the top bar ends at 47 + 60 = 107 px, the
 * sheet with the wind bar starts 210 px above the foot (634). LayerMarker's
 * gap 30 and edge 8; the board's card, about 228 x 64.
 */
const RING = 22
const phone: ReadoutIn = { px: 195, py: 420, w: 228, h: 64, boxW: 390, boxH: 844, gap: 30, edge: 8, top: 107, bottom: 210 }

/** Where the card is drawn, with the width it is held to. */
const card = (r: ReadoutIn) => {
  const at = readoutBeside(r)
  const w = at.maxWidth ?? r.w
  return { ...at, w, right: at.x + w, bottom: at.y + r.h }
}

describe('the readout beside the marker, Wind = the map', () => {
  it('right of a marker on the left half', () => {
    const c = card({ ...phone, px: 60 })
    expect(c.side).toBe('right')
    expect(c.x).toBe(60 + 30)
    expect(c.maxWidth).toBeNull()
  })

  it('flips to the left near the right edge, at its full width, inside the screen', () => {
    for (const px of [300, 330, 360, 382]) {
      const c = card({ ...phone, px })
      expect(c.side, `px ${px}`).toBe('left')
      expect(c.right, `px ${px}`).toBe(px - 30)
      expect(c.x, `px ${px}`).toBeGreaterThanOrEqual(8)
      expect(c.right, `px ${px}`).toBeLessThanOrEqual(390 - 8)
    }
  })

  it('never off the screen sideways and never on the marker, anywhere across it, for any card width', () => {
    for (let px = 0; px <= 390; px += 3) {
      for (const w of [120, 180, 228, 260]) {
        const c = card({ ...phone, px, w })
        expect(c.x, `px ${px} w ${w}`).toBeGreaterThanOrEqual(8)
        expect(c.right, `px ${px} w ${w}`).toBeLessThanOrEqual(390 - 8 + 1e-9)
        expect(c.x >= px + RING || c.right <= px - RING, `px ${px} w ${w}: on the marker`).toBe(true)
      }
    }
  })

  it('held below the bar and the status bar at the top', () => {
    for (const py of [0, 20, 60, 107, 130]) {
      const c = card({ ...phone, px: 60, py })
      expect(c.y, `py ${py}`).toBeGreaterThanOrEqual(107 + 8)
    }
    expect(card({ ...phone, px: 60, py: 20 }).y).toBe(115)
  })

  it('held above the sheet with the timeline at the foot', () => {
    for (const py of [600, 640, 700, 800, 844]) {
      const c = card({ ...phone, px: 60, py })
      expect(c.bottom, `py ${py}`).toBeLessThanOrEqual(844 - 210 - 8)
    }
    expect(card({ ...phone, px: 60, py: 800 }).y).toBe(844 - 210 - 8 - 64)
  })

  it('in the middle it sits centred on the marker, untouched by the bands', () => {
    expect(card({ ...phone, px: 60, py: 420 }).y).toBe(420 - 32)
  })

  it('without bands, the old rule: the map box edges (a browser tab, no sheet given)', () => {
    const { top: _t, bottom: _b, ...bare } = phone
    expect(readoutBeside({ ...bare, px: 60, py: 0 }).y).toBe(8)
    expect(readoutBeside({ ...bare, px: 60, py: 844 }).y).toBe(844 - 64 - 8)
  })

  it('a band taller than the room left keeps the card at the top of the room, never above the bar', () => {
    const c = card({ ...phone, px: 60, py: 400, top: 500, bottom: 330 })
    expect(c.y).toBe(508)
  })

  it('obstacles are dodged inside the bands, never by leaving them', () => {
    const chip = { x: 0, y: 108, w: 390, h: 30 }
    const c = card({ ...phone, px: 60, py: 120, avoid: [chip] })
    expect(c.y).toBeGreaterThanOrEqual(107 + 8)
    expect(c.y >= chip.y + chip.h || c.bottom <= chip.y).toBe(true)
  })
})
