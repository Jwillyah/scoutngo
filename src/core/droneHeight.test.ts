import { describe, expect, it } from 'vitest'
import { DRONE_LIGHT_RATIO } from './briefing.ts'
import { gridLegend, GRID_ROWS_FT, heightGrid, windAtRow } from './droneHeight.ts'
import { windAtFeet } from './homeCards.ts'

const KT = 0.514444
const hours = Array.from({ length: 8 }, (_, i) => ({ at: new Date(Date.UTC(2026, 10, 16, 15 + i)), mps10: 4 + i * 0.1, mps120: 8 + i }))

describe('the wind by height (board Drone_P2)', () => {
  it('has gnd, 100, 200, 300 and 400 ft, 400 at the top', () => {
    expect([...GRID_ROWS_FT]).toEqual([400, 300, 200, 100, 0])
  })

  it('uses the forecast’s 10 m and 120 m as they are, and the home’s log curve between', () => {
    expect(windAtRow(0, 4, 8)).toBe(4)
    expect(windAtRow(400, 4, 8)).toBe(8)
    expect(windAtRow(200, 4, 8)).toBe(windAtFeet(4, 8, 200))
  })

  it('puts the 250 ft LAANC line between the 300 and 200 ft rows', () => {
    const g = heightGrid(hours, 12, 250, null)
    expect(g.ceilingRow).toBe(2)
    expect(g.rows[g.ceilingRow!].ft).toBe(200)
  })

  it('draws no ceiling line at 400 ft or with no grid square', () => {
    expect(heightGrid(hours, 12, 400, null).ceilingRow).toBeNull()
    expect(heightGrid(hours, 12, null, null).ceilingRow).toBeNull()
  })

  it('marks the column holding sunset', () => {
    expect(heightGrid(hours, 12, null, new Date(Date.UTC(2026, 10, 16, 21, 53))).sunsetCol).toBe(6)
    expect(heightGrid(hours, 12, null, new Date(Date.UTC(2026, 10, 17, 21, 53))).sunsetCol).toBeNull()
  })

  it('colours each cell against the limit', () => {
    const g = heightGrid(hours, 12, null, null)
    const top = g.rows[0].cells.map((c) => c.role)
    expect(top[0]).toBe('near')
    expect(top[top.length - 1]).toBe('over')
    expect(g.rows[4].cells[0].role).toBe('calm')
  })

  it('writes the legend from the same line as the cells', () => {
    const toKt = (mps: number) => mps / KT
    expect(gridLegend(23 * KT, DRONE_LIGHT_RATIO, toKt)).toEqual({ calm: 'under 12', near: '12–22', over: 'at your limit 23' })
    expect(gridLegend(null, DRONE_LIGHT_RATIO, toKt)).toBeNull()
  })
})
