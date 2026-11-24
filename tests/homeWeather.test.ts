import { getTimes } from 'suncalc'
import { describe, expect, it } from 'vitest'
import { cloudBandWords, rainStripShown, RAIN_SHOW_PCT, skyPhrase, slotLabel, stripFrom, STRIP_HOURS, weatherStrip } from '../src/core/homeWeather.ts'
import { fogMoment, MOMENT_RANK, pickMoment, rainMoment } from '../src/core/homeTiles.ts'
import { moonHomeMoment } from '../src/core/moonMoment.ts'
import type { RainNow } from '../src/core/rainNow.ts'

/*
 * BATCH SIMPLE-3, SECTION 2 (Home_Visual) AND 2.5: the home's weather tile,
 * worked out (src/core/homeWeather.ts); the rain and fog moments and the
 * moon card (src/core/homeTiles.ts, src/core/moonMoment.ts).
 */

const TZ = 'America/New_York'
const SPOT = { lat: 36.851, lon: -75.98 }
/** Tue 24 Nov 2026, 2:20 PM EST. */
const NOW = new Date('2026-11-24T19:20:00Z')
const flat = () => ({ icon: 'cloud' as const, tC: 18, rainPct: 10 })

describe('the 48-hour strip', () => {
  const slots = weatherStrip({ now: NOW, timeZone: TZ, ...SPOT, hour: flat })
  const hours = slots.filter((s) => s.kind === 'hour')
  it('48 hour slots from this hour, an hour apart, the first "Now"', () => {
    expect(STRIP_HOURS).toBe(48)
    expect(hours).toHaveLength(48)
    expect(hours[0].at).toBe(Date.parse('2026-11-24T19:00:00Z'))
    for (let i = 1; i < hours.length; i += 1) expect(hours[i].at - hours[i - 1].at).toBe(3_600_000)
    expect(slotLabel(hours[0], true, TZ)).toBe('Now')
    expect(slotLabel(hours[1], false, TZ)).toBe('3p')
  })
  it('a new day says its weekday in place of 12a: "Wed", then "Thu"', () => {
    const breaks = hours.filter((s) => s.dayBreak)
    expect(breaks.map((s) => slotLabel(s, false, TZ))).toEqual(['Wed', 'Thu'])
    expect(breaks[0].at).toBe(Date.parse('2026-11-25T05:00:00Z'))
  })
  it('the sunsets and sunrise in the span each have a slot at their own time, between their hours', () => {
    const suns = slots.filter((s) => s.kind === 'sun')
    expect(suns.map((s) => s.sun)).toEqual(['sunset', 'sunrise', 'sunset', 'sunrise'])
    const set = getTimes(new Date('2026-11-24T17:00:00Z'), SPOT.lat, SPOT.lon).sunset!.getTime()
    expect(suns[0].at).toBe(set)
    expect(slotLabel(suns[0], false, TZ)).toMatch(/^4:\d\dp$/)
    const i = slots.indexOf(suns[0])
    expect(slots[i - 1].at).toBeLessThan(set)
    expect(slots[i + 1].at).toBeGreaterThan(set)
    expect(slots.every((s, k) => k === 0 || s.at >= slots[k - 1].at)).toBe(true)
  })
  it('rain under the icon only at 20% or more', () => {
    const pct = [0, 10, 19.4, 20, 35, 80, null]
    const start = Date.parse('2026-11-24T19:00:00Z')
    const s = weatherStrip({ now: NOW, timeZone: TZ, ...SPOT, hours: pct.length, hour: (t) => ({ icon: 'rain', tC: 15, rainPct: pct[Math.floor((t.getTime() - start) / 3_600_000)] }) }).filter((x) => x.kind === 'hour')
    expect(RAIN_SHOW_PCT).toBe(20)
    expect(s.map((x) => x.rainPct)).toEqual([null, null, null, 20, 35, 80, null])
  })
  it('a kept strip read later starts at the hour it is now', () => {
    const later = new Date(NOW.getTime() + 3 * 3_600_000)
    const left = stripFrom(slots, later)
    expect(left[0].at).toBe(Date.parse('2026-11-24T22:00:00Z'))
    expect(left.some((s) => s.kind === 'sun' && s.at < later.getTime())).toBe(false)
  })
})

describe('the line', () => {
  it('one short phrase on a fast-cloud day, never the "0–100%"', () => {
    expect(skyPhrase('Mostly cloudy', { lo: 0, hi: 100 })).toBe('Partly cloudy · clouds moving fast')
    expect(skyPhrase('Clear', { lo: 60, hi: 100 })).toBe('Mostly cloudy · clouds moving fast')
    expect(skyPhrase('Overcast', null)).toBe('Overcast')
    expect(skyPhrase(null, null)).toBeNull()
    expect(skyPhrase('x', { lo: 0, hi: 100 })).not.toMatch(/%/)
  })
  it('the sky tile\'s band: "overcast now · clears 4p"', () => {
    const at = (h: number) => new Date(Date.parse('2026-11-24T05:00:00Z') + h * 3_600_000)
    expect(cloudBandWords(95, [{ at: at(15), pct: 90 }, { at: at(16), pct: 30 }], TZ)).toBe('overcast now · clears 4p')
    expect(cloudBandWords(10, [{ at: at(15), pct: 80 }], TZ)).toBe('little cloud now · clouds 3p')
    expect(cloudBandWords(50, [{ at: at(15), pct: 0 }], TZ)).toBe('some cloud now')
    expect(cloudBandWords(null, [], TZ)).toBeNull()
  })
})

