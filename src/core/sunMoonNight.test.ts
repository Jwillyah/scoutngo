import { getMoonIllumination, getMoonPosition, getPosition } from 'suncalc'
import { describe, expect, it } from 'vitest'
import { pickNight } from './moonrisePlan.ts'
import { localDate } from './moonTimes.ts'
import {
  bigMoonriseLine,
  darkestNights,
  darkestWindow,
  DARKEST_LIT,
  dayFromNow,
  dayRangeWords,
  dayWords,
  milkyWayLine,
  moonEvents,
  moonFortnight,
  moonTonight,
  nextBigMoonrise,
  nextShower,
  nightHeroWords,
  nightRead,
  northStar,
  northStarWords,
  opensOn,
  sunBoundaries,
  sunHero,
  sunHeroLine,
  sunsetGapWords,
  sunStrip,
  sunTonight,
} from './sunMoonNight.ts'
import { formatClock, zonedTimeToUtc } from './timezone.ts'

const VB = { lat: 36.85, lon: -75.98 }
const TZ = 'America/New_York'
const clock = (d: Date) => formatClock(d, TZ, 12)
/* 16 Nov 2026, 4:58 PM EST: five minutes after sunset. */
const DUSK = new Date('2026-11-16T21:58:00Z')
const NOON = new Date('2026-11-16T17:00:00Z')
const LATE = new Date('2026-11-17T03:30:00Z')

describe('the light’s edges', () => {
  it('runs dawn, glow, sunrise, day, golden, sunset, blue, dark in a day, in order', () => {
    const from = zonedTimeToUtc('2026-11-16', '00:00', TZ)!
    const kinds = sunBoundaries(from, new Date(from.getTime() + 86_400_000), VB.lat, VB.lon).map((b) => b.kind)
    expect(kinds).toEqual(['dawn', 'glow', 'sunrise', 'day', 'golden', 'sunset', 'blue', 'dark'])
  })

  it('puts each edge at its height on the sun’s apparent altitude', () => {
    const from = zonedTimeToUtc('2026-11-16', '00:00', TZ)!
    const want: Record<string, number> = { dawn: -6, glow: -4, day: 6, golden: 6, blue: -4, dark: -6 }
    for (const b of sunBoundaries(from, new Date(from.getTime() + 86_400_000), VB.lat, VB.lon)) {
      if (want[b.kind] === undefined) continue
      expect(Math.abs(getPosition(b.at, VB.lat, VB.lon).altitude - want[b.kind]), b.kind).toBeLessThan(0.15)
    }
  })
})

describe('the Sun tab', () => {
  it('five minutes after sunset: afterglow, 15 min to blue hour', () => {
    const h = sunHero(DUSK, VB.lat, VB.lon)
    expect(h.phase).toBe('afterglow')
    expect(clock(h.endsAt!)).toBe('5:13 PM')
    expect(h.minutesLeft).toBe(15)
    expect(sunHeroLine(h, clock, DUSK)).toBe('15 min left · sunrise 6:44 AM in the ESE')
  })

  it('at noon: daylight, and when golden light starts', () => {
    const h = sunHero(NOON, VB.lat, VB.lon)
    expect(h.phase).toBe('day')
    expect(sunHeroLine(h, clock, NOON)).toBe('golden light from 4:17 PM · sunset 4:53 PM in the WSW')
    expect(opensOn(h.phase)).toBe('sun')
  })

  it('in the dark: first light, and the Night tab opens', () => {
    const h = sunHero(LATE, VB.lat, VB.lon)
    expect(h.phase).toBe('dark')
    expect(sunHeroLine(h, clock, LATE)).toBe('first light 6:14 AM · sunrise 6:44 AM in the ESE')
    expect(opensOn(h.phase)).toBe('night')
  })

  it('tonight: golden passed, sunset now, blue and dark to come, and the next sunrise', () => {
    const t = sunTonight(DUSK, VB.lat, VB.lon, TZ)
    expect(t.rows.map((r) => `${r.kind} ${clock(r.at)} ${r.state}`)).toEqual(['golden 4:17 PM past', 'sunset 4:53 PM now', 'blue 5:13 PM next', 'dark 5:24 PM next'])
    expect(Math.round(t.rows[1].azimuth!)).toBe(247)
    expect(clock(t.sunrise!.at)).toBe('6:44 AM')
    expect(t.date).toBe('2026-11-16')
  })

  it('after dark, tonight is the next evening', () => {
    expect(sunTonight(LATE, VB.lat, VB.lon, TZ).date).toBe('2026-11-17')
  })

  it('carries a moonrise into tonight when the moon rises in the evening', () => {
    /* 26 Nov, two nights after full: the moon rises after sunset. */
    const t = sunTonight(new Date('2026-11-26T19:00:00Z'), VB.lat, VB.lon, TZ)
    const rise = t.rows.find((r) => r.kind === 'moonrise')
    expect(rise).toBeDefined()
    expect(rise!.at.getTime()).toBeGreaterThan(t.sunset!.getTime())
    expect(rise!.lit!).toBeGreaterThan(0.85)
  })

  it('draws the sun’s path with the sun in the middle, the horizon and compass points', () => {
    const s = sunStrip(DUSK, VB.lat, VB.lon)
    expect(s.sun.x).toBeCloseTo(0.5, 5)
    expect(s.path.length).toBeGreaterThan(30)
    expect(s.horizonY).toBeGreaterThan(0)
    expect(s.horizonY).toBeLessThan(1)
    expect(s.ticks.map((t) => t.label)).toContain('WSW')
  })

  it('says the Milky Way line from the planner, with its reason when not', () => {
    const night = { date: '2026-11-16', dark: null, window: null, shootMinutes: 0, maxCoreAltitude: null, moonFraction: 0.4, score: 0, reason: 'The core stays below the horizon.' }
    expect(milkyWayLine(night, clock)).toBe('Milky Way: not tonight. The core stays below the horizon.')
  })
})

