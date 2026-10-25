import { describe, expect, it } from 'vitest'
import { durationWords } from './duration.ts'

describe('a duration reads as hours and minutes', () => {
  it('never as a pile of minutes', () => {
    expect(durationWords(240)).toBe('4 h')
    expect(durationWords(76)).toBe('1 h 16 m')
    expect(durationWords(45)).toBe('45 m')
    expect(durationWords(0)).toBe('0 m')
  })

  it('rounds to the minute and never goes negative', () => {
    expect(durationWords(59.6)).toBe('1 h')
    expect(durationWords(-5)).toBe('0 m')
  })
})
