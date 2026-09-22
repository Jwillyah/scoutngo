import { describe, expect, it } from 'vitest'
import {
  DEFAULT_END_TIME,
  DEFAULT_START_TIME,
  defaultVenue,
  localISODate,
  validateVenue,
} from './venue.ts'

describe('localISODate', () => {
  /*
   * The bug this exists to prevent: toISOString() is UTC, so west of Greenwich
   * it returns TOMORROW for most of the evening, and the date field opens on the
   * wrong day.
   */
  it('reads the local calendar, not UTC', () => {
    const lateEvening = new Date(2026, 8, 21, 22, 30)
    expect(localISODate(lateEvening)).toBe('2026-09-21')
    const justAfterMidnight = new Date(2026, 0, 1, 0, 5)
    expect(localISODate(justAfterMidnight)).toBe('2026-01-01')
  })

  it('pads to the shape an input[type=date] accepts', () => {
    expect(localISODate(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(localISODate(new Date(2026, 10, 9))).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('defaultVenue', () => {
  const now = new Date(2026, 8, 21, 9, 0)
  const draft = defaultVenue(now)

  it('opens on today with a real window', () => {
    expect(draft.date).toBe('2026-09-21')
    expect(draft.startTime).toBe(DEFAULT_START_TIME)
    expect(draft.endTime).toBe(DEFAULT_END_TIME)
    expect(draft.endTime > draft.startTime).toBe(true)
  })

  /*
   * THE WHOLE POINT. Nobody should meet a disabled forward button because of a
   * date field that is off the bottom of a short screen. After a pin is dropped,
   * the only thing left to supply is the venue itself.
   */
  it('leaves only the venue to supply, never the date or the window', () => {
    const errors = validateVenue(draft)
    expect(errors.date).toBeUndefined()
    expect(errors.startTime).toBeUndefined()
    expect(errors.endTime).toBeUndefined()
    expect(Object.keys(errors).sort()).toEqual(['latitude', 'longitude', 'name'])
  })

  it('carries no venue of its own, so nothing is invented about where', () => {
    expect(draft.name).toBe('')
    expect(draft.latitude).toBe('')
    expect(draft.longitude).toBe('')
  })
})
