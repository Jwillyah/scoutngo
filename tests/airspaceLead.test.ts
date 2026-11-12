import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { airspaceCard, airspaceLead, detailLines, TODAY_LINE, type AirspaceAtPoint } from '../src/core/airspaceCard.ts'

/* Batch TRUTH, Section 6: the sheet leads with one line; the 250 ft ceiling and today's restrictions said once. */
const at = (over: Partial<AirspaceAtPoint>): AirspaceAtPoint => ({ classes: [], gridCeilingFeet: null, parks: [], specialUse: [], droneFeet: 400, ...over }) as AirspaceAtPoint

describe('one line first', () => {
  it('"Controlled · LAANC up to 250 ft here"', () => {
    const lines = airspaceCard(at({ classes: ['D'], gridCeilingFeet: 250 }))
    expect(airspaceLead(lines, 250)).toBe('Controlled · LAANC up to 250 ft here')
    const rest = detailLines(lines)
    expect(rest.some((l) => /250/.test(l.text + l.detail))).toBe(false)
    expect(rest).not.toContain(TODAY_LINE)
  })
  it('a zero cell, no cell, and nothing marked (never "clear")', () => {
    expect(airspaceLead(airspaceCard(at({ classes: ['C'], gridCeilingFeet: 0 })), 0)).toBe('Controlled · 0 ft grid: no LAANC here')
    expect(airspaceLead(airspaceCard(at({ classes: ['D'], gridCeilingFeet: null })), null)).toBe('Controlled · LAANC, no grid ceiling here')
    const none = airspaceLead(airspaceCard(at({})), null)
    expect(none).toBe('Nothing the app holds is marked here')
    expect(none).not.toMatch(/clear|safe/i)
  })
  it('the switch is the app\'s toggle, not a bare checkbox', () => {
    const panel = readFileSync('src/components/AirspacePanel.tsx', 'utf8')
    expect(panel).toMatch(/<Toggle on=\{laanc\} label="I have LAANC here"/)
    expect(panel).not.toMatch(/type="checkbox"/)
    expect(panel).toMatch(/titleName\(hit\.name\)/)
    expect(panel).toMatch(/upperWords\(hit\.upper, hit\.upperUom\)/)
  })
})
