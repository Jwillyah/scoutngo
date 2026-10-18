import { describe, expect, it } from 'vitest'
import {
  BUILDINGS_COVERAGE_NOTE,
  METRES_PER_LEVEL,
  NOMINAL_DRAW_HEIGHT,
  parseBuildingHeight,
  parseHeightMetres,
} from './buildingHeight.ts'

describe('parsing an OSM height', () => {
  it('reads a bare number as metres, which is what the spec says', () => {
    expect(parseHeightMetres('12')).toBe(12)
    expect(parseHeightMetres('12.5')).toBe(12.5)
  })

  it('reads the unit when it is there', () => {
    expect(parseHeightMetres('12 m')).toBe(12)
    expect(parseHeightMetres('12m')).toBe(12)
    expect(parseHeightMetres('12 metres')).toBe(12)
  })

  /* Real data has both, and feet read as metres is a three-fold error. */
  it('converts feet, including the surveyor apostrophe', () => {
    expect(parseHeightMetres('40 ft')).toBeCloseTo(12.19, 2)
    expect(parseHeightMetres("39'")).toBeCloseTo(11.89, 2)
  })

  /*
   * NULL, NOT NaN AND NOT ZERO. A building of unknown height drawn as a box is
   * a box claiming to be measured.
   */
  it('refuses anything it cannot read', () => {
    for (const bad of ['', '  ', 'tall', 'about 12', '12-15', 'two storeys', '-5', '0']) {
      expect(parseHeightMetres(bad), bad).toBeNull()
    }
    expect(parseHeightMetres(undefined)).toBeNull()
  })
})

describe('what a building reports', () => {
  it('prefers a measured height and says so', () => {
    const h = parseBuildingHeight({ height: '24' })
    expect(h.metres).toBe(24)
    expect(h.source).toBe('height')
    expect(h.drawMetres).toBe(24)
  })

  it('falls back to levels and marks it as an assumption', () => {
    const h = parseBuildingHeight({ 'building:levels': '4' })
    expect(h.metres).toBe(4 * METRES_PER_LEVEL)
    expect(h.source).toBe('levels')
  })

  it('prefers a real height over levels when both are given', () => {
    const h = parseBuildingHeight({ height: '30', 'building:levels': '4' })
    expect(h.metres).toBe(30)
    expect(h.source).toBe('height')
  })

  /*
   * THE TWO NUMBERS ARE DELIBERATELY DIFFERENT. drawMetres exists so a box has
   * a size; metres stays null so the shadow and sightline work cannot read an
   * invented obstruction. This is the assertion that keeps them apart.
   */
  it('draws an unmapped building without claiming to know its height', () => {
    const h = parseBuildingHeight({})
    expect(h.metres).toBeNull()
    expect(h.source).toBe('unknown')
    expect(h.drawMetres).toBe(NOMINAL_DRAW_HEIGHT)
    expect(h.drawMetres).toBeGreaterThan(0)
  })

  it('reads a podium base', () => {
    expect(parseBuildingHeight({ height: '40', min_height: '10' }).baseMetres).toBe(10)
    expect(parseBuildingHeight({ 'building:levels': '8', 'building:min_level': '2' }).baseMetres).toBe(
      2 * METRES_PER_LEVEL,
    )
  })

  it('has no base when none is given', () => {
    expect(parseBuildingHeight({ height: '40' }).baseMetres).toBe(0)
  })
})

/* Same rule as the hazard layer: say what is mapped, never imply clear. */
describe('the coverage note', () => {
  it('says an undrawn building is unmapped, not absent', () => {
    expect(BUILDINGS_COVERAGE_NOTE).toContain('nobody has mapped')
    expect(BUILDINGS_COVERAGE_NOTE).toContain('not an empty lot')
  })

  it('says a missing height is nominal rather than measured', () => {
    expect(BUILDINGS_COVERAGE_NOTE).toContain('nominal box')
  })

  it('never implies the ground is clear', () => {
    const lower = BUILDINGS_COVERAGE_NOTE.toLowerCase()
    for (const banned of ['clear', 'no obstruction', 'nothing in the way', 'empty ground']) {
      expect(lower, banned).not.toContain(banned)
    }
  })
})
