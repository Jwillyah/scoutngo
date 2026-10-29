import { describe, expect, it } from 'vitest'
import { lowTideNearest, nextTideTurn } from './lowTide.ts'
import type { TideExtreme } from '../core/tide.ts'

/*
 * ATLANTIC PARK, VIRGINIA BEACH, 25 OCTOBER 2026. NOAA 8639168, 0.42 km from
 * the venue, as it answered while diagnosing the "no data" chip:
 *   05:00Z low 0.207, 11:23Z high 4.699, 17:46Z low 0.264, 23:41Z high 3.903
 */
const TURNS: TideExtreme[] = [
  { at: new Date('2026-10-25T05:00Z'), feet: 0.207, kind: 'low' },
  { at: new Date('2026-10-25T11:23Z'), feet: 4.699, kind: 'high' },
  { at: new Date('2026-10-25T17:46Z'), feet: 0.264, kind: 'low' },
  { at: new Date('2026-10-25T23:41Z'), feet: 3.903, kind: 'high' },
]

/* Sunset golden hour, 17:30 to 18:20 EDT, which is 21:30 to 22:20 Z. */
const START = new Date('2026-10-25T21:30Z')
const END = new Date('2026-10-25T22:20Z')

describe('the low water the chip shows', () => {
  it('was the reported bug: no low falls inside a golden-hour window', () => {
    const inside = TURNS.filter(
      (t) => t.kind === 'low' && t.at >= START && t.at <= END,
    )
    expect(inside).toEqual([])
  })

  it('shows the nearest low instead of nothing', () => {
    expect(lowTideNearest(TURNS, START, END)?.at.toISOString()).toBe('2026-10-25T17:46:00.000Z')
  })

  it('prefers a low inside the window', () => {
    const inside = { at: new Date('2026-10-25T22:00Z'), feet: 0.1, kind: 'low' as const }
    expect(lowTideNearest([...TURNS, inside], START, END)).toBe(inside)
  })

  it('never offers a high as a low', () => {
    expect(lowTideNearest(TURNS.filter((t) => t.kind === 'high'), START, END)).toBeNull()
  })

  it('looks after the window too', () => {
    const late = { at: new Date('2026-10-26T00:10Z'), feet: 0.3, kind: 'low' as const }
    expect(lowTideNearest([TURNS[1], late], START, END)).toBe(late)
  })
})

describe('the next turn of the tide', () => {
  /* 29 Oct at the pier: at 7:13 the chip said "Low tide 4:01 AM", a turn already past. */
  const turns = [
    { at: new Date('2026-10-29T08:01:00Z'), feet: 0.3, kind: 'low' as const },
    { at: new Date('2026-10-29T14:14:00Z'), feet: 3.4, kind: 'high' as const },
    { at: new Date('2026-10-29T20:20:00Z'), feet: 0.4, kind: 'low' as const },
  ]
  it('is the first high or low after the time, never one that has passed', () => {
    expect(nextTideTurn(turns, new Date('2026-10-29T11:13:00Z'))).toEqual(turns[1])
    expect(nextTideTurn(turns, new Date('2026-10-29T15:00:00Z'))).toEqual(turns[2])
  })
  it('is none after the last prediction', () => {
    expect(nextTideTurn(turns, new Date('2026-10-30T00:00:00Z'))).toBeNull()
  })
})
