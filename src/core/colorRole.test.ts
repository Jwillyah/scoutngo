import { describe, expect, it } from 'vitest'
import { CHROME_TEAL, COLOR_ROLES, COLOR_RULE, roleOf } from './colorRole.ts'

/*
 * THE VALUES ARE CHECKED AGAINST tokens.css BY scripts/audit-colors.mjs, NOT HERE.
 *
 * This test tried to read the stylesheet and could not: vitest resolves a CSS
 * import to an EMPTY STRING, so every lookup returned null and nine tests went
 * red reporting "expected null". That is the "I could not look" failure, not a
 * real one, and a check that cannot tell those apart is worth less than no
 * check. The file read moved to an audit script, which runs in the commit
 * gate and reads the file as a file.
 *
 * What stays here is what is actually testable in isolation: the ROLES. The
 * rule is "teal is chrome, every other hue is data", and that is a property of
 * this table rather than of the paint.
 */

describe('the rule itself', () => {
  it('puts teal on the chrome side, and it is the app accent', () => {
    expect(roleOf('ocean')).toBe('chrome')
    expect(CHROME_TEAL).toBe('#2dd4bf')
    /* That it MATCHES tokens.css is scripts/audit-colors.mjs's job. */
    expect(COLOR_ROLES.find((e) => e.token === 'ocean')?.value).toBe(CHROME_TEAL)
  })

  it('puts every reading on the data side', () => {
    for (const token of ['sun', 'hazard', 'light-front', 'light-side', 'light-back']) {
      expect(roleOf(token)).toBe('data')
    }
  })

  it('never gives one token two roles', () => {
    const tokens = COLOR_ROLES.map((entry) => entry.token)
    expect(new Set(tokens).size).toBe(tokens.length)
  })

  it('keeps the chrome teal out of the data palette', () => {
    const data = COLOR_ROLES.filter((entry) => entry.role === 'data').map((e) => e.value)
    expect(data).not.toContain(CHROME_TEAL)
  })

  it('keeps every data hue distinct from every chrome hue', () => {
    const chrome = COLOR_ROLES.filter((e) => e.role === 'chrome').map((e) => e.value)
    const data = COLOR_ROLES.filter((e) => e.role === 'data').map((e) => e.value)
    for (const hue of data) expect(chrome).not.toContain(hue)
  })

  it('reserves red for hazards and nothing else', () => {
    const reds = COLOR_ROLES.filter((e) => e.value === '#ff3b30')
    expect(reds).toHaveLength(1)
    expect(reds[0]?.token).toBe('hazard')
  })

  it('returns null for a colour that is paper rather than meaning', () => {
    expect(roleOf('color-bg')).toBeNull()
    expect(roleOf('not-a-token')).toBeNull()
  })

  it('states the rule in one sentence the page can print', () => {
    expect(COLOR_RULE).toMatch(/teal is chrome/i)
    expect(COLOR_RULE).toMatch(/never styles a reading/i)
    expect(COLOR_RULE).toMatch(/never styles a control/i)
  })
})

describe('the three cone colours are three different colours', () => {
  /*
   * A cone is painted by its lighting classification, so if two of the three
   * were the same the map would be claiming a distinction it does not draw.
   */
  it('keeps front, side and back apart', () => {
    const cones = ['light-front', 'light-side', 'light-back'].map(
      (token) => COLOR_ROLES.find((e) => e.token === token)?.value,
    )
    expect(new Set(cones).size).toBe(3)
    for (const cone of cones) expect(cone).toBeDefined()
  })
})
