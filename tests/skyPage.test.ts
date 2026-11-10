import { describe, expect, it } from 'vitest'
import { getPosition } from 'suncalc'
import { colorHeadline, eventDayWord, lightMarks, lightTimeline, nextEvent, nowShare, plainChecks, plainReason, rareRows, RARE_KEPT, sideView, sunCrosses } from '../src/core/skyPage.ts'
import type { LayerRead } from '../src/core/fireOutlook.ts'
import type { Special } from '../src/core/specialLight.ts'

/* The Sky page (Batch Pages, Section 3; board SkyPage). */
const layer = (o: Partial<LayerRead>): LayerRead =>
  ({ layer: 'high', heightM: 8000, cover: 40, canvas: true, reachKm: 120, strip: null, times: null, open: 0.8, gap: 'open', gapBy: null, pastPath: false, openBy: null, under: [], hiddenBy: null, fires: true, why: null, ...o }) as LayerRead

describe('the three checks, said plainly', () => {
  it('cloud to light, the gap toward the sun, anything blocking', () => {
    expect(plainChecks(layer({}), 'WSW')).toEqual([
      { label: 'Clouds to light up', value: 'high cloud, 40%' },
      { label: 'Gap at the horizon (WSW)', value: 'open' },
      { label: 'Anything blocking the sun', value: 'no' },
    ])
    expect(plainChecks(layer({ gap: 'partial', hiddenBy: { layer: 'low', cover: 85 } }), 'W').map((c) => c.value)).toEqual(['high cloud, 40%', 'partly open', 'yes, low cloud 85%'])
  })
  it('no cloud: none, and the gap is not needed (never "clear")', () => {
    const v = plainChecks(layer({ canvas: false, cover: 5, fires: false, why: 'none' }), 'WSW').map((c) => c.value)
    expect(v).toEqual(['none', 'not needed', 'no'])
    expect(v.join(' ')).not.toMatch(/clear/i)
  })
  it('no forecast: dashes', () => {
    expect(plainChecks(null, '—').map((c) => c.value)).toEqual(['—', '—', '—'])
  })
})

describe('the headline and its reason', () => {
  it('the call in words, and the read\'s own first sentence', () => {
    expect(colorHeadline('Go')).toBe('Color likely')
    expect(colorHeadline('Maybe')).toBe('Color possible')
    expect(colorHeadline('Skip')).toBe('Color unlikely')
    expect(colorHeadline(null)).toBe('No call yet')
    expect(plainReason('Likely: 5 of 5 models see lit low deck. Final call 4:00 PM.')).toBe('5 of 5 models see lit low deck.')
    expect(plainReason('Unlikely: no clouds to catch the light')).toBe('No clouds to catch the light.')
    expect(plainReason(null)).toBeNull()
  })
})

describe("tonight's light", () => {
  const VB = { lat: 36.84, lon: -75.97 }
  const alt = (t: Date) => getPosition(t, VB.lat, VB.lon).altitude
  it('the sun crosses a height once, to the minute; never when it does not', () => {
    const set = new Date('2026-11-09T21:57:00Z')
    const dark = sunCrosses(alt, set, new Date(set.getTime() + 3 * 3_600_000), -6)
    expect(dark).not.toBeNull()
    expect(Math.abs(alt(dark as Date) + 6)).toBeLessThan(0.3)
    expect(sunCrosses(alt, set, new Date(set.getTime() + 600_000), -20)).toBeNull()
  })
  it('sunset: Golden, Set, Blue, Dark in order; sunrise: Blue, Glow, Rise, Day in order', () => {
    const set = lightMarks('sunset', new Date('2026-11-09T21:57:00Z'), alt)
    expect(set.map((m) => m.label)).toEqual(['Golden', 'Set', 'Blue', 'Dark'])
    const ts = set.map((m) => (m.at as Date).getTime())
    expect([...ts].sort((a, b) => a - b)).toEqual(ts)
    const rise = lightMarks('sunrise', new Date('2026-11-10T11:37:00Z'), alt)
    expect(rise.map((m) => m.label)).toEqual(['Blue', 'Glow', 'Rise', 'Day'])
    const tr = rise.map((m) => (m.at as Date).getTime())
    expect([...tr].sort((a, b) => a - b)).toEqual(tr)
  })
})

describe('rare light this week', () => {
  const now = new Date('2026-11-09T15:00:00Z')
  const sp = (kind: Special['kind'], hours: number, brief: string | undefined, agree = 3): Special => ({ kind, from: new Date(now.getTime() + hours * 3_600_000), to: new Date(now.getTime() + (hours + 2) * 3_600_000), agree, of: 5, word: 'possible', why: 'long why', brief })
  it('keeps rainbows, light rays, fog and mirror water; drops iridescence and sky color, and anything without its one line', () => {
    expect(RARE_KEPT).toEqual(['rainbow', 'rays', 'fog', 'glass'])
    const rows = rareRows([sp('iridescence', 5, 'thin cloud'), sp('fire', 6, 'x'), sp('rainbow', 20, 'showers to the east, sun 12° up in the west'), sp('fog', 40, undefined), sp('rays', 30, 'broken low cloud, sun 8° up')], now)
    expect(rows.map((r) => r.name)).toEqual(['Rainbow chance', 'Light rays'])
    expect(rows[0].why).toBe('showers to the east, sun 12° up in the west')
  })
  it('the likeliest four, then said in time order; nothing already over', () => {
    const rows = rareRows([sp('rays', 10, 'a', 1), sp('rays', 20, 'b', 5), sp('fog', 30, 'c', 4), sp('glass', 40, 'd', 4), sp('rainbow', 50, 'e', 3), sp('fog', -5, 'gone', 5)], now)
    expect(rows.map((r) => r.why)).toEqual(['b', 'c', 'd', 'e'])
  })
})

