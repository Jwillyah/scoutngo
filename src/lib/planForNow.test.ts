import { describe, expect, it } from 'vitest'
import { CALIBRATION_VENUE } from './venue.ts'
import { planForNow } from './planForNow.ts'

const PIER = { ...CALIBRATION_VENUE, latitude: '36.8435575', longitude: '-75.9713104' }
/* 6:58 AM EDT on 27 Oct. */
const DAWN = new Date('2026-10-27T10:58:00Z')

describe('planForNow', () => {
  it('an afternoon window, seen at sunrise on the day: offered, today from this quarter hour, same length', () => {
    expect(planForNow({ ...PIER, date: '2026-10-27', startTime: '15:00', endTime: '19:00' }, DAWN)).toEqual({
      date: '2026-10-27',
      startTime: '06:45',
      endTime: '10:45',
    })
  })

  it('a window that has passed today: offered', () => {
    expect(planForNow({ ...PIER, date: '2026-10-27', startTime: '05:00', endTime: '06:30' }, DAWN)?.startTime).toBe('06:45')
  })

  it('a day already gone: offered, on today', () => {
    expect(planForNow({ ...PIER, date: '2026-10-26', startTime: '06:30', endTime: '08:00' }, DAWN)?.date).toBe('2026-10-27')
  })

  it('now inside the window: nothing', () => {
    expect(planForNow({ ...PIER, date: '2026-10-27', startTime: '06:30', endTime: '08:00' }, DAWN)).toBeNull()
  })

  it('later this morning: still the plan', () => {
    expect(planForNow({ ...PIER, date: '2026-10-27', startTime: '09:00', endTime: '11:00' }, DAWN)).toBeNull()
  })

  it('a shoot on a later day: nothing', () => {
    expect(planForNow({ ...PIER, date: '2026-10-30', startTime: '15:00', endTime: '19:00' }, DAWN)).toBeNull()
  })

  it('never runs past midnight', () => {
    const late = new Date('2026-10-28T03:20:00Z') /* 11:20 PM EDT on the 27th */
    expect(planForNow({ ...PIER, date: '2026-10-27', startTime: '06:00', endTime: '10:00' }, late)).toEqual({
      date: '2026-10-27',
      startTime: '23:15',
      endTime: '23:59',
    })
  })
})
