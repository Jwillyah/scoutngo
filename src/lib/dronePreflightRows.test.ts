import { describe, expect, it } from 'vitest'
import type { PreflightRow } from '../core/dronePreflight.ts'
import { preflightHeadline, preflightTapRows, splitLine } from './dronePreflightRows.ts'

const R = (key: PreflightRow['key'], tone: PreflightRow['tone'], line: string): PreflightRow => ({ key, label: key, tone, line })
const ROWS: PreflightRow[] = [
  R('airspace', 'amber', 'Class C · ceiling 100 ft · LAANC needed'),
  R('wind', 'green', '8 kt against your 23 kt limit'),
  R('gusts', 'green', '12 kt against your 23 kt limit'),
  R('battery', 'green', '~37 min · 40 min rated · 46°F'),
  R('sunset', 'green', 'Sunset 4:52 PM · 3 h 1 min away'),
  R('tfr', 'green', '0 TFRs within 20 mi'),
  R('remoteid', 'green', 'Broadcast needed here'),
  R('kp', 'green', 'Kp 2 · quiet'),
]

describe('Drone Preflight rows', () => {
  it('counts the amber rows and names them', () => {
    const h = preflightHeadline(ROWS)
    expect(h.value).toBe('1 to check')
    expect(h.sub).toBe('Airspace needs a look')
    expect(preflightHeadline([R('airspace', 'amber', 'x'), R('tfr', 'amber', 'y')]).sub).toBe('Airspace · TFRs need a look')
  })
  it('zero to check is not an approval', () => {
    const h = preflightHeadline(ROWS.map((r) => ({ ...r, tone: 'green' as const })))
    expect(h.value).toBe('0 to check')
    expect(h.sub).toMatch(/not an approval/)
    expect(`${h.value} ${h.sub}`).not.toMatch(/\b(safe|clear|legal|go)\b/i)
  })
  it('eight rows, in the board’s order and words', () => {
    const rows = preflightTapRows(ROWS, () => undefined)
    expect(rows.map((r) => r.label)).toEqual(['Airspace', 'Wind 400 ft', 'Gusts', 'Battery', 'Sunset', 'TFRs', 'Remote ID', 'Kp'])
    expect(rows.map((r) => r.dot)).toEqual(['caution', 'good', 'good', 'good', 'good', 'good', 'good', 'good'])
  })
  it('only Airspace and Wind open a tab', () => {
    const asked: string[] = []
    const rows = preflightTapRows(ROWS, (t) => asked.push(t))
    expect(rows.map((r) => r.onClick !== undefined)).toEqual([true, true, false, false, false, false, false, false])
    rows[0].onClick?.()
    rows[1].onClick?.()
    expect(asked).toEqual(['airspace', 'wind'])
  })
  it('puts the wind against the limit as the board does', () => {
    expect(splitLine('8 kt against your 23 kt limit')).toEqual({ value: '8 kt', detail: 'limit 23 kt' })
  })
  it('splits the bold fact from its detail, and keeps a line with no separator whole', () => {
    expect(splitLine('Class C · ceiling 100 ft · LAANC needed')).toEqual({ value: 'Class C', detail: 'ceiling 100 ft · LAANC needed' })
    expect(splitLine('The forecast did not say')).toEqual({ value: 'The forecast did not say' })
  })
})
