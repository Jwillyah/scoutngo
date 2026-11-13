import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { NOW_SPAN_MIN, nowWindow } from '../src/core/nowWindow.ts'

/* Batch NOW, Section 5: the planner's WHEN step opens on Now; the search says what it finds. */
const setup = readFileSync('src/components/SetupMode.tsx', 'utf8')

describe('Now in the planner', () => {
  it('this minute at the venue, on its own clock, for an hour', () => {
    expect(nowWindow(new Date('2026-11-13T14:40:30Z'), 36.84, -75.97)).toEqual({ date: '2026-11-13', startTime: '09:40', endTime: '10:40' })
    expect(NOW_SPAN_MIN).toBe(60)
  })
  it('never past midnight', () => {
    expect(nowWindow(new Date('2026-11-14T04:30:00Z'), 36.84, -75.97)).toEqual({ date: '2026-11-13', startTime: '23:30', endTime: '23:59' })
  })
  it('Now first, picked by default; a tap on it goes straight to the plan; the others under it', () => {
    expect(setup).toMatch(/const \[whenNow, setWhenNow\] = useState\(true\)/)
    expect(setup.indexOf('data-when-now')).toBeLessThan(setup.indexOf("(['sunrise', 'sunset', 'daytime'] as const)"))
    expect(setup).toMatch(/const goNow = \(\) => \{\n    if \(applyNow\(\)\) onDone\(\)/)
  })
  it('the search field says "Search a spot or place"', () => {
    expect(setup).toMatch(/label="Search a spot or place"/)
    expect(setup).not.toMatch(/Where's the shoot/)
  })
})