describe('the rain strip takes the line\'s place when rain is now or within 2 h', () => {
  const r = (o: Partial<RainNow>): RainNow => ({ state: 'dry', intensity: null, startsAt: null, endsAt: null, endsBy: false, movingTowardDeg: null, bars: [], by: [], ...o })
  const bar = (mm: number | null) => ({ from: NOW, to: NOW, mm, intensity: null })
  it('raining now, or starting within 2 h, or a wet quarter hour in the bars: the strip', () => {
    expect(rainStripShown(r({ state: 'raining' }), NOW)).toBe(true)
    expect(rainStripShown(r({ state: 'starting', startsAt: new Date(NOW.getTime() + 20 * 60_000) }), NOW)).toBe(true)
    expect(rainStripShown(r({ state: 'dry', bars: [bar(0), bar(0.2)] }), NOW)).toBe(true)
  })
  it('dry, nearby, unknown, or starting later: the line', () => {
    expect(rainStripShown(null, NOW)).toBe(false)
    expect(rainStripShown(r({ state: 'dry', bars: [bar(0), bar(null)] }), NOW)).toBe(false)
    expect(rainStripShown(r({ state: 'nearby' }), NOW)).toBe(false)
    expect(rainStripShown(r({ state: 'unknown' }), NOW)).toBe(false)
    expect(rainStripShown(r({ state: 'starting', startsAt: new Date(NOW.getTime() + 3 * 3_600_000) }), NOW)).toBe(false)
  })
})

describe('the rain and fog moments', () => {
  it('"Rain in 20 min" for Surf, Shoot and Drone, not for Fish or Just weather', () => {
    const m = rainMoment({ state: 'starting', startsAt: new Date(NOW.getTime() + 20 * 60_000), intensity: 'light' }, NOW, TZ)
    expect(m?.eyebrow).toBe('Rain in 20 m')
    expect(m?.line).toBe('Light · from 2:40 PM')
    expect(m?.target).toBe('weather')
    for (const p of ['surf', 'shoot', 'drone'] as const) expect(pickMoment([m], p, NOW)?.kind).toBe('rain')
    for (const p of ['fish', 'weather'] as const) expect(pickMoment([m], p, NOW)).toBeNull()
    expect(MOMENT_RANK.fish).not.toContain('rain')
  })
  it('no card for rain already falling, or more than an hour off', () => {
    expect(rainMoment({ state: 'raining', startsAt: null, intensity: 'light' }, NOW, TZ)).toBeNull()
    expect(rainMoment({ state: 'starting', startsAt: new Date(NOW.getTime() + 90 * 60_000), intensity: 'light' }, NOW, TZ)).toBeNull()
  })
  it('fog: high now says the fog\'s own line; a likely window within 3 h; moderate is no card', () => {
    const w = { from: new Date(NOW.getTime() + 2 * 3_600_000), to: new Date(NOW.getTime() + 5 * 3_600_000), level: 'high' }
    expect(fogMoment({ line: 'Fog on the beach', now: { level: 'high' }, windows: [] }, NOW)?.line).toBe('Fog on the beach')
    expect(fogMoment({ line: 'Fog likely 4–7 PM', now: { level: 'low' }, windows: [w] }, NOW)?.eyebrow).toBe('Fog in 2 h')
    expect(fogMoment({ line: 'Fog possible now', now: { level: 'moderate' }, windows: [] }, NOW)).toBeNull()
  })
})

describe('the moon card, 23 Nov at 10:27 PM (Home_Moon)', () => {
  const at = new Date('2026-11-24T03:27:00Z')
  const m = moonHomeMoment(at, SPOT.lat, SPOT.lon, TZ)
  it('"Supermoon tomorrow · Tue 24", rises ENE at sunset, opens Sky › Night', () => {
    expect(m?.which).toBe('supermoon')
    expect(m?.eyebrow).toBe('Supermoon tomorrow · Tue 24')
    expect(m?.line).toMatch(/^Rises 4:3\d PM ENE · at sunset$/)
    expect(m?.target).toBe('sky-night')
  })
  it('a Supermoon shows whatever the persona, over a clean window or rain coming', () => {
    const rain = rainMoment({ state: 'starting', startsAt: new Date(at.getTime() + 20 * 60_000), intensity: 'light' }, at, TZ)
    for (const p of ['surf', 'shoot', 'fish', 'drone', 'weather', null] as const) expect(pickMoment([rain, m], p, at)).toBe(m)
  })
})
