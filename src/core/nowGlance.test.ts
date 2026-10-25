import { describe, expect, it } from 'vitest'
import { civilTimes } from './nightWindow.ts'
import { glanceHeadline, nowGlance, spanWords, timeLeftWords } from './nowGlance.ts'

/* Sandbridge, which is where the drive this screen exists for happened. */
const SANDBRIDGE = { lat: 36.726, lon: -75.94 }
/* 15 October 2026: sunset 18:27 EDT, dusk 18:53 EDT. */
const TIMES = civilTimes(new Date('2026-10-15T12:00:00Z'), SANDBRIDGE.lat, SANDBRIDGE.lon)
const before = (minutes: number) =>
  new Date((TIMES.sunset as Date).getTime() - minutes * 60_000)
const after = (minutes: number) => new Date((TIMES.sunset as Date).getTime() + minutes * 60_000)

describe('the drive this exists for', () => {
  /* 14 minutes out, which is the case in the report. */
  const glance = nowGlance(SANDBRIDGE, before(14))

  it('leads with the countdown to sunset', () => {
    expect(glance.phase).toBe('sunset-soon')
    expect(glance.minutesTo).toBe(14)
    expect(glanceHeadline(glance)).toBe('Sunset in 14 m')
  })

  it('says where to look in words, not degrees', () => {
    /*
     * 'west', because the sun sets on 259.6 here on this date. The report's
     * "west-southwest" was the planner's 254.1 at a different venue; the point
     * is the WORD rather than which word, and compassWords.test.ts pins the
     * mapping itself.
     */
    expect(glance.look?.word).toBe('west')
    expect(glanceHeadline(glance)).not.toMatch(/\d+\.\d/)
  })

  it('carries the bearing behind the word, for the planner', () => {
    expect(glance.look?.bearing).toBeGreaterThan(240)
    expect(glance.look?.bearing).toBeLessThan(265)
  })

  it('gives the peak window', () => {
    expect(glance.peak).not.toBeNull()
    const from = glance.peak as NonNullable<typeof glance.peak>
    /* Blue hour is the sun 4 to 6 degrees under: after sunset, before dusk. */
    expect(from.from.getTime()).toBeGreaterThan((TIMES.sunset as Date).getTime())
    /*
     * A COUPLE OF MINUTES OF SLOP, and it is not sampling noise. sunBand's
     * boundaries are the nominal -4 and -6 degrees, while civilTimes takes
     * suncalc's own dusk, and this build's getPosition carries a constant
     * 0.484 degree refraction offset against its getTimes (see
     * src/core/nightWindow.ts). So the band thresholds and the event times
     * describe the same moment about two minutes apart. Worth knowing, and
     * not worth moving every band in the app to fix.
     */
    expect(from.to.getTime()).toBeLessThanOrEqual((TIMES.dusk as Date).getTime() + 3 * 60_000)
  })

  it('says to be set up before the peak starts, not as it starts', () => {
    const peak = glance.peak as NonNullable<typeof glance.peak>
    expect(peak.beSetUpBy.getTime()).toBeLessThan(peak.from.getTime())
  })

  it('ends the light at dusk, which is how long you have got', () => {
    expect(glance.endsAt?.getTime()).toBe((TIMES.dusk as Date).getTime())
  })
})

