import { getTimes } from 'suncalc'
import { describe, expect, it } from 'vitest'
import {
  atFraction,
  barSpan,
  barTicks,
  dailyPeaks,
  dayExtremes,
  daysToReach,
  fractionOf,
  HOUR_MS,
  KT_PER_MPS,
  localMidnight,
  nightSpans,
  onBar,
  percentBand,
  prefetchWindow,
  tidePlot,
  windArrows,
  windBand,
  windPlot,
  type WindHour,
} from './layerTimeline.ts'
import type { TideExtreme } from './tide.ts'

const TZ = 'America/New_York'
/* Croatan Jetty, Virginia Beach; Mon 16 Nov 2026, 11:05 AM EST (16:05Z), the boards' moment. */
const SPOT = { lat: 36.8222, lon: -75.9743 }
const NOW = new Date('2026-11-16T16:05:00Z')
const kt = (k: number) => k / KT_PER_MPS

describe('the bar', () => {
  it('starts at midnight at the spot and runs five days by the hour', () => {
    const s = barSpan(NOW, TZ)
    expect(s.from.toISOString()).toBe('2026-11-16T05:00:00.000Z')
    expect(s.hours).toBe(120)
  })
  it('is 121 hours across the November clock change (25 h Sunday)', () => {
    const s = barSpan(new Date('2026-10-31T16:00:00Z'), TZ)
    expect(s.from.toISOString()).toBe('2026-10-31T04:00:00.000Z')
    expect(s.hours).toBe(121)
  })
  it('midnight on the day of an instant just after local midnight', () => {
    expect(localMidnight(new Date('2026-11-17T05:30:00Z'), TZ).toISOString()).toBe('2026-11-17T05:00:00.000Z')
    expect(localMidnight(new Date('2026-11-17T04:30:00Z'), TZ).toISOString()).toBe('2026-11-16T05:00:00.000Z')
  })
  it('a point of the bar is the hour it falls in, and back', () => {
    const s = barSpan(NOW, TZ)
    const at = atFraction(s, fractionOf(NOW, s))
    expect(at.toISOString()).toBe('2026-11-16T16:00:00.000Z')
    expect(atFraction(s, -1).getTime()).toBe(s.from.getTime())
    expect(atFraction(s, 2).getTime()).toBe(s.from.getTime() + 119 * HOUR_MS)
    expect(fractionOf(new Date(0), s)).toBe(0)
  })
  it('five day names, Mon to Fri, and hour ticks every six hours between them', () => {
    const s = barSpan(NOW, TZ)
    const t = barTicks(s, TZ)
    expect(t.days.map((d) => d.at.toISOString())).toEqual(['2026-11-16T05:00:00.000Z', '2026-11-17T05:00:00.000Z', '2026-11-18T05:00:00.000Z', '2026-11-19T05:00:00.000Z', '2026-11-20T05:00:00.000Z'])
    expect(t.days[0].x).toBe(0)
    expect(t.days[0].mid).toBeCloseTo(0.1)
    /* 06, 12, 18 each day, and the closing midnight at the far end. */
    expect(t.hours).toHaveLength(16)
  })
})

describe('the wind scale', () => {
  it('bands at 0 / 7 / 12 / 17 / 25+ kt', () => {
    expect([0, 6.9, 7, 11.9, 12, 16.9, 17, 24.9, 25, 40].map(windBand)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4])
  })
})

describe('the wind plot', () => {
  const s = barSpan(NOW, TZ)
  const hours: WindHour[] = Array.from({ length: 120 }, (_, i) => ({ mps: kt(8 + (i % 24 === 14 ? 6 : 0)), gustMps: kt(12), fromDeg: 337.5 }))
  it('an arrow every 6 h at the spot, pointing where the wind blows', () => {
    const a = windArrows(hours, s, TZ)
    expect(a).toHaveLength(20)
    expect(a[0].x).toBeCloseTo(0.5 / 120)
    expect(a[1].x).toBeCloseTo(6.5 / 120)
    /* From NNW (337.5) it blows to SSE (157.5). */
    expect(a[0].toDeg).toBeCloseTo(157.5)
  })
  it('no arrow where the forecast gave no direction', () => {
    const gaps = hours.map((h, i) => (i < 12 ? { ...h, fromDeg: null } : h))
    expect(windArrows(gaps, s, TZ)).toHaveLength(18)
  })
  it('bars by band, a gust cap above each, the drone limit as a height', () => {
    const p = windPlot(hours, s, TZ, kt(23))
    expect(p.bars).toHaveLength(120)
    expect(p.bars[0].band).toBe(1)
    expect(p.bars[14].band).toBe(2)
    /* The top: the scale's 25 kt (above the 23 kt limit and every gust), with 15% room. */
    expect(p.topKt).toBeCloseTo(25 * 1.15)
    expect(p.limitH).toBeCloseTo(23 / (25 * 1.15))
    expect(p.bars[0].gustH).toBeCloseTo(12 / (25 * 1.15))
    expect(p.bars[0].h).toBeLessThan(p.bars[0].gustH ?? 0)
  })
  it('no limit line without a chosen drone; a limit above every gust sets the top', () => {
    expect(windPlot(hours, s, TZ, null).limitH).toBeNull()
    expect(windPlot(hours, s, TZ, kt(35)).topKt).toBeCloseTo(35 * 1.15)
  })
  it("each day's peak labelled once, at its strongest hour", () => {
    const p = windPlot(hours, s, TZ, null)
    expect(p.peaks).toHaveLength(5)
    expect(p.peaks[0].kt).toBeCloseTo(14)
    expect(p.peaks[0].x).toBeCloseTo(14.5 / 120)
    expect(p.peaks[1].x).toBeCloseTo(38.5 / 120)
  })
  it('a missing hour is no bar, not a zero', () => {
    const gaps = hours.map((h, i) => (i === 3 ? { ...h, mps: null } : h))
    expect(windPlot(gaps, s, TZ, null).bars).toHaveLength(119)
  })
  it('a day with no values has no peak', () => {
    expect(dailyPeaks(Array.from({ length: 120 }, (_, i) => (i < 24 ? null : 5)), s, TZ)).toHaveLength(4)
  })
})

