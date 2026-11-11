import { describe, expect, it } from 'vitest'
import { bestRun, bestWindows, skyStripLit, cardList, colorWords, conditionOf, sideWords, nothingLine, rainLine, spanWords, stripSteps, weekHeadline } from '../src/core/homeDay.ts'
import { homeOrder, primaryFor, reviveActivities, shootPicked, showsDrone, showsPhotoTools } from '../src/lib/activities.ts'

/*
 * THE NEW HOME (Batch M, Section 3): the words it says are the code's, from
 * the forecast the phone holds; facts, never advice.
 */
const TZ = 'America/New_York'
const PIER = { lat: 36.8436, lon: -75.9713 }
const at = (iso: string) => new Date(iso)
const NOW = at('2026-11-08T13:30:00Z') /* 8:30 AM EST */

describe('the sky in a word', () => {
  it('reads the WMO code, day and night', () => {
    expect(conditionOf(0, true)).toEqual({ word: 'Sunny', icon: 'sun' })
    expect(conditionOf(0, false)).toEqual({ word: 'No cloud', icon: 'moon' })
    expect(conditionOf(3, true)?.word).toBe('Cloudy')
    expect(conditionOf(61, true)?.word).toBe('Rain')
    expect(conditionOf(95, true)?.icon).toBe('storm')
    expect(conditionOf(null, true)).toBeNull()
  })

  it('never says "clear" or "safe"', () => {
    for (const c of [0, 1, 2, 3, 45, 51, 61, 65, 66, 71, 80, 85, 95, 99]) for (const d of [true, false]) expect(conditionOf(c, d)?.word ?? '').not.toMatch(/clear|safe/i)
  })
})

describe('the rain line', () => {
  const hours = (mm: (number | null)[]) => mm.map((v, i) => ({ at: new Date(at('2026-11-08T13:00:00Z').getTime() + i * 3_600_000), mm: v }))
  it('"No rain next 6 h" when every hour ahead is dry', () => {
    expect(rainLine(hours([0, 0, 0.1, 0, 0, 0, 0, 0]), NOW, TZ)).toBe('No rain next 6 h')
  })
  it('"Rain from 1 PM" at the first wet hour; "Rain now" when it is this hour', () => {
    expect(rainLine(hours([0, 0, 0, 0, 0, 0.6, 1, 0]), NOW, TZ)).toBe('Rain from 1 PM')
    expect(rainLine(hours([0.4, 0, 0]), NOW, TZ)).toBe('Rain now')
  })
  it('a dash, not "no rain", when the forecast does not say', () => {
    expect(rainLine(hours([0, null, 0, 0, 0, 0, 0]), NOW, TZ)).toBeNull()
    expect(rainLine([], NOW, TZ)).toBeNull()
  })
})

describe('the hourly strip', () => {
  it('six steps two hours apart from now, the sunset in place of the step nearest it', () => {
    const steps = stripSteps(at('2026-11-08T17:10:00Z'), PIER.lat, PIER.lon, TZ)
    expect(steps).toHaveLength(6)
    expect(steps[0].label).toBe('Now')
    const set = steps.find((s) => s.kind === 'sunset')
    expect(set).toBeDefined()
    expect(set!.at.getTime()).toBeGreaterThan(at('2026-11-08T21:40:00Z').getTime())
    expect(set!.label).toMatch(/^4:\d\d$/)
  })
})

describe('the best windows', () => {
  it('the longest run of good hours, at least two', () => {
    const h = (i: number, v: number) => ({ at: new Date(at('2026-11-08T13:00:00Z').getTime() + i * 3_600_000), value: v })
    const run = bestRun([h(0, 1), h(1, 5), h(2, 5), h(3, 5), h(4, 1), h(5, 5)], (v) => v > 2)
    expect(run?.values).toEqual([5, 5, 5])
    expect(spanWords(run!.from, run!.to, TZ)).toBe('9 AM–12 PM')
    expect(bestRun([h(0, 5), h(1, 1)], (v) => v > 2)).toBeNull()
  })
  it('spans the short way', () => {
    expect(spanWords(at('2026-11-08T13:00:00Z'), at('2026-11-08T16:00:00Z'), TZ)).toBe('8–11 AM')
    expect(spanWords(at('2026-11-08T15:00:00Z'), at('2026-11-08T18:00:00Z'), TZ)).toBe('10 AM–1 PM')
  })
  it('up to three, in the order picked; nothing qualifying says so honestly', () => {
    const row = (a: 'surf' | 'shoot' | 'drone' | 'fish') => ({ activity: a, head: a, reason: '' })
    expect(bestWindows(['fish', 'surf', 'shoot', 'drone'], { surf: row('surf'), shoot: row('shoot'), drone: row('drone'), fish: row('fish') }).map((r) => r.activity)).toEqual(['fish', 'surf', 'shoot'])
    expect(nothingLine('today', { day: 'Tue', what: 'sunset' })).toBe('Nothing standout today · Tue sunset looks good')
    expect(nothingLine('today', null)).toBe('Nothing standout today')
    expect(weekHeadline([{ day: 'Mon', what: 'sunset' }, { day: 'Thu', what: 'surf' }])).toBe('Best this week: Mon sunset · Thu surf')
  })
})

