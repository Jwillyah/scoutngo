import { describe, expect, it } from 'vitest'
import {
  AGEING_YEARS,
  imageryAge,
  imageryNote,
  imageryYear,
  imageryYearsOld,
  OLD_YEARS,
} from './imageryAge.ts'

describe('reading the year Google gives', () => {
  it('takes the year out of a YYYY-MM', () => {
    expect(imageryYear('2018-06')).toBe(2018)
    expect(imageryYear('2026-01')).toBe(2026)
  })

  /* Null, never a zero or this year, when it cannot be read. */
  it('is null for anything it cannot read', () => {
    for (const bad of [undefined, null, '', 'recently', '18-06', '1823-01', '9999-01']) {
      expect(imageryYear(bad), String(bad)).toBeNull()
    }
  })
})

/*
 * THE REPORTED CASE. "Yesterday's pane said 2018 on a shot where trees were
 * the problem. Eight years of growth is the difference between the view I
 * planned and the one I got."
 */
describe('the two cases from the report', () => {
  it('calls 2018 on a 2026 shoot old', () => {
    expect(imageryAge(2018, 2026)).toBe('old')
    expect(imageryYearsOld(2018, 2026)).toBe(8)
  })

  it('calls 2026 on a 2026 shoot current, and says nothing about it', () => {
    expect(imageryAge(2026, 2026)).toBe('current')
    expect(imageryNote('current', 0)).toBeNull()
  })

  it('says trees and buildings on the old one, which is what changes', () => {
    const note = imageryNote('old', 8)
    expect(note).toContain('8 years old')
    expect(note?.toLowerCase()).toContain('canopy')
  })
})

describe('the bands', () => {
  it('is current right up to the first boundary', () => {
    expect(imageryAge(2026, 2026)).toBe('current')
    expect(imageryAge(2026 - AGEING_YEARS + 1, 2026)).toBe('current')
  })

  it('is ageing from the first boundary to the second', () => {
    expect(imageryAge(2026 - AGEING_YEARS, 2026)).toBe('ageing')
    expect(imageryAge(2026 - OLD_YEARS + 1, 2026)).toBe('ageing')
  })

  it('is old from the second boundary on', () => {
    expect(imageryAge(2026 - OLD_YEARS, 2026)).toBe('old')
    expect(imageryAge(1999 + 1, 2026)).toBe('old')
  })

  it('is unknown with no year, rather than assuming it is fine', () => {
    expect(imageryAge(null, 2026)).toBe('unknown')
    expect(imageryNote('unknown', null)).toBeNull()
  })

  /* Imagery dated after the shoot is not older than it. */
  it('does not report a negative age', () => {
    expect(imageryAge(2027, 2026)).toBe('current')
    expect(imageryYearsOld(2027, 2026)).toBe(0)
  })
})

describe('the wording claims nothing about today', () => {
  it('never says the view is wrong or out of date as a fact', () => {
    for (const [age, years] of [['ageing', 4], ['old', 9]] as const) {
      const note = imageryNote(age, years)!.toLowerCase()
      for (const word of ['wrong', 'inaccurate', 'no longer', 'has changed', 'outdated']) {
        expect(note, `says "${word}"`).not.toContain(word)
      }
      /* It states the age and what tends to change, and leaves the judgement. */
      expect(note).toContain('years old')
    }
  })

  it('stays quiet on a recent view rather than reassuring', () => {
    expect(imageryNote('current', 1)).toBeNull()
    expect(imageryNote('current', 0)).toBeNull()
  })
})
