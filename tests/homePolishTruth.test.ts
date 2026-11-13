import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { sideShort, sideSpanWords, weekHeadline, weekPill } from '../src/core/homeDay.ts'

/* Batch TRUTH, Section 4: the home and the week, from the 12 Nov screenshots. */
const NY = 'America/New_York'

describe('the week: the best line and the pills read one call', () => {
  it('"Best this week: Tue fish · Wed drone" never sits over Tue and Wed saying Skip', () => {
    const rows = [
      { day: 'Tue', worth: 'fish' as const, sunset: 'Skip' as const },
      { day: 'Wed', worth: 'drone' as const, sunset: 'Skip' as const },
      { day: 'Thu', worth: null, sunset: 'Maybe' as const },
    ]
    expect(weekHeadline(rows.filter((r) => r.worth !== null).map((r) => ({ day: r.day, what: r.worth as string })))).toBe('Best this week: Tue fish · Wed drone')
    expect(rows.map((r) => weekPill(r.worth, r.sunset, true)?.word)).toEqual(['Calm', 'Drone', 'Maybe'])
    expect(weekPill('fish', 'Skip', true)?.tone).toBe('go')
    expect(weekPill(null, 'Skip', false)).toBeNull()
  })
})

describe('the wind card\'s side line fits two lines', () => {
  it('"cross-off · offshore 9a", not "cross-shore until 9 AM" over three', () => {
    /* Batch NOW, Section 2.4: one line, an arrow to the turn. */
    expect(sideSpanWords('Cross-offshore', { tag: 'Offshore', at: new Date('2026-11-13T14:00:00Z') }, NY)).toBe('cross-off → offshore 9a')
    expect(sideSpanWords('Cross', { tag: 'Onshore', at: new Date('2026-11-13T19:30:00Z') }, NY)).toBe('cross → onshore 2:30p')
    expect(sideSpanWords('Offshore', { tag: 'Cross', at: new Date('2026-11-13T22:00:00Z') }, NY)).toBe('offshore → cross-shore 5p')
    expect(sideSpanWords('Offshore', null, NY)).toBe('offshore all day')
    expect(sideShort('Cross-onshore')).toBe('cross-on')
  })
})

describe('the home\'s rows and bottom', () => {
  const home = readFileSync('src/components/Home.tsx', 'utf8')
  it('the Next row is the Next line alone; the cams open from the menu', () => {
    expect(home).not.toMatch(/hcams--next/)
    expect(home).toMatch(/<p className="hnext">\{nextText\}<\/p>/)
    expect(readFileSync('src/components/Menu.tsx', 'utf8')).toMatch(/<Row label="Cams"/)
  })
  it('tomorrow\'s charts: no "now" line, and the marks start the day', () => {
    expect(home).toMatch(/dayStart: which === 'tomorrow'/)
    expect(home.match(/\{which === 'today' \? <line x1="1" x2="1"/g)?.length).toBe(2)
  })
  it('"steady" in the title, not over the chart', () => {
    expect(home).not.toMatch(/hcard__steady/)
    expect(home).toMatch(/title = 'Surf · next 24 h · steady'/)
  })
  it('the document wears the ground\'s bottom colour under the home indicator', () => {
    const css = readFileSync('src/styles/look-d.css', 'utf8')
    for (const g of ['night', 'day', 'golden', 'cloud', 'rain', 'fog']) expect(css).toContain(`html:has(.home--${g}) body`)
    expect(css).toContain('html:has(.mode-plan) body')
  })
})
