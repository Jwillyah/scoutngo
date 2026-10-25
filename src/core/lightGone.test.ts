import { describe, expect, it } from 'vitest'
import { lightGoneLine } from './lightGone.ts'

const clock = (d: Date) => d.toISOString().slice(11, 16)

describe('the light gone line', () => {
  it('says when, and how much sooner than the flat sunset', () => {
    expect(lightGoneLine(new Date('2026-10-25T21:44:00Z'), new Date('2026-10-25T23:00:00Z'), clock)).toBe(
      'Light gone 21:44 behind the ridge, 1 h 16 m before the flat sunset at 23:00',
    )
  })
  it('makes no "before" claim when the ridge is not earlier', () => {
    expect(lightGoneLine(new Date('2026-10-25T23:01:00Z'), new Date('2026-10-25T23:00:00Z'), clock)).toBe(
      'Light gone 23:01 behind the ridge; flat sunset 23:00',
    )
  })
})
