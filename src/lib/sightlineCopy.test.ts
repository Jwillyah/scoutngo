import { describe, expect, it } from 'vitest'
import type { Blocker } from '../core/sightline.ts'
import type { SiteMark } from '../core/siteMark.ts'
import { blockedLine, blockerLine, BLOCKED_WORD } from './sightlineCopy.ts'
import { makeMark, updateMark } from './marks.ts'

const AT = { lat: 37.0869, lon: -76.4746 }
const oak = updateMark([makeMark('trees', { kind: 'point', at: AT })], 'x', {})[0]
const marks: SiteMark[] = [{ ...oak, id: 'oak', heightMeters: 18, foliage: 'deciduous' }]

const blocker = (over: Partial<Blocker> = {}): Blocker => ({
  markId: 'oak',
  atMeters: 100,
  sightlineHeightMeters: 3.8,
  topMeters: 18,
  overMeters: 14.2,
  leaf: 'in-leaf',
  seasonal: true,
  ...over,
})

/*
 * "A blocked position says it is blocked and by what."
 *
 * Every number in these sentences came from a mark the shooter made. Nothing
 * is inferred about anything that is not marked.
 */
describe('a blocker is named and measured', () => {
  it('says what it is, how tall, how far along and how far over', () => {
    const line = blockerLine(blocker(), marks)
    expect(line).toContain('Trees')
    expect(line).toContain('18 m tall')
    expect(line).toContain('100 m along')
    expect(line).toContain('14 m above the line')
  })

  it('adds the leaf state only when the leaves are the reason', () => {
    /* Capitalised, because it begins its own sentence after the measurement. */
    expect(blockerLine(blocker(), marks)).toContain('Likely in leaf')
    expect(blockerLine(blocker({ seasonal: false }), marks)).not.toContain('leaf')
  })

  it('says a shoulder month could go either way rather than picking a side', () => {
    expect(blockerLine(blocker({ leaf: 'turning' }), marks)).toContain('either way')
  })

  /* A mark that has gone misses its name rather than inventing one. */
  it('does not invent a name for a mark it cannot find', () => {
    const line = blockerLine(blocker({ markId: 'gone' }), marks)
    expect(line).toContain('Something marked')
    expect(line).toContain('18 m tall')
  })
})

describe('the summary line', () => {
  it('names the one thing in the way', () => {
    expect(blockedLine([blocker()], marks)).toBe('In the way: marked trees.')
  })

  it('counts several and names the worst', () => {
    const line = blockedLine([blocker(), blocker({ markId: 'b' })], marks)
    expect(line).toContain('2 marked obstructions')
    expect(line).toContain('trees')
  })

  /*
   * THE HARD RULE. There is NO sentence for the empty case, and that is the
   * point: the only true one would be "nothing is marked between here and the
   * subject", which beside a plan reads as "this is clear". Null draws nothing.
   */
  it('says nothing at all when nothing is marked in the way', () => {
    expect(blockedLine([], marks)).toBeNull()
  })

  it('never uses a reassuring word in any of its outputs', () => {
    const texts = [
      blockedLine([blocker()], marks) ?? '',
      blockedLine([blocker(), blocker({ markId: 'b' })], marks) ?? '',
      blockerLine(blocker(), marks),
      blockerLine(blocker({ seasonal: false }), marks),
      BLOCKED_WORD,
    ]
    for (const text of texts) {
      for (const word of ['clear', 'safe', 'unobstructed', 'nothing in the way', 'no hazards']) {
        expect(text.toLowerCase(), `says "${word}"`).not.toContain(word)
      }
    }
  })
})

/*
 * NO VERB TO AGREE WITH. The kinds are a mixed bag of singular and plural, so
 * a sentence with a verb reads as "marked trees stands in the way" for half
 * of them.
 */
describe('the summary reads correctly for every kind', () => {
  it('works for a plural kind and a singular one alike', () => {
    const building: SiteMark[] = [{ ...marks[0], id: 'b', kind: 'building' }]
    expect(blockedLine([blocker({ markId: 'b' })], building)).toBe('In the way: marked building.')
    expect(blockedLine([blocker()], marks)).toBe('In the way: marked trees.')
  })

  it('never writes a verb that could disagree', () => {
    for (const line of [
      blockedLine([blocker()], marks) ?? '',
      blockedLine([blocker(), blocker({ markId: 'b' })], marks) ?? '',
    ]) {
      expect(line).not.toMatch(/\b(stands?|blocks?|is|are)\b/)
    }
  })
})

describe('the map word', () => {
  it('is short enough for a marker and says what it means', () => {
    expect(BLOCKED_WORD.length).toBeLessThanOrEqual(13)
    expect(BLOCKED_WORD).toBe('blocked')
  })
})
