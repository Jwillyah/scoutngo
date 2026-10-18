import { describe, expect, it } from 'vitest'
import { ICS_REMINDER_NOTE, foldLine, icsFilename, icsStamp, icsText, peakEventIcs, skyEventIcs, skyEventIcsFilename } from './ics.ts'

const BASE = {
  from: new Date('2026-10-16T22:44:00Z'),
  to: new Date('2026-10-16T22:53:00Z'),
  bearing: 254.1,
  stamp: new Date('2026-10-15T23:10:00Z'),
  uid: 'peak-2026-10-16@scoutngo',
}

describe('the stamp format', () => {
  it('is RFC 5545 UTC basic format', () => {
    expect(icsStamp(new Date('2026-10-16T22:44:00Z'))).toBe('20261016T224400Z')
  })

  it('pads every field', () => {
    expect(icsStamp(new Date('2026-01-02T03:04:05Z'))).toBe('20260102T030405Z')
  })

  /* A local-time stamp would move the event by the device's offset. */
  it('is UTC regardless of the device zone', () => {
    expect(icsStamp(new Date('2026-10-16T22:44:00Z'))).toMatch(/Z$/)
    expect(icsStamp(new Date('2026-10-16T22:44:00Z'))).toContain('T2244')
  })
})

describe('escaping', () => {
  /* A venue name with a comma broke DESCRIPTION into a second parameter. */
  it('escapes the characters TEXT reserves', () => {
    expect(icsText('a, b; c\\d')).toBe('a\\, b\\; c\\\\d')
  })

  it('turns newlines into the literal escape', () => {
    expect(icsText('one\ntwo')).toBe('one\\ntwo')
    expect(icsText('one\r\ntwo')).toBe('one\\ntwo')
  })
})

describe('line folding', () => {
  it('leaves a short line alone', () => {
    expect(foldLine('SUMMARY:short')).toBe('SUMMARY:short')
  })

  it('folds a long line with a leading space on continuations', () => {
    const folded = foldLine(`DESCRIPTION:${'x'.repeat(200)}`)
    expect(folded).toContain('\r\n ')
    for (const line of folded.split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(76)
    }
  })

  /*
   * COUNTED IN OCTETS, NOT CHARACTERS, and never split through a character.
   * The honesty note contains a typographic apostrophe, which is three bytes.
   */
  it('never splits a multi-byte character', () => {
    const folded = foldLine(`DESCRIPTION:${'’'.repeat(60)}`)
    expect(folded).not.toContain('�')
    expect(folded.replace(/\r\n /g, '')).toBe(`DESCRIPTION:${'’'.repeat(60)}`)
    for (const line of folded.split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(76)
    }
  })
})

describe('the file', () => {
  const ics = peakEventIcs(BASE)

  it('is a complete single-event calendar', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true)
    expect(ics).toContain('VERSION:2.0')
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1)
  })

  it('uses CRLF throughout', () => {
    /* Every newline is preceded by a carriage return. */
    expect(ics.split('\n').length - 1).toBe(ics.split('\r\n').length - 1)
  })

  it('carries the window as the event times', () => {
    expect(ics).toContain('DTSTART:20261016T224400Z')
    expect(ics).toContain('DTEND:20261016T225300Z')
  })

  it('is stable for the same window, so a second download updates', () => {
    expect(peakEventIcs(BASE)).toBe(ics)
    expect(ics).toContain('UID:peak-2026-10-16@scoutngo')
  })

  it('sets an alarm before the window, not during it', () => {
    expect(ics).toContain('TRIGGER:-PT15M')
  })

  it('says where to look in words', () => {
    expect(ics.replace(/\r\n /g, '')).toContain('Look west-southwest.')
  })

  it('says to look toward the sun when there is no bearing', () => {
    const noBearing = peakEventIcs({ ...BASE, bearing: null }).replace(/\r\n /g, '')
    expect(noBearing).toContain('Look toward the sun.')
    expect(noBearing).not.toMatch(/\d+\.\d+°/)
  })

  /*
   * THE WHOLE POINT OF THE FILE'S WORDING. A calendar entry made today for
   * tomorrow cannot know tomorrow's sky, and the entry says so where it will
   * be read: in the description, first sentence, which is what a notification
   * shows.
   */
  it('says plainly that it is a reminder and not a prediction', () => {
    const unfolded = ics.replace(/\r\n /g, '')
    expect(unfolded).toContain('A reminder to look')
    expect(unfolded).toContain('not a prediction')
    expect(ICS_REMINDER_NOTE).toContain('nothing in ScoutNGo knows it from today')
  })

  it('never promises anything about the sky', () => {
    const shown = ics.replace(/\r\n /g, '').toLowerCase()
    for (const banned of [
      'will be',
      'guaranteed',
      'clear sky',
      'clear view',
      'perfect',
      'great light',
      'expect ',
      'forecast',
    ]) {
      expect(shown, `contains "${banned}"`).not.toContain(banned)
    }
  })

  it('escapes a name with punctuation in the uid', () => {
    const odd = peakEventIcs({ ...BASE, uid: 'a;b,c' })
    expect(odd).toContain('UID:a\\;b\\,c')
  })
})

