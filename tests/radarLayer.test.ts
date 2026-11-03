import { describe, expect, it } from 'vitest'
import { radarTemplate, sliderSteps } from '../src/lib/radarLayer.ts'

describe('the radar slider (Batch K, Section 6)', () => {
  it('the past hour and 90 minutes ahead, every 10 minutes', () => {
    const s = sliderSteps()
    expect(s[0]).toBe(-60)
    expect(s.at(-1)).toBe(90)
    expect(s.filter((m) => m > 0).length).toBe(9)
  })
  it('a frame is the composite at its own time', () => {
    expect(radarTemplate(new Date('2026-08-04T17:30:00Z'))).toBe('https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-202608041730/{z}/{x}/{y}.png')
  })
})
