import { describe, expect, it } from 'vitest'
import { bestStretch, barRuns, dayWord, stretchWords, surfBars, surfHero, surfSub, windFromNow, BEST_MIN_FT } from './surfTapIn.ts'
import { DEFAULT_UNITS } from './units.ts'
import type { RangeHour } from './surfPageData.ts'
import type { SurfCall } from '../core/surfCall.ts'

/* Surf_Now: "NOW · POOR · 1–2 ft · Choppy · NNE 8 kt cross-shore"; fixtures, not observations. */
const NY = 'America/New_York'
const H = 3_600_000
const NOW = new Date(Date.UTC(2026, 10, 19, 15, 10)) // 10:10 AM EST
const hour = (k: number, o: Partial<RangeHour> = {}): RangeHour =>
  ({ at: new Date(Date.UTC(2026, 10, 19, 15, 30) + k * H), centerFt: 2, clean: false, chop: false, shape: 'Bumpy', windKt: 8, side: null, periodS: 9, fromDeg: 90, ...o }) as RangeHour
const SERIES = Array.from({ length: 50 }, (_, k) => hour(k - 1))

describe('surfBars', () => {
  it('is 24 hourly bars from the hour before this one', () => {
    const { from, to, bars } = surfBars(SERIES, NOW)
    expect(from.toISOString()).toBe('2026-11-19T14:00:00.000Z')
    expect(to.getTime() - from.getTime()).toBe(24 * H)
    expect(bars).toHaveLength(24)
    expect(bars[0].at.toISOString()).toBe('2026-11-19T14:30:00.000Z')
  })
  it('draws only the hours the forecast gave', () => {
    expect(surfBars(SERIES.slice(0, 5), NOW).bars.length).toBe(5)
    expect(surfBars([], NOW).bars).toEqual([])
  })
})

describe('the clean stretches', () => {
  const clean = (ks: number[]) => SERIES.map((h, i) => (ks.includes(i - 1) ? { ...h, clean: true } : h))
  it('barRuns joins consecutive clean hours', () => {
    const { bars } = surfBars(clean([3, 4, 5, 9]), NOW)
    expect(barRuns(bars).map((r) => [(r.to.getTime() - r.from.getTime()) / H, r.from.toISOString()])).toEqual([
      [3, '2026-11-19T18:00:00.000Z'],
      [1, '2026-11-20T00:00:00.000Z'],
    ])
  })
  it('bestStretch is the run with the biggest hour, still to come', () => {
    const s = clean([2, 3, 20, 21]).map((h, i) => (i - 1 === 21 ? { ...h, centerFt: 3.4 } : h))
    const best = bestStretch(s, NOW)
    expect(best).not.toBeNull()
    expect(best!.peakFt).toBe(3.4)
    expect(best!.from.toISOString()).toBe('2026-11-20T11:00:00.000Z')
    expect(stretchWords(best!, NOW, NY)).toBe('6a–8a tmrw')
  })
  it('an hour already over does not count, and a flat clean stretch is not offered', () => {
    expect(bestStretch(clean([-1]), NOW)).toBeNull()
    expect(bestStretch(clean([4]).map((h) => ({ ...h, centerFt: BEST_MIN_FT - 0.1 })), NOW)).toBeNull()
  })
  it('none clean is null, never a made-up window', () => {
    expect(bestStretch(SERIES, NOW)).toBeNull()
  })
  it('an earlier run wins a tie', () => {
    expect(bestStretch(clean([2, 10]), NOW)!.from.toISOString()).toBe('2026-11-19T17:00:00.000Z')
  })
})

describe('dayWord', () => {
  it('says nothing for today, tmrw, then the weekday', () => {
    expect(dayWord(NOW, NOW, NY)).toBe('')
    expect(dayWord(new Date(NOW.getTime() + 24 * H), NOW, NY)).toBe('tmrw')
    expect(dayWord(new Date(NOW.getTime() + 48 * H), NOW, NY)).toBe('Sat')
  })
})

describe('the hero', () => {
  const call: SurfCall = { lowFt: 1, highFt: 2, words: '1–2 ft', size: 'Flat', wind: 'messy, cross-shore', confidence: 'firm', quality: 'Poor · choppy' }
  it('reads "NOW · POOR", the range, and the texture with the wind', () => {
    const h = surfHero(call, hour(0, { chop: true, windKt: 8 }), 'cross-shore', 22.5, DEFAULT_UNITS)
    expect(h).toEqual({ eyebrow: 'NOW · POOR', value: '1–2 ft', sub: 'Choppy · NNE 8 kt cross-shore', shared: '1–2 ft' })
  })
  it('uses the size tag when the wind does not chop it', () => {
    expect(surfHero({ ...call, quality: null, size: 'Fun' }, hour(0, { shape: 'Clean', windKt: 3 }), 'offshore', 270, DEFAULT_UNITS).eyebrow).toBe('NOW · FUN')
    expect(surfSub(hour(0, { shape: 'Clean', windKt: 3 }), 'offshore', 270, DEFAULT_UNITS)).toBe('Clean · W 3 kt offshore')
  })
  it('says what it does not know: a dash and words, never a zero', () => {
    expect(surfHero(null, null, null, null, DEFAULT_UNITS)).toEqual({ eyebrow: 'NOW', value: '—', sub: 'The forecast did not say for this hour', shared: null })
    expect(surfSub(hour(0, { windKt: null, shape: null }), null, null, DEFAULT_UNITS)).toBe('wind not forecast')
    expect(surfSub(hour(0, { windKt: 8, shape: null }), null, null, DEFAULT_UNITS)).toBe('8 kt')
  })
  it('wind in the Settings unit', () => {
    expect(surfSub(hour(0, { windKt: 10, shape: null }), null, 0, { ...DEFAULT_UNITS, wind: 'mph' })).toBe('N 12 mph')
  })
})

describe('windFromNow', () => {
  const t0 = Date.UTC(2026, 10, 19, 15)
  const wind = { times: [t0, t0 + H], values: { wind_speed_10m: [4, 4], wind_direction_10m: [45, 45] } }
  it('is the forecast’s direction at the hour, null with none', () => {
    expect(windFromNow({ wind }, NOW, null)).toBe(45)
    expect(windFromNow({ wind: null }, NOW, null)).toBeNull()
  })
})
