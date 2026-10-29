import { describe, expect, it } from 'vitest'
import { shadowKeyLine, shadowKeyNotes } from './shadowKey.ts'

const many = { status: 'ok', shadows: new Array(965).fill(0), skippedNoHeight: 349 }

describe('the shadow legend over the 2D map', () => {
  it('is one short line, as asked from the pier on 27 Oct', () => {
    expect(shadowKeyLine(many)).toBe('Shadows: 965 buildings · 349 no height')
    expect(shadowKeyLine({ status: 'ok', shadows: [0], skippedNoHeight: 0 })).toBe('Shadows: 1 building')
    expect(shadowKeyLine({ status: 'no-sun', skippedNoHeight: 0 })).toBe('No shadows: the sun is down.')
  })
  /* 29 Oct: with the sun down, only when they come back; no count of buildings that cast nothing anyway. */
  it('with the sun down says only when the shadows come back', () => {
    expect(shadowKeyLine({ status: 'no-sun', skippedNoHeight: 349 }, '7:22 AM')).toBe('No shadows until sunrise at 7:22 AM')
    expect(shadowKeyNotes({ status: 'no-sun', skippedNoHeight: 349 }, 2013, '7:22 AM')).toEqual(['No shadows until sunrise at 7:22 AM'])
  })
  it('keeps every detail it dropped, for the "i"', () => {
    const notes = shadowKeyNotes(many, 2013).join(' ')
    expect(notes).toContain('965 buildings with a known height')
    expect(notes).toContain('349 more have no height')
    expect(notes).toContain('flat ground')
    expect(notes).toContain('2013 lidar scan')
    expect(shadowKeyNotes(many, undefined).join(' ')).not.toContain('lidar')
  })
  it('stays short with five-digit counts: 44 characters at most', () => {
    expect(shadowKeyLine({ status: 'ok', shadows: new Array(12345).fill(0), skippedNoHeight: 12345 }).length).toBeLessThanOrEqual(44)
  })
})