describe('the Moon tab', () => {
  it('at noon on 16 Nov: rises 12:28 PM, highest, sets 11:08 PM', () => {
    const m = moonTonight(NOON, VB.lat, VB.lon, TZ)
    expect(m.up).toBe(false)
    expect(clock(m.rise!.at)).toBe('12:28 PM')
    expect(clock(m.set!.at)).toBe('11:08 PM')
    expect(m.highest!.at.getTime()).toBeGreaterThan(m.rise!.at.getTime())
    expect(m.highest!.at.getTime()).toBeLessThan(m.set!.at.getTime())
    /* The highest is the highest: a minute either side is lower. */
    const alt = (t: number) => getMoonPosition(new Date(t), VB.lat, VB.lon).altitude
    expect(alt(m.highest!.at.getTime() - 60_000)).toBeLessThanOrEqual(m.highest!.altitude)
    expect(alt(m.highest!.at.getTime() + 60_000)).toBeLessThanOrEqual(m.highest!.altitude)
    expect(m.afterSunsetMin).toBeLessThan(0)
  })

  it('after it rose, it is up and the set is still to come', () => {
    const m = moonTonight(DUSK, VB.lat, VB.lon, TZ)
    expect(m.up).toBe(true)
    expect(m.set!.at.getTime()).toBeGreaterThan(DUSK.getTime())
  })

  it('the rises and sets alternate', () => {
    const ev = moonEvents(NOON, new Date(NOON.getTime() + 10 * 86_400_000), VB.lat, VB.lon, TZ)
    expect(ev.length).toBeGreaterThan(15)
    for (let i = 1; i < ev.length; i += 1) expect(ev[i].kind).not.toBe(ev[i - 1].kind)
  })

  it('fourteen evenings, waxing to full on the 24th', () => {
    const days = moonFortnight(DUSK, TZ)
    expect(days).toHaveLength(14)
    expect(days[0].date).toBe('2026-11-16')
    const full = days.reduce((a, b) => (b.lit > a.lit ? b : a))
    expect(full.date).toBe('2026-11-24')
  })

  it('the darkest nights hold the new moon, each under DARKEST_LIT at midnight', () => {
    const d = darkestNights(DUSK, TZ)!
    const nm = localDate(d.newMoon, TZ)
    expect(d.from <= nm && nm <= d.to).toBe(true)
    expect(dayRangeWords(d.from, d.to)).toBe('Dec 4–12')
    for (let t = Date.parse(d.from); t <= Date.parse(d.to); t += 86_400_000) {
      const next = new Date(t + 86_400_000).toISOString().slice(0, 10)
      expect(getMoonIllumination(zonedTimeToUtc(next, '00:00', TZ)!).fraction).toBeLessThan(DARKEST_LIT)
    }
  })

  it('the next big moonrise is the moonrise plan’s own night', () => {
    const big = nextBigMoonrise(DUSK, VB.lat, VB.lon, TZ)!
    const plan = pickNight(VB, TZ, DUSK).best!
    expect(big.date).toBe(plan.date)
    expect(big.moonrise.getTime()).toBe(plan.moonrise!.getTime())
    expect(dayWords(big.date)).toBe('Tue 24 Nov')
    expect(bigMoonriseLine(big, clock)).toMatch(/^Rises 4:3\d PM, \d+ min before sunset$/)
  })

  it('says a gap to sunset either way', () => {
    expect(sunsetGapWords(89)).toBe('1 h 29 m after sunset')
    expect(sunsetGapWords(-19)).toBe('19 min before sunset')
    expect(sunsetGapWords(0)).toBe('at sunset')
  })
})