describe('rare light never repeats itself (Batch QA, Section 0: four identical "Light rays" rows)', () => {
  const now = new Date('2026-11-09T15:00:00Z')
  const sp = (kind: Special['kind'], hours: number, brief: string): Special => ({ kind, from: new Date(now.getTime() + hours * 3_600_000), to: new Date(now.getTime() + (hours + 2) * 3_600_000), agree: 3, of: 5, word: 'possible', why: 'long why', brief })
  it('the same kind for the same reason is said once, at its first time', () => {
    const rows = rareRows([sp('rays', 30, 'broken low cloud, sun 8° up'), sp('rays', 6, 'broken low cloud, sun 8° up'), sp('rays', 54, 'broken low cloud, sun 8° up'), sp('rays', 78, 'broken low cloud, sun 8° up')], now)
    expect(rows).toHaveLength(1)
    expect(rows[0].at.getTime()).toBe(now.getTime() + 6 * 3_600_000)
  })
  it('no two consecutive rows are the same item: a repeated name always carries a different reason and a different time', () => {
    const rows = rareRows([sp('rays', 6, 'a'), sp('rays', 30, 'a'), sp('rays', 30, 'b'), sp('fog', 40, 'c'), sp('fog', 64, 'c'), sp('glass', 70, 'd')], now)
    for (let i = 1; i < rows.length; i += 1) {
      const [p, r] = [rows[i - 1], rows[i]]
      if (p.name === r.name) {
        expect(r.why).not.toBe(p.why)
        expect(r.at.getTime()).not.toBe(p.at.getTime())
      }
    }
    expect(rows.map((r) => r.why)).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('never an event that has passed (Batch Flow, Section 4; field 9 Nov 8:31 PM)', () => {
  const TZ = 'America/New_York'
  const days = [
    { events: { sunrise: new Date('2026-11-09T11:36:00Z'), sunset: new Date('2026-11-09T21:59:00Z') } },
    { events: { sunrise: new Date('2026-11-10T11:37:00Z'), sunset: new Date('2026-11-10T21:58:00Z') } },
  ]
  const at831 = new Date('2026-11-10T01:31:00Z')
  it("at 8:31 PM: tomorrow's sunrise and tomorrow's sunset, said as tomorrow", () => {
    expect(nextEvent(days, 'sunset', at831)?.events.sunset?.toISOString()).toBe('2026-11-10T21:58:00.000Z')
    expect(nextEvent(days, 'sunrise', at831)?.events.sunrise?.toISOString()).toBe('2026-11-10T11:37:00.000Z')
    expect(eventDayWord(days[1].events.sunrise, 'sunrise', at831, TZ)).toBe('Tomorrow morning')
    expect(eventDayWord(days[1].events.sunset, 'sunset', at831, TZ)).toBe('Tomorrow evening')
  })
  it('before sunset: tonight', () => {
    const at3 = new Date('2026-11-09T20:00:00Z')
    expect(nextEvent(days, 'sunset', at3)).toBe(days[0])
    expect(eventDayWord(days[0].events.sunset, 'sunset', at3, TZ)).toBe('Tonight')
  })
})

describe('the light as one bar, and the side view', () => {
  const VB = { lat: 36.84, lon: -75.97 }
  const alt = (t: Date) => getPosition(t, VB.lat, VB.lon).altitude
  it("sunset: golden, color, blue, dark in order, the colour window the call's own; now on it or null", () => {
    const set = new Date('2026-11-09T21:57:00Z')
    const segs = lightTimeline('sunset', set, lightMarks('sunset', set, alt), new Date(set.getTime() - 60_000), new Date(set.getTime() + 17 * 60_000))
    expect(segs.map((g) => g.key)).toEqual(['golden', 'color', 'blue', 'dark'])
    expect(segs[1].to.getTime() - segs[1].from.getTime()).toBe(18 * 60_000)
    expect(nowShare(segs, new Date(set.getTime()))).toBeGreaterThan(0)
    expect(nowShare(segs, new Date(set.getTime() - 5 * 3_600_000))).toBeNull()
  })
  it('the decks at their heights, the low under the mid under the high; the light path to the deck spoken for', () => {
    const v = sideView([
      { layer: 'high', heightM: 9000, cover: 20, canvas: false, fires: false },
      { layer: 'mid', heightM: 4000, cover: 50, canvas: true, fires: true },
      { layer: 'low', heightM: 1000, cover: 5, canvas: false, fires: false },
    ], 0, 'mid')
    const y = Object.fromEntries(v.layers.map((l) => [l.layer, l.y]))
    expect(y.low).toBeGreaterThan(y.mid)
    expect(y.mid).toBeGreaterThan(y.high)
    expect(v.path?.to.y).toBe(y.mid)
    expect(sideView([{ layer: 'low', heightM: 1000, cover: 5, canvas: false, fires: false }], 0, 'low').path).toBeNull()
  })
})
