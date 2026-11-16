import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { AIR_SAFETY, WATER_SAFETY } from '../src/core/safetyWords.ts'

/*
 * THE SAFETY LINES (Batch DRONE, Section 0.3; CORE's Section 0.4, reverted).
 * CORE put the water line at the end of every detail page's scroll and the
 * Wind page, which fits 390 x 844 standalone with nothing to scroll, then
 * scrolled (the wind audit's strike). It now sits in the page's foot, beside
 * "How we got this", inside the link's own 44 px. The shells are portals and
 * do not render on the server: their source is read.
 */
describe('the safety lines', () => {
  it('say these words, and never safe or clear', () => {
    expect(AIR_SAFETY).toBe('Not an official FAA source · check B4UFLY/LAANC before you fly')
    expect(WATER_SAFETY).toBe('Forecasts can be wrong · look before you go in')
    for (const w of [AIR_SAFETY, WATER_SAFETY]) expect(w).not.toMatch(/\b(safe|clear)\b/i)
  })
  it('the water line is in the detail foot, not the scroll', () => {
    const src = readFileSync('src/components/DetailShell.tsx', 'utf8')
    const foot = src.slice(src.indexOf('className="dpage__foot"'), src.indexOf('{howOpen ?'))
    expect(foot).toContain('<p className="dpage__safety">{WATER_SAFETY}</p>')
    const body = src.slice(src.indexOf('className="dpage__body"'), src.indexOf('className="dpage__foot"'))
    expect(body).not.toContain('WATER_SAFETY')
  })
  it('the air line is on the drone page, the airspace panel and the Fly airspace banner', () => {
    expect(readFileSync('src/components/DronePage.tsx', 'utf8')).toContain('safety={AIR_SAFETY}')
    expect(readFileSync('src/components/AirspacePanel.tsx', 'utf8')).toContain('<p className="dsafety">{AIR_SAFETY}</p>')
    expect(readFileSync('src/components/FlyControls.tsx', 'utf8')).toContain('<span className="fly__remind-src">{AIR_SAFETY}</span>')
  })
})
