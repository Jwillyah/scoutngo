import { describe, expect, it } from 'vitest'
import { compassPoint } from './field.ts'
import { compassWord, lookSentence } from './compassWords.ts'

describe('the spoken compass', () => {
  it('names the cardinals', () => {
    expect(compassWord(0)).toBe('north')
    expect(compassWord(90)).toBe('east')
    expect(compassWord(180)).toBe('south')
    expect(compassWord(270)).toBe('west')
  })

  it('names the sixteenth points the way they are said', () => {
    expect(compassWord(247.5)).toBe('west-southwest')
    expect(compassWord(22.5)).toBe('north-northeast')
    expect(compassWord(112.5)).toBe('east-southeast')
  })

  /* The real case: 254.1° is the bearing the planner shows at the test venue. */
  it('reads 254.1 as west-southwest', () => {
    expect(compassWord(254.1)).toBe('west-southwest')
    expect(lookSentence(254.1)).toBe('Look west-southwest.')
  })

  it('rounds to the nearest point rather than truncating', () => {
    /* A point is 22.5 wide, so its edges are 11.25 either side of centre. */
    expect(compassWord(258.74)).toBe('west-southwest')
    expect(compassWord(258.76)).toBe('west')
  })

  it('wraps around north in both directions', () => {
    expect(compassWord(359.9)).toBe('north')
    expect(compassWord(360)).toBe('north')
    expect(compassWord(-10)).toBe('north')
    expect(compassWord(-30)).toBe('north-northwest')
    expect(compassWord(730)).toBe('north')
  })

  it('never throws on a number that is not one', () => {
    expect(compassWord(Number.NaN)).toBe('north')
    expect(compassWord(Number.POSITIVE_INFINITY)).toBe('north')
  })

  /*
   * THE TWO COMPASS TABLES MUST AGREE. field.ts has the abbreviations for
   * readouts beside a number; this has the spoken form for a sentence with no
   * number in it. Two tables is how "WSW" and "west-northwest" end up on the
   * same screen pointing different ways.
   */
  it('agrees with the abbreviation table at every point', () => {
    const LETTER: Record<string, string> = {
      north: 'N',
      south: 'S',
      east: 'E',
      west: 'W',
      northeast: 'NE',
      northwest: 'NW',
      southeast: 'SE',
      southwest: 'SW',
    }
    const initials = (words: string) =>
      words
        .split('-')
        .map((part) => LETTER[part])
        .join('')
    for (let bearing = 0; bearing < 360; bearing += 1) {
      expect(initials(compassWord(bearing)), `at ${bearing}`).toBe(compassPoint(bearing))
    }
  })
})
