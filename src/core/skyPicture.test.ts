import { describe, expect, it } from 'vitest'
import { azToX, deckY, GAP_WIDTH, PICTURE_HORIZON_Y, PICTURE_TOP_Y, skyPicture } from './skyPicture.ts'

/* Batch SIMPLE-2, Section 4 (mockup Sky_Tonight): the drawn sky, from the computed state only. */
const WSW = 247

describe('the sky picture', () => {
  it('no sun azimuth: no picture, never a guessed one', () => {
    expect(skyPicture({ sunAzDeg: null, sunAltDeg: null, deck: null, gap: null })).toBeNull()
  })

  it('is centred on the sun, S to NW for a WSW sunset, the points along the horizon', () => {
    const p = skyPicture({ sunAzDeg: WSW, sunAltDeg: -0.8, deck: null, gap: null })!
    expect(Math.round(p.fromDeg)).toBe(180)
    expect(Math.round(p.toDeg)).toBe(315)
    expect(p.sun).toEqual({ x: 0.5, y: PICTURE_HORIZON_Y, label: 'WSW' })
    expect(p.ticks.map((t) => t.label)).toEqual(['S', 'SW', 'WSW', 'W'])
    expect(p.ticks.find((t) => t.label === 'S')?.x).toBeCloseTo(azToX(180, WSW))
    expect(p.ticks.every((t) => t.x >= 0 && t.x <= 1)).toBe(true)
    expect(p.ticks.map((t) => t.x)).toEqual([...p.ticks.map((t) => t.x)].sort((a, b) => a - b))
    /* No deck, no gap: nothing drawn the state does not say. */
    expect(p.deck).toBeNull()
    expect(p.gap).toBeNull()
  })

  it('wraps through north: centred on 20° it spans 312.5° to 87.5°, N inside it', () => {
    const p = skyPicture({ sunAzDeg: 20, sunAltDeg: -0.8, deck: null, gap: null })!
    expect(p.fromDeg).toBeCloseTo(312.5)
    expect(p.toDeg).toBeCloseTo(87.5)
    expect(p.ticks.map((t) => t.label)).toEqual(['NW', 'N', 'NNE', 'NE'])
    expect(azToX(359, 10)).toBeCloseTo(0.5 - 11 / 135)
  })

  it('a deck at its base: higher is higher on the picture, by the side view’s square root', () => {
    const low = deckY(1500)
    const mid = deckY(5500)
    const high = deckY(25_000)
    expect(low).toBeLessThan(PICTURE_HORIZON_Y)
    expect(mid).toBeLessThan(low)
    expect(high).toBeLessThan(mid)
    expect(deckY(1_000_000)).toBeCloseTo(PICTURE_TOP_Y)
    expect(deckY(0)).toBeCloseTo(PICTURE_HORIZON_Y)
  })

  it('the deck’s words: its base to the hundred feet, who reported it, lit or not', () => {
    const lit = skyPicture({ sunAzDeg: WSW, sunAltDeg: -0.8, deck: { baseFt: 5480, lit: true, by: null }, gap: 'open' })!
    expect(lit.deck?.label).toBe('deck 5,500 ft · lit from below')
    expect(lit.deck?.lit).toBe(true)
    const seen = skyPicture({ sunAzDeg: WSW, sunAltDeg: -0.8, deck: { baseFt: 10000, lit: false, by: 'KNTU' }, gap: null })!
    expect(seen.deck?.label).toBe('KNTU deck 10,000 ft · not lit')
  })

  it('the gap: a window toward the sun as wide as it is open, under the deck, above the horizon', () => {
    const deck = { baseFt: 5500, lit: true, by: null }
    const open = skyPicture({ sunAzDeg: WSW, sunAltDeg: -0.8, deck, gap: 'open' })!
    expect(open.gap?.label).toBe('gap WSW')
    expect(open.gap?.w).toBe(GAP_WIDTH.open)
    expect(open.gap!.x + open.gap!.w / 2).toBeCloseTo(open.sun.x)
    expect(open.gap!.top).toBeGreaterThan(open.deck!.y)
    expect(open.gap!.top).toBeLessThan(PICTURE_HORIZON_Y)
    const part = skyPicture({ sunAzDeg: WSW, sunAltDeg: -0.8, deck, gap: 'partial' })!
    expect(part.gap?.label).toBe('part gap WSW')
    expect(part.gap!.w).toBeLessThan(open.gap!.w)
    expect(skyPicture({ sunAzDeg: WSW, sunAltDeg: -0.8, deck, gap: 'closed' })!.gap).toBeNull()
    /* A gap with no deck over it is no gap to draw. */
    expect(skyPicture({ sunAzDeg: WSW, sunAltDeg: -0.8, deck: null, gap: 'open' })!.gap).toBeNull()
    /* A deck on the sea still leaves its window above the horizon. */
    const sea = skyPicture({ sunAzDeg: WSW, sunAltDeg: -0.8, deck: { baseFt: 200, lit: true, by: null }, gap: 'open' })!
    expect(sea.gap!.top).toBeLessThan(PICTURE_HORIZON_Y)
  })

  it('the sun climbs off the horizon by its height, and never above the middle', () => {
    const up = skyPicture({ sunAzDeg: 120, sunAltDeg: 5, deck: null, gap: null })!
    expect(up.sun.y).toBeLessThan(PICTURE_HORIZON_Y)
    expect(skyPicture({ sunAzDeg: 120, sunAltDeg: 60, deck: null, gap: null })!.sun.y).toBe(0.5)
  })
})