describe('what you do orders the home, and hides only tools', () => {
  it('never asked: everything, the default order; a drone in the kit brings the drone', () => {
    expect(homeOrder(null, false)).toEqual(['surf', 'shoot', 'fish', 'weather'])
    expect(homeOrder(null, true)).toContain('drone')
    expect(showsPhotoTools(null)).toBe(true)
    expect(showsDrone(null, false)).toBe(true)
  })
  it('picked: that order; photo tools only with Shoot; the drone with Fly or a drone in the kit', () => {
    expect(homeOrder(['fish', 'weather'], false)).toEqual(['fish', 'weather'])
    expect(showsPhotoTools(['surf'])).toBe(false)
    expect(showsPhotoTools(['surf', 'shoot'])).toBe(true)
    /* Batch Beach, Section 2: the Surf page's "Light on the face" only with Shoot picked, not before the picker is answered. */
    expect(shootPicked(null)).toBe(false)
    expect(shootPicked([])).toBe(false)
    expect(shootPicked(['surf'])).toBe(false)
    expect(shootPicked(['surf', 'shoot'])).toBe(true)
    expect(showsDrone(['surf'], false)).toBe(false)
    expect(showsDrone(['surf'], true)).toBe(true)
    expect(showsDrone(['drone'], false)).toBe(true)
  })
  it('the primary button follows the first pick', () => {
    expect(primaryFor(['shoot', 'surf'])).toBe('viewfinder')
    expect(primaryFor(['drone'])).toBe('preflight')
    expect(primaryFor(['surf'])).toBe('radar')
    expect(primaryFor(['weather'])).toBe('radar')
  })
  it('cards: the picked ones first, every card still there (the drone only with a drone)', () => {
    expect(cardList(['fish'], false, 99)).toEqual(['wind', 'tide', 'surf', 'sky', 'moon'])
    expect(cardList(['shoot', 'surf'], true, 99)).toEqual(['sky', 'moon', 'surf', 'wind', 'tide', 'drone'])
    /* Batch Pages, Section 1: all six on the home (board HomeV9: Surf, Wind, Tide, Sky, Drone, Moon), in the picker's order. */
    expect(cardList(['surf', 'drone'], true)).toEqual(['surf', 'wind', 'tide', 'drone', 'sky', 'moon'])
    expect(cardList(['surf', 'weather'], false)).toEqual(['surf', 'wind', 'tide', 'sky', 'moon'])
    expect(cardList(['fish'], false)).toEqual(['wind', 'tide', 'surf', 'sky', 'moon'])
  })
  it('the colour call and the wind to the beach in words', () => {
    expect(colorWords('Go')).toBe('color likely')
    expect(colorWords('Maybe')).toBe('color possible')
    expect(colorWords('Skip')).toBe('color unlikely')
    expect(colorWords(null)).toBeNull()
    expect(sideWords('Cross')).toBe('cross-shore')
    expect(sideWords('Offshore')).toBe('offshore')
    expect(sideWords('Onshore')).toBe('onshore')
  })
  it('a stored list is read tolerantly', () => {
    expect(reviveActivities('["surf","nonsense","surf","fish"]')).toEqual(['surf', 'fish'])
    expect(reviveActivities('{')).toBeNull()
    expect(reviveActivities(null)).toBeNull()
  })
})

describe('the Sky card strip (Batch Beach, Section 6)', () => {
  it('colour for Go and Maybe; grey for Unlikely and for no call', () => {
    expect(skyStripLit('Go')).toBe(true)
    expect(skyStripLit('Maybe')).toBe(true)
    expect(skyStripLit('Skip')).toBe(false)
    expect(skyStripLit(null)).toBe(false)
  })
})
