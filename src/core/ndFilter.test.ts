import { describe, expect, it } from 'vitest'
import { ndFor, ndSwapTimes, type NdQuery } from './ndFilter.ts'

const base: NdQuery = { minutesBeforeSunset: 300, sky: 'full-sun', mode: 'default', overWater: false }

describe('the table, row by row', () => {
  it('full sun midday: ND64', () => {
    expect(ndFor(base).nd).toBe('ND64')
  })
  it('4K30 in full sun: ND128', () => {
    expect(ndFor({ ...base, mode: '4k30' }).nd).toBe('ND128')
  })
  it('hazy: ND32', () => {
    expect(ndFor({ ...base, sky: 'hazy' }).nd).toBe('ND32')
  })
  it('1 to 2 h before sunset: ND32, then ND16', () => {
    expect(ndFor({ ...base, minutesBeforeSunset: 100 }).nd).toBe('ND32')
    expect(ndFor({ ...base, minutesBeforeSunset: 45 }).nd).toBe('ND16')
  })
  it('last 30 minutes: ND8', () => {
    expect(ndFor({ ...base, minutesBeforeSunset: 20 }).nd).toBe('ND8')
  })
  it('after sunset: none', () => {
    expect(ndFor({ ...base, minutesBeforeSunset: -5 })).toEqual({ nd: null, reason: 'After sunset: no ND.' })
  })
  it('the evening bands do not change with the sky or the mode, as given', () => {
    for (const m of [100, 45, 20]) {
      const plain = ndFor({ ...base, minutesBeforeSunset: m }).nd
      expect(ndFor({ ...base, minutesBeforeSunset: m, sky: 'hazy', mode: '4k30' }).nd).toBe(plain)
    }
  })
})

describe('over water, one stop denser', () => {
  it('doubles the filter', () => {
    expect(ndFor({ ...base, overWater: true }).nd).toBe('ND128')
    expect(ndFor({ ...base, minutesBeforeSunset: 20, overWater: true }).nd).toBe('ND16')
    expect(ndFor({ ...base, sky: 'hazy', overWater: true }).nd).toBe('ND64')
  })
  it('stops at ND128 and says why', () => {
    const a = ndFor({ ...base, mode: '4k30', overWater: true })
    expect(a.nd).toBe('ND128')
    expect(a.reason).toContain('ND256')
  })
  it('is still none after sunset', () => {
    expect(ndFor({ ...base, minutesBeforeSunset: -1, overWater: true }).nd).toBeNull()
  })
})

describe('swap times for a run of show', () => {
  const sunset = new Date('2026-10-26T22:05:00Z')
  it('lists each change from three hours out to sunset', () => {
    const swaps = ndSwapTimes(sunset, 'full-sun', 'default', false)
    expect(swaps.map((s) => s.nd)).toEqual(['ND64', 'ND32', 'ND16', 'ND8', null])
    expect(swaps.map((s) => s.at.toISOString())).toEqual([
      '2026-10-26T19:05:00.000Z',
      '2026-10-26T20:05:00.000Z',
      '2026-10-26T21:05:00.000Z',
      '2026-10-26T21:35:00.000Z',
      '2026-10-26T22:05:00.000Z',
    ])
  })
  it('collapses bands that answer the same', () => {
    /* Hazy midday is ND32 and so is the first evening band: one entry, not two. */
    expect(ndSwapTimes(sunset, 'hazy', 'default', false).map((s) => s.nd)).toEqual(['ND32', 'ND16', 'ND8', null])
  })
  it('says no reason is empty', () => {
    for (const s of ndSwapTimes(sunset, 'full-sun', '4k30', true)) expect(s.reason).not.toBe('')
  })
})
