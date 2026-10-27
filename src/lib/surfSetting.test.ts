import { describe, expect, it } from 'vitest'
import { showSurf, SURF_COAST_M } from './surfSetting.ts'

describe('who sees the surf row', () => {
  it('Auto: within 2 km of the ocean only; inland never', () => {
    expect(showSurf('auto', 40)).toBe(true)
    expect(showSurf('auto', SURF_COAST_M)).toBe(true)
    expect(showSurf('auto', SURF_COAST_M + 1)).toBe(false)
    expect(showSurf('auto', null)).toBe(false)
  })
  it('Always and Off do what they say', () => {
    expect(showSurf('always', null)).toBe(true)
    expect(showSurf('off', 0)).toBe(false)
  })
})
