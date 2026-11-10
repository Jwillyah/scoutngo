import { describe, expect, it } from 'vitest'
import { fixAmPm, livePeriod, periodEndMinutes } from '../src/core/marinePeriod.ts'

/* Batch QA, Section 0B (field 10 Nov 7:03 AM: "NWS marine · Through 7 Am"). */
describe('the NWS marine period now', () => {
  const TZ = 'America/New_York'
  const periods = [
    { name: 'Through 7 Am', detailedForecast: 'NE winds 10 to 15 kt. Seas 3 to 4 ft. A chance of showers through 7 am.' },
    { name: 'Today', detailedForecast: 'NE winds 10 kt. Seas 2 to 3 ft.' },
  ]
  it('a period that has ended is never shown: at 7:03 AM, Today', () => {
    expect(livePeriod(periods, new Date('2026-11-10T12:03:00Z'), TZ)?.period).toBe('Today')
  })
  it('before it ends it stands, with AM written AM', () => {
    const p = livePeriod(periods, new Date('2026-11-10T11:30:00Z'), TZ)
    expect(p?.period).toBe('Through 7 AM')
    expect(p?.text).toContain('through 7 AM')
  })
  it('the clock words', () => {
    expect(fixAmPm('until 10:30 pm, then 6 Am')).toBe('until 10:30 PM, then 6 AM')
    expect(fixAmPm('Rest of Today')).toBe('Rest of Today')
    expect(periodEndMinutes('Through 7 AM')).toBe(420)
    expect(periodEndMinutes('Until 12 PM')).toBe(720)
    expect(periodEndMinutes('Tonight')).toBeNull()
  })
})
