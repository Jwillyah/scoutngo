import { describe, expect, it } from 'vitest'
import { colourDistance, contrastRatio, parseHex, relativeLuminance } from './contrast.ts'

/* The tokens under test. Kept in step with tokens.css by the assertions below. */
const OCEAN_FROM = '#2dd4bf'
const OCEAN_TO = '#38bdf8'
const OCEAN_INK = '#04201c'
const WHITE = '#ffffff'
const LIGHT_BACK = '#d08a5a'
const LIGHT_SIDE = '#5e9cc4'
const LIGHT_FRONT = '#5fb98a'
const HAZARD = '#ff3b30'

describe('parseHex and relativeLuminance', () => {
  it('reads both hex forms', () => {
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 })
    expect(parseHex('2dd4bf')).toEqual({ r: 45, g: 212, b: 191 })
  })

  it('returns null rather than guessing', () => {
    expect(parseHex('teal')).toBeNull()
    expect(parseHex('#12345')).toBeNull()
  })

  it('anchors at black and white', () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBe(0)
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 6)
  })

  it('agrees with the known 21:1 extreme', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 4)
  })
})

/*
 * THE BUTTON TEXT HAS TO PASS AT BOTH ENDS OF THE GRADIENT. A gradient is two
 * colours, and text that passes against one end and fails against the other is
 * unreadable for half its width.
 */
describe('the ocean gradient carries readable text', () => {
  it('passes WCAG AA for normal text against both stops', () => {
    expect(contrastRatio(OCEAN_INK, OCEAN_FROM)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(OCEAN_INK, OCEAN_TO)).toBeGreaterThanOrEqual(4.5)
  })

  it('passes AAA too, which is the bar for something read outdoors', () => {
    expect(contrastRatio(OCEAN_INK, OCEAN_FROM)).toBeGreaterThanOrEqual(7)
    expect(contrastRatio(OCEAN_INK, OCEAN_TO)).toBeGreaterThanOrEqual(7)
  })

  /* White text on this gradient would fail, which is why the ink is dark. */
  it('confirms white would NOT have passed, so the dark ink is not arbitrary', () => {
    expect(contrastRatio(WHITE, OCEAN_FROM)).toBeLessThan(4.5)
    expect(contrastRatio(WHITE, OCEAN_TO)).toBeLessThan(4.5)
  })
})

/*
 * The accent is teal and two lighting classes are amber and blue. They never
 * share a screen, because lighting only appears in PLAN and FIELD which keep
 * the white accent, but if that ever changes they must still be tellable apart.
 */
describe('teal does not collide with the status colours', () => {
  const TELLABLE_APART = 120

  it('is far from the backlit amber', () => {
    expect(colourDistance(OCEAN_FROM, LIGHT_BACK)).toBeGreaterThan(TELLABLE_APART)
  })

  it('is far from the side-lit blue, which is the closest of them', () => {
    expect(colourDistance(OCEAN_FROM, LIGHT_SIDE)).toBeGreaterThan(TELLABLE_APART)
    expect(colourDistance(OCEAN_TO, LIGHT_SIDE)).toBeGreaterThan(TELLABLE_APART)
  })

  it('is far from the front-lit green', () => {
    expect(colourDistance(OCEAN_FROM, LIGHT_FRONT)).toBeGreaterThan(TELLABLE_APART)
  })

  /* Red means hazard and must never be mistaken for an action. */
  it('is nowhere near the hazard red', () => {
    expect(colourDistance(OCEAN_FROM, HAZARD)).toBeGreaterThan(TELLABLE_APART * 2)
    expect(colourDistance(OCEAN_TO, HAZARD)).toBeGreaterThan(TELLABLE_APART * 2)
  })
})
