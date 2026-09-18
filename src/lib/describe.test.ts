import { describe, expect, it } from 'vitest'
import {
  looksLikeCoordinates,
  parseDescribeResponse,
  parseShotList,
  SHOT_LIST_CAP,
} from './describe.ts'

const wrap = (o: Record<string, unknown>) => JSON.stringify(o)

const GOOD = {
  venueSearch: 'Brew River Dock Bar, Salisbury, MD',
  date: 'saturday',
  startTime: '11:00',
  endTime: '15:00',
  eventBrief: 'Boat docking contest on the river, crowd on the deck.',
  wantOut: 'Vertical cuts of boats hitting pilings and crowd reaction.',
}

describe('parseDescribeResponse', () => {
  it('reads a clean response into fields', () => {
    const result = parseDescribeResponse(wrap(GOOD))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.shoot.venueSearch).toBe('Brew River Dock Bar, Salisbury, MD')
    expect(result.shoot.date).toBe('saturday')
    expect(result.filled).toEqual(['venue', 'date', 'startTime', 'endTime', 'brief', 'want'])
  })

  it('digs the object out of fences the prompt forbade', () => {
    const result = parseDescribeResponse('```json\n' + wrap(GOOD) + '\n```')
    expect(result.ok).toBe(true)
  })

  it('keeps an empty field empty rather than inventing one', () => {
    const result = parseDescribeResponse(wrap({ ...GOOD, endTime: '', wantOut: '' }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.shoot.endTime).toBe('')
    expect(result.filled).not.toContain('endTime')
    expect(result.filled).not.toContain('want')
  })

  it('rejects a time that is not a real 24 hour clock reading', () => {
    const result = parseDescribeResponse(wrap({ ...GOOD, startTime: '25:00', endTime: '3pm' }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.shoot.startTime).toBe('')
    expect(result.shoot.endTime).toBe('')
  })

  it('caps the prose fields', () => {
    const long = Array.from({ length: 200 }, (_, i) => `w${i}`).join(' ')
    const result = parseDescribeResponse(wrap({ ...GOOD, eventBrief: long, wantOut: long }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.shoot.eventBrief.split(' ')).toHaveLength(60)
    expect(result.shoot.wantOut.split(' ')).toHaveLength(40)
  })

  /*
   * THE FAILURE THIS PROJECT EXISTS TO PREVENT, on a new surface. A model that
   * returns a coordinate instead of a place name produces a string that looks
   * entirely plausible and that a geocoder will happily resolve to a field three
   * towns away. It is dropped, and the venue is left for the shooter to type.
   */
  it('DROPS a coordinate returned where a place name belongs', () => {
    for (const venueSearch of [
      '38.364236, -75.605912',
      '38.364236 -75.605912',
      "38°21'51\"N 75°36'21\"W",
      '38.36N, 75.60W',
    ]) {
      const result = parseDescribeResponse(wrap({ ...GOOD, venueSearch }))
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.shoot.venueSearch).toBe('')
      expect(result.filled).not.toContain('venue')
    }
  })

  it('keeps a place name that merely contains digits', () => {
    const result = parseDescribeResponse(wrap({ ...GOOD, venueSearch: 'Pier 39, San Francisco' }))
    expect(result.ok && result.shoot.venueSearch).toBe('Pier 39, San Francisco')
  })

  it('fails with the raw text rather than dead ending', () => {
    const result = parseDescribeResponse('I need more information about the shoot.')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.raw).toContain('I need more information')
  })

  it('fails when every field came back empty', () => {
    const result = parseDescribeResponse(
      wrap({ venueSearch: '', date: '', startTime: '', endTime: '', eventBrief: '', wantOut: '' }),
    )
    expect(result.ok).toBe(false)
  })
})

describe('looksLikeCoordinates', () => {
  it('catches the shapes a model actually emits', () => {
    expect(looksLikeCoordinates('38.364236, -75.605912')).toBe(true)
    expect(looksLikeCoordinates('  51.5074 -0.1278 ')).toBe(true)
  })

  it('leaves real place names alone', () => {
    expect(looksLikeCoordinates('Brew River Dock Bar, Salisbury, MD')).toBe(false)
    expect(looksLikeCoordinates('Pier 39')).toBe(false)
    expect(looksLikeCoordinates('Route 66 Diner, Albuquerque')).toBe(false)
  })
})

describe('parseShotList', () => {
  it('splits a pasted list into lines', () => {
    const shots = parseShotList('Boats hitting pilings\nCrowd reaction\nDrone establisher')
    expect(shots.map((s) => s.text)).toEqual([
      'Boats hitting pilings',
      'Crowd reaction',
      'Drone establisher',
    ])
  })

  it('strips bullets, dashes and numbering the sender used', () => {
    const shots = parseShotList('- Boats hitting pilings\n2. Crowd reaction\n* Drone pass\n• Dock bar sign')
    expect(shots.map((s) => s.text)).toEqual([
      'Boats hitting pilings',
      'Crowd reaction',
      'Drone pass',
      'Dock bar sign',
    ])
  })

  it('drops blank lines and stray punctuation', () => {
    expect(parseShotList('A shot\n\n\n-\n \nAnother shot')).toHaveLength(2)
  })

  it('caps the list so a pasted novel cannot blow the prompt', () => {
    const many = Array.from({ length: 40 }, (_, i) => `Shot number ${i}`).join('\n')
    expect(parseShotList(many)).toHaveLength(SHOT_LIST_CAP)
  })

  it('caps each line', () => {
    const long = Array.from({ length: 60 }, (_, i) => `w${i}`).join(' ')
    expect(parseShotList(long)[0].text.split(' ')).toHaveLength(20)
  })

  it('gives every line a stable id', () => {
    expect(parseShotList('One\nTwo').map((s) => s.id)).toEqual(['want-1', 'want-2'])
  })

  it('survives empty input', () => {
    expect(parseShotList('')).toEqual([])
  })
})
