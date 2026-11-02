import { describe, expect, it } from 'vitest'
import { CHECK_AIRSPACE, flightWarnings, ladderMarks, warningLine } from '../src/core/flightWarnings.ts'
import { facilityCellAt } from '../src/lib/uasfm.ts'

/* No height cap in the practice flight: warnings instead (Batch I, Section 5). */
const NONE = { altFt: 120, cell: null, shapes: [] }

describe('the practice flight warns, and never says safe', () => {
  it('above 400 ft: the Part 107 line, practice only', () => {
    expect(warningLine({ ...NONE, altFt: 520 }).line).toBe('Above 400 ft · Part 107 limit is 400 ft above ground. Practice only.')
  })

  it('inside Class D: the airport, the grid ceiling, needs LAANC; before the height', () => {
    const w = flightWarnings({ altFt: 500, cell: { ceilingFeet: 200, classes: ['D'], icao: 'KNTU', facility: 'NAS Oceana' }, shapes: [] })
    expect(w.map((x) => x.kind)).toEqual(['airspace', 'height'])
    expect(w[0].line).toBe('Inside Class D · NAS Oceana · grid ceiling here 200 ft · needs LAANC')
  })

  it('Class E is not a LAANC area here; nothing: the reminder, not "clear"', () => {
    expect(warningLine({ altFt: 120, cell: { ceilingFeet: 400, classes: ['E'], icao: null, facility: null }, shapes: [] })).toEqual({ line: CHECK_AIRSPACE, warn: false })
    expect(warningLine(NONE).line).not.toMatch(/safe|clear/i)
  })

  it('the ladder marks 400 ft and the grid ceiling', () => {
    expect(ladderMarks({ ceilingFeet: 200, classes: ['D'], icao: null, facility: null })).toEqual([
      { ft: 200, label: 'grid 200' },
      { ft: 400, label: '400 ft' },
    ])
    expect(ladderMarks(null)).toEqual([{ ft: 400, label: '400 ft' }])
  })

  it('the baked grid answers near NAS Oceana', () => {
    const cell = facilityCellAt(36.8207, -76.0335)
    expect(cell).not.toBeNull()
    expect(cell?.classes.length).toBeGreaterThan(0)
  })
})
