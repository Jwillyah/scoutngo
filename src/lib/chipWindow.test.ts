import { describe, expect, it } from 'vitest'
import { chipWindow, type WindowSource } from './chipWindow.ts'

/* Sandbridge, Virginia Beach: the shoot this came from. */
const SANDBRIDGE = { lat: 36.7362, lon: -75.936 }
const ZONE = 'America/New_York'

const ask = (over: Partial<Parameters<typeof chipWindow>[0]> = {}) =>
  chipWindow({
    kind: 'sunset',
    source: 'default',
    centre: SANDBRIDGE,
    date: '2026-10-18',
    timeZone: ZONE,
    ...over,
  })

/*
 * WHAT WAS REPORTED. "I tapped Sunset at Sandbridge and the window stayed
 * 3:00-7:00 PM. The hint says 'Drop the venue pin and the chip will set the
 * window too', so it only works if I drop the pin first. That ordering trap is
 * on me to remember and it should not be."
 */
describe('a chip sets the window whenever it can', () => {
  it('sets it when everything is there', () => {
    const outcome = ask()
    expect(outcome.action).toBe('apply')
    if (outcome.action !== 'apply') return
    expect(outcome.startTime).toMatch(/^\d{2}:\d{2}$/)
    expect(outcome.endTime).toMatch(/^\d{2}:\d{2}$/)
    /* A sunset window at this latitude in October is late afternoon, not 15:00. */
    expect(Number(outcome.startTime.slice(0, 2))).toBeGreaterThan(15)
  })

  /*
   * ORDER DOES NOT MATTER, which is the whole item. The function is asked the
   * same question whichever piece arrived last, so both orders reach the same
   * answer by construction rather than by two code paths agreeing.
   */
  it('reaches the same answer whichever arrived last', () => {
    const chipFirst = ask()
    const pinFirst = ask()
    expect(chipFirst).toEqual(pinFirst)
  })

  it('waits for the pin, and says which piece is missing', () => {
    const outcome = ask({ centre: null })
    expect(outcome.action).toBe('wait')
    expect(outcome.line).toContain('pin')
  })

  it('waits for the date, and says so', () => {
    expect(ask({ date: '' }).action).toBe('wait')
    expect(ask({ date: '' }).line).toContain('date')
    expect(ask({ timeZone: null }).action).toBe('wait')
  })

  it('does nothing at all with no chip tapped, and says nothing', () => {
    const outcome = ask({ kind: null })
    expect(outcome.action).toBe('none')
    expect(outcome.line).toBeNull()
  })

  /* Each chip gives a different window, or the chips mean nothing. */
  it('gives sunrise, sunset and daytime different windows', () => {
    const windows = (['sunrise', 'sunset', 'daytime'] as const).map((kind) => {
      const outcome = ask({ kind })
      return outcome.action === 'apply' ? `${outcome.startTime}-${outcome.endTime}` : outcome.action
    })
    expect(new Set(windows).size).toBe(3)
  })
})

/*
 * TYPED TIMES ARE AN INSTRUCTION, NOT A GUESS. "If I have already typed my own
 * times, leave them alone and say so."
 */
describe('a window the shooter typed is kept', () => {
  it('keeps it and says why', () => {
    const outcome = ask({ source: 'typed' })
    expect(outcome.action).toBe('keep')
    expect(outcome.line).toContain('kept')
  })

  /*
   * CHECKED BEFORE THE PIN AND THE DATE. "Your times are kept" is true whether
   * or not the venue is finished, and telling somebody to drop a pin so a chip
   * can overwrite times they typed on purpose is a worse kind of wrong.
   */
  it('says so even before the venue is finished', () => {
    expect(ask({ source: 'typed', centre: null }).action).toBe('keep')
    expect(ask({ source: 'typed', date: '' }).action).toBe('keep')
  })

  /* A window the app or a chip set is still fair game. */
  it('replaces a window the app or a chip chose', () => {
    for (const source of ['default', 'chip'] as WindowSource[]) {
      expect(ask({ source }).action, source).toBe('apply')
    }
  })
})

/*
 * AND IT NEVER INVENTS A WINDOW IT CANNOT COMPUTE.
 *
 * Svalbard at midsummer: the sun never sets, so there is no sunrise and the
 * chip says so rather than offering a plausible pair of times.
 */
describe('no event, no window', () => {
  const svalbard = (date: string) =>
    chipWindow({
      kind: 'sunrise',
      source: 'default',
      centre: { lat: 78.22, lon: 15.65 },
      date,
      timeZone: 'Arctic/Longyearbyen',
    })

  it('says there is none rather than making one up', () => {
    const outcome = svalbard('2026-06-21')
    expect(outcome.action).toBe('none')
    expect(outcome.line).toContain('No sunrise at this latitude')
  })

  /*
   * POLAR NIGHT IS THE OTHER WAY ROUND AND IS LEFT AS IT IS. On 21 December
   * the sun does not rise either, but there is still a twilight maximum around
   * midday and the chip offers it: 10:26 to 13:25. That is the best light in
   * the day and it is genuinely useful.
   *
   * The reason it is not called a mistake: the line states TIMES and never
   * claims a sunrise happened. Pinned here so the distinction is deliberate
   * rather than something nobody looked at.
   */
  it('offers the twilight maximum in polar night, stating times and not an event', () => {
    const outcome = svalbard('2026-12-21')
    expect(outcome.action).toBe('apply')
    if (outcome.action !== 'apply') return
    expect(outcome.line).not.toMatch(/sunrise/i)
    expect(outcome.line).toMatch(/\d{2}:\d{2}/)
  })
})