describe('the Night tab', () => {
  it('in the afternoon, about tonight’s dark; the coming events in order, all still to come', () => {
    const n = nightRead(NOON, VB.lat, VB.lon, TZ)
    expect(n.isNow).toBe(false)
    expect(clock(n.at)).toBe('5:24 PM')
    for (let i = 1; i < n.next.length; i += 1) expect(n.next[i].at.getTime()).toBeGreaterThanOrEqual(n.next[i - 1].at.getTime())
    expect(n.next.every((e) => e.at.getTime() > NOON.getTime())).toBe(true)
    expect(nightHeroWords(n).title).toBe('Moon up, 45%')
  })

  it('in the night, about now', () => {
    const n = nightRead(LATE, VB.lat, VB.lon, TZ)
    expect(n.isNow).toBe(true)
    expect(n.at.getTime()).toBe(LATE.getTime())
    expect(n.next[0].kind).toBe('moonset')
  })

  it('the darkest window: full dark with the moon down, all through', () => {
    const n = nightRead(NOON, VB.lat, VB.lon, TZ)
    const w = darkestWindow(n.milkyWay, VB.lat, VB.lon)!
    expect(clock(w.from)).toBe('11:08 PM')
    expect(w.from.getTime()).toBeGreaterThanOrEqual(n.milkyWay.dark!.from.getTime())
    expect(w.to.getTime()).toBeLessThanOrEqual(n.milkyWay.dark!.to.getTime())
    for (let t = w.from.getTime(); t <= w.to.getTime(); t += 10 * 60_000) expect(getMoonPosition(new Date(t), VB.lat, VB.lon).altitude).toBeLessThan(0)
  })

  it('the North Star stands due north at the latitude’s height', () => {
    const p = northStar(LATE, VB.lat, VB.lon)
    expect(Math.abs(p.altitude - VB.lat)).toBeLessThan(1)
    expect(Math.min(p.azimuth, 360 - p.azimuth)).toBeLessThan(2)
    expect(northStarWords(p)).toMatch(/^N, 3[678]° up$/)
    expect(northStarWords(northStar(LATE, -33.9, 151.2))).toBe('below the horizon here')
  })

  it('the next shower from the IMO table, across the new year', () => {
    expect(nextShower(DUSK, TZ)!.shower.id).toBe('leonids')
    expect(nextShower(DUSK, TZ)!.nights).toEqual(['2026-11-16', '2026-11-17'])
    expect(nextShower(new Date('2026-12-20T17:00:00Z'), TZ)!.shower.id).toBe('ursids')
    const q = nextShower(new Date('2026-12-28T17:00:00Z'), TZ)!
    expect(q.shower.id).toBe('quadrantids')
    expect(q.peak).toBe('2027-01-03')
  })
})

describe('words', () => {
  it('day words on the venue’s calendar', () => {
    expect(dayFromNow(new Date('2026-11-17T01:00:00Z'), DUSK, TZ)).toBe('Today')
    expect(dayFromNow(new Date('2026-11-17T17:00:00Z'), DUSK, TZ)).toBe('Tomorrow')
    expect(dayFromNow(new Date('2026-11-19T17:00:00Z'), DUSK, TZ)).toBe('Thu')
    expect(dayRangeWords('2026-11-29', '2026-12-03')).toBe('Nov 29–Dec 3')
  })

  it('never says clear or safe', () => {
    const said: string[] = []
    for (const at of [DUSK, NOON, LATE]) {
      said.push(sunHeroLine(sunHero(at, VB.lat, VB.lon), clock, at))
      const n = nightRead(at, VB.lat, VB.lon, TZ)
      said.push(nightHeroWords(n).title, nightHeroWords(n).line, milkyWayLine(n.milkyWay, clock), ...n.next.map((e) => e.label))
    }
    expect(said.length).toBeGreaterThan(10)
    for (const s of said) expect(s).not.toMatch(/\b(clear|safe)\b/i)
  })

  it('far north in December, where the sun barely rises, still answers', () => {
    const h = sunHero(new Date('2026-12-21T12:00:00Z'), 69.65, 18.96)
    expect(['dark', 'blue', 'first-light', 'afterglow', 'golden']).toContain(h.phase)
  })
})