describe('the night', () => {
  it('shaded from sunset to sunrise at the spot, within the 10 minute step', () => {
    const s = barSpan(NOW, TZ)
    const n = nightSpans(s, SPOT.lat, SPOT.lon)
    /* Midnight to sunrise Monday, then each night to the end of Friday. */
    expect(n).toHaveLength(6)
    expect(n[0].x0).toBe(0)
    const set = getTimes(new Date('2026-11-16T17:00:00Z'), SPOT.lat, SPOT.lon).sunset as Date
    const at = s.from.getTime() + n[1].x0 * s.hours * HOUR_MS
    expect(Math.abs(at - set.getTime())).toBeLessThanOrEqual(11 * 60_000)
    expect(n[5].x1).toBe(1)
  })
})

describe('the tide', () => {
  const s = barSpan(NOW, TZ)
  /* A 12.42 h tide, 0.5 to 3.0 ft, high at 8:12 AM EST Monday. */
  const high0 = Date.parse('2026-11-16T13:12:00Z')
  const curve = Array.from({ length: 6 * 24 * 10 }, (_, i) => {
    const t = s.from.getTime() - 12 * HOUR_MS + i * 6 * 60_000
    return { at: new Date(t), feet: 1.75 + 1.25 * Math.cos(((t - high0) / (12.42 * HOUR_MS)) * 2 * Math.PI) }
  })
  it('the curve across the bar, every half hour, scaled to its own range', () => {
    const p = tidePlot(curve, s)
    expect(p.points).toHaveLength(241)
    expect(p.lo).toBeCloseTo(0.5, 1)
    expect(p.hi).toBeCloseTo(3.0, 1)
    for (const q of p.points) expect(q.y).toBeGreaterThanOrEqual(0)
  })
  it('no curve from fewer than two samples', () => {
    expect(tidePlot(curve.slice(0, 1), s).points).toHaveLength(0)
  })
  it("the day's high and low: High 3.0 ft 8:12a · Low 0.5 ft 2:24p", () => {
    const ex: TideExtreme[] = [
      { at: new Date('2026-11-16T07:00:00Z'), feet: 0.6, kind: 'low' },
      { at: new Date('2026-11-16T13:12:00Z'), feet: 3.0, kind: 'high' },
      { at: new Date('2026-11-16T19:24:00Z'), feet: 0.5, kind: 'low' },
      { at: new Date('2026-11-17T01:30:00Z'), feet: 2.8, kind: 'high' },
      { at: new Date('2026-11-17T08:00:00Z'), feet: 0.2, kind: 'low' },
    ]
    const d = dayExtremes(ex, NOW, TZ)
    expect(d.high?.at.toISOString()).toBe('2026-11-16T13:12:00.000Z')
    expect(d.low?.at.toISOString()).toBe('2026-11-16T19:24:00.000Z')
    expect(dayExtremes([], NOW, TZ)).toEqual({ high: null, low: null })
  })
})

describe('the % band', () => {
  it('each hour 0 to 1, held to 0-100, nothing where it said nothing', () => {
    const s = barSpan(NOW, TZ)
    const b = percentBand([50, null, 120, -5], s)
    expect(b.map((x) => x.h)).toEqual([0.5, 1, 0])
  })
})

describe('the frames held for a drag', () => {
  it('24 h either side of the thumb', () => {
    const w = prefetchWindow(NOW)
    expect(w.to.getTime() - NOW.getTime()).toBe(24 * HOUR_MS)
    expect(NOW.getTime() - w.from.getTime()).toBe(24 * HOUR_MS)
  })
  it('the days to ask for reach the window, three at least, seven at most', () => {
    expect(daysToReach(prefetchWindow(NOW).to, NOW)).toBe(3)
    expect(daysToReach(new Date(NOW.getTime() + 4 * 86_400_000), NOW)).toBe(5)
    expect(daysToReach(new Date(NOW.getTime() + 30 * 86_400_000), NOW)).toBe(7)
  })
  it('a series laid on the bar by its own start hour', () => {
    const s = barSpan(NOW, TZ)
    /* A series from 00:00Z, five hours before the bar. */
    const v = onBar([0, 1, 2, 3, 4, 5, 6], Date.parse('2026-11-16T00:00:00Z'), s)
    expect(v.slice(0, 3)).toEqual([5, 6, null])
    expect(v).toHaveLength(120)
  })
})
