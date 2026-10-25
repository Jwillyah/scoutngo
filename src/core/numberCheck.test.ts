import { describe, expect, it } from 'vitest'
import { checkNumbers, repair, tokenize } from './numberCheck.ts'

const TOOLS = {
  sun: { sunset: '18:55', goldenHour: { from: '6:16 PM', to: '6:55 PM' } },
  airspace: { gridCeilingFeet: 200 },
  kit: { lens: 'Sony 70-200 f2.8 GM II', aperture: 2.8 },
  window: { lengthMinutes: 76 },
}

describe('the invented time', () => {
  /* THE CASE THIS EXISTS FOR. The sun code said 18:55; the model wrote 7:12 PM. */
  const answer = 'Sunset is at 7:12 PM, so start the hero push by then.'

  it('is rejected', () => {
    const result = checkNumbers(answer, TOOLS)
    expect(result.ok).toBe(false)
    expect(result.unknown.map((u) => u.text)).toEqual(['7:12 PM'])
  })

  it('is repaired to the code value', () => {
    const result = checkNumbers(answer, TOOLS)
    const fixed = repair(answer, result.unknown, { sunset: '6:55 PM' })
    expect(fixed.text).toBe('Sunset is at 6:55 PM, so start the hero push by then.')
    expect(fixed.replaced).toEqual([{ was: '7:12 PM', now: '6:55 PM', label: 'sunset' }])
    expect(checkNumbers(fixed.text, TOOLS).ok).toBe(true)
  })

  it('is marked, not guessed, when no label is in reach', () => {
    const result = checkNumbers('Be ready at 7:12 PM.', TOOLS)
    const fixed = repair('Be ready at 7:12 PM.', result.unknown, { sunset: '6:55 PM' })
    expect(fixed.text).toBe('Be ready at [7:12 PM, not from the app].')
    expect(fixed.marked).toEqual(['7:12 PM'])
  })
})

describe('the same number in another format passes', () => {
  it('18:55 is 6:55 PM', () => {
    expect(checkNumbers('Sunset 6:55 PM.', TOOLS).ok).toBe(true)
    expect(checkNumbers('Sunset 18:55.', TOOLS).ok).toBe(true)
  })
  it('200 ft is 200, 2.80 is 2.8', () => {
    expect(checkNumbers('Grid ceiling 200 ft, shoot at f/2.80.', TOOLS).ok).toBe(true)
  })
  it('1 h 16 m is 76 minutes', () => {
    expect(checkNumbers('You have 1 h 16 m of light.', TOOLS).ok).toBe(true)
  })
  it('numbers inside tool strings count', () => {
    expect(checkNumbers('The 70-200 at f/2.8.', TOOLS).ok).toBe(true)
  })
})

describe('what is and is not checked', () => {
  it('rejects a plain invented number', () => {
    expect(checkNumbers('Fly at 250 ft.', TOOLS).unknown.map((u) => u.text)).toEqual(['250'])
  })
  it('ignores list numbering, which is layout', () => {
    const result = checkNumbers('1. Wide establisher\n2. Hero push at 6:55 PM', TOOLS)
    expect(result.ok).toBe(true)
    expect(result.checked).toBe(1)
  })
  it('says how many numbers it checked, so ok over nothing is visible', () => {
    expect(checkNumbers('No numbers here.', TOOLS)).toEqual({ ok: true, unknown: [], checked: 0 })
  })
  it('does not read a time twice as two numbers', () => {
    expect(tokenize('at 6:55 PM').map((t) => t.kind)).toEqual(['time'])
  })
  it('reads PM, pm and p.m. as one time', () => {
    for (const t of ['6:55 PM', '6:55pm', '6:55 p.m.']) {
      expect(tokenize(`at ${t}`)[0]).toMatchObject({ kind: 'time', value: 18 * 60 + 55 })
    }
  })
  it('rejects a time that is not a time', () => {
    /* 25:00 is not a time of day, so it is read as numbers and both are checked. */
    expect(checkNumbers('at 25:00', TOOLS).ok).toBe(false)
  })
})