describe('the phases', () => {
  it('is sunset-soon inside ninety minutes', () => {
    expect(nowGlance(SANDBRIDGE, before(89)).phase).toBe('sunset-soon')
    expect(nowGlance(SANDBRIDGE, before(1)).phase).toBe('sunset-soon')
  })

  /*
   * Past ninety minutes the headline stops being a countdown. "Sunset in
   * 4 h 50" is not something anybody pulls over for, and dressing it up as
   * urgent is how a countdown comes to mean nothing when it is real.
   */
  it('is day well before sunset, with no countdown', () => {
    const glance = nowGlance(SANDBRIDGE, before(240))
    expect(glance.phase).toBe('day')
    expect(glance.minutesTo).toBeNull()
    expect(glanceHeadline(glance)).toBe('Daylight')
    /* The direction is still useful, so it is still there. */
    expect(glance.look?.word).toBe('west')
  })

  it('is twilight-now between sunset and dusk', () => {
    const glance = nowGlance(SANDBRIDGE, after(10))
    expect(glance.phase).toBe('twilight-now')
    expect(glanceHeadline(glance)).toBe('Twilight now')
    expect(glance.endsAt?.getTime()).toBe((TIMES.dusk as Date).getTime())
  })

  it('does not count up from an event that has gone', () => {
    /* The useful number after sunset is how long the light lasts. */
    expect(glanceHeadline(nowGlance(SANDBRIDGE, after(10)))).not.toMatch(/ago/)
  })

  it('turns to the next sunrise after dusk', () => {
    const glance = nowGlance(SANDBRIDGE, after(60))
    expect(glance.phase).toBe('night')
    expect(glance.eventAt).not.toBeNull()
    expect((glance.eventAt as Date).getTime()).toBeGreaterThan(after(60).getTime())
  })

  it('is sunrise-soon in the ninety minutes before sunrise', () => {
    const sunrise = TIMES.sunrise as Date
    const glance = nowGlance(SANDBRIDGE, new Date(sunrise.getTime() - 20 * 60_000))
    expect(glance.phase).toBe('sunrise-soon')
    expect(glance.minutesTo).toBe(20)
    expect(glanceHeadline(glance)).toBe('Sunrise in 20 m')
    /* The morning sun comes up in the east, so the word must flip. */
    expect(glance.look?.word).toMatch(/east/)
  })

  /*
   * THE MORNING PEAK IS NOT THE EVENING ONE. Blue hour happens twice a day,
   * and a whole-day search for the band would hand back the wrong one. The
   * window either side of the event is what keeps them apart.
   */
  it('finds the morning peak for a morning question', () => {
    const sunrise = TIMES.sunrise as Date
    const glance = nowGlance(SANDBRIDGE, new Date(sunrise.getTime() - 20 * 60_000))
    const peak = glance.peak as NonNullable<typeof glance.peak>
    expect(peak.from.getTime()).toBeLessThan(sunrise.getTime())
    /* And nowhere near the evening's. */
    expect(peak.from.getTime()).toBeLessThan((TIMES.sunset as Date).getTime())
  })
})

describe('the polar case', () => {
  const BARROW = { lat: 71.0, lon: -156.0 }

  it('answers without an event when the sun never sets', () => {
    const glance = nowGlance(BARROW, new Date('2026-06-21T12:00:00Z'))
    /* No sunset and no sunrise to count to. It says so rather than guessing. */
    expect(glance.minutesTo).toBeNull()
    expect(['night', 'day']).toContain(glance.phase)
  })

  it('never returns a NaN countdown', () => {
    for (const iso of ['2026-06-21T00:00:00Z', '2026-12-21T12:00:00Z']) {
      const glance = nowGlance(BARROW, new Date(iso))
      expect(glance.minutesTo === null || Number.isFinite(glance.minutesTo)).toBe(true)
    }
  })
})

describe('spans read at a glance', () => {
  /* Hours and minutes, never a pile of minutes: "1 h 16 m", not "76 min". */
  it('uses minutes under an hour', () => {
    expect(spanWords(1)).toBe('1 m')
    expect(spanWords(14)).toBe('14 m')
    expect(spanWords(59)).toBe('59 m')
  })

  it('switches to hours and minutes from an hour', () => {
    expect(spanWords(76)).toBe('1 h 16 m')
    expect(spanWords(90)).toBe('1 h 30 m')
    expect(spanWords(120)).toBe('2 h')
    expect(spanWords(275)).toBe('4 h 35 m')
  })

  it('never goes negative', () => {
    expect(spanWords(-5)).toBe('0 m')
  })
})

describe('how long have I got', () => {
  it('says how much light is left in twilight', () => {
    const at = after(10)
    const words = timeLeftWords(nowGlance(SANDBRIDGE, at), at)
    expect(words).toContain('Light for about')
    expect(words).toMatch(/\d+ (m|h)\b/)
  })

  /* A "0 min left" would read as urgency when it means the opposite. */
  it('says nothing rather than zero once the light has gone', () => {
    const at = after(60)
    expect(timeLeftWords(nowGlance(SANDBRIDGE, at), at)).toBeNull()
  })
})

/*
 * THE WORDING. This screen is the most tempting place in the app to score the
 * sky, because the question it answers out loud is "is it worth pulling over".
 * It must not answer that.
 */
describe('it does not tell you whether to go', () => {
  const BANNED = [
    'worth it',
    'not worth',
    'go now',
    'skip it',
    'perfect',
    'great light',
    'poor light',
    'best',
    'excellent',
    'clear view',
    'guaranteed',
    'score',
    'rating',
    '/10',
  ]

  it('says nothing like a verdict in any phase', () => {
    for (const minutes of [-240, -14, 5, 60, 200]) {
      const at = new Date((TIMES.sunset as Date).getTime() + minutes * 60_000)
      const glance = nowGlance(SANDBRIDGE, at)
      const shown = [glanceHeadline(glance), timeLeftWords(glance, at) ?? '']
        .join(' ')
        .toLowerCase()
      for (const phrase of BANNED) {
        expect(shown, `at ${minutes} min contains "${phrase}"`).not.toContain(phrase)
      }
    }
  })
})