describe('the filename', () => {
  it('says what it is and sorts by date', () => {
    expect(icsFilename(new Date('2026-10-16T22:44:00Z'))).toBe('scoutngo-peak-2026-10-16.ics')
  })
})

describe('a sky event window as an .ics', () => {
  const base = {
    from: new Date('2026-10-22T07:31:00Z'),
    to: new Date('2026-10-22T10:00:00Z'),
    title: 'Orionids — meteor window',
    constraintLines: [
      'Target clears the horizon 22:38',
      'Moon down 03:31 to 06:00',
      'Astronomical dark 19:55 to 06:00',
    ],
    kitLines: ['Sigma 28-75 f2.8 at 28mm: NPF 9.0s on the Sony a7III.'],
    stamp: new Date('2026-10-18T12:00:00Z'),
    uid: 'shower-orionids-2026-10-21@scoutngo.local',
  } as const

  it('carries the computed window as DTSTART and DTEND', () => {
    const text = skyEventIcs({ ...base, horizonSource: 'terrain' })
    expect(text).toContain('DTSTART:20261022T073100Z')
    expect(text).toContain('DTEND:20261022T100000Z')
  })

  it('puts every constraint in the description', () => {
    const text = skyEventIcs({ ...base, horizonSource: 'terrain' })
    for (const line of base.constraintLines) {
      /* Folding can break a long line, so the check is on a short distinctive run. */
      expect(text.replace(/\r\n /g, '')).toContain(line)
    }
  })

  it('says which horizon produced the times', () => {
    const terrain = skyEventIcs({ ...base, horizonSource: 'terrain' }).replace(/\r\n /g, '')
    const flat = skyEventIcs({ ...base, horizonSource: 'flat' }).replace(/\r\n /g, '')
    expect(terrain).toMatch(/terrain horizon/i)
    expect(flat).toMatch(/flat horizon/i)
    expect(flat).toMatch(/no elevation data/i)
  })

  it('leads with the reminder note, so a notification shows it first', () => {
    const text = skyEventIcs({ ...base, horizonSource: 'terrain' }).replace(/\r\n /g, '')
    const description = text.split('DESCRIPTION:')[1] ?? ''
    /*
     * Compared against the ESCAPED note, not the raw one. RFC 5545 escapes
     * commas and semicolons inside a property value, and the note has both,
     * so a raw comparison fails on correct output. icsText is the same
     * function the writer used, which is the point.
     */
    expect(description.startsWith(icsText(ICS_REMINDER_NOTE).slice(0, 40))).toBe(true)
  })

  it('never claims the night will be clear', () => {
    const text = skyEventIcs({ ...base, horizonSource: 'flat' })
    expect(text).not.toMatch(/\bclear\b/i)
    expect(text).not.toMatch(/\bguaranteed\b/i)
  })

  it('does not put the venue coordinate in the file', () => {
    const text = skyEventIcs({ ...base, horizonSource: 'terrain' })
    expect(text).not.toMatch(/38\.75/)
    expect(text).not.toMatch(/-78\.26/)
    expect(text).not.toMatch(/GEO:/)
  })

  it('is stable for the same window, so a second download updates rather than duplicates', () => {
    const a = skyEventIcs({ ...base, horizonSource: 'terrain' })
    const b = skyEventIcs({ ...base, horizonSource: 'terrain' })
    expect(a).toBe(b)
    expect(a).toContain(`UID:${base.uid}`)
  })

  it('uses CRLF throughout, which the spec requires', () => {
    const text = skyEventIcs({ ...base, horizonSource: 'terrain' })
    expect(text.split('\n').every((line) => line === '' || line.endsWith('\r'))).toBe(true)
  })

  it('names the file by the night, so downloads sort', () => {
    expect(skyEventIcsFilename('Orionids', base.from)).toBe('scoutngo-orionids-2026-10-22.ics')
  })

  it('warns far enough ahead to drive somewhere dark', () => {
    const text = skyEventIcs({ ...base, horizonSource: 'terrain' })
    expect(text).toContain('TRIGGER:-PT40M')
  })
})
