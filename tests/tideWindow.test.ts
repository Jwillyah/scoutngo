import { describe, expect, it } from 'vitest'
import { phaseBySynodic } from '../src/core/moonTides.ts'
import { curveFromExtremes, type TideExtreme } from '../src/core/tide.ts'
import { CURVE_PAD_PX, dayRangeFeet, LABEL_H, LABEL_HALF_W, moonLitPercent, NOW_LABEL, nextTurns, SCRUB_RETURN_MS, tideDayWindow, tideHeight, timeAtShare, untilWords } from '../src/core/tideWindow.ts'
import { cToF, WETSUIT_BANDS, wetsuitFor } from '../src/core/wetsuit.ts'

/*
 * A FIXTURE TIDE, NOT AN OBSERVATION: semidiurnal turns 6 h 12 min apart
 * from 1 Nov 2026 00:30 UTC, highs 3.9 ft and lows 0.3 ft. The shape of an
 * east-coast tide, so the drawing is exercised on a real-looking day.
 */
const T0 = Date.UTC(2026, 10, 1, 0, 30)
const STEP = (6 * 60 + 12) * 60_000
const EXTREMES: TideExtreme[] = Array.from({ length: 16 }, (_, i) => ({ at: new Date(T0 + i * STEP), feet: i % 2 === 0 ? 3.9 : 0.3, kind: i % 2 === 0 ? ('high' as const) : ('low' as const) }))
const CURVE = curveFromExtremes(EXTREMES)
const NY = 'America/New_York'
const VB = { lat: 36.85, lon: -75.98 }

describe('untilWords', () => {
  const at = new Date(T0)
  const plus = (min: number) => new Date(T0 + min * 60_000)
  it('says minutes under an hour, hours and minutes past it', () => {
    expect(untilWords(at, plus(45))).toBe('45 min')
    expect(untilWords(at, plus(192))).toBe('3 h 12 min')
    expect(untilWords(at, plus(120))).toBe('2 h')
    expect(untilWords(at, plus(0))).toBe('0 min')
  })
  it('says nothing for a moment already past', () => {
    expect(untilWords(at, plus(-5))).toBeNull()
  })
})

describe('nextTurns', () => {
  it('finds the next high, the next low and the next of either', () => {
    const t = nextTurns(EXTREMES, new Date(T0 + 60_000))
    expect(t.next?.kind).toBe('low')
    expect(t.low?.at.getTime()).toBe(T0 + STEP)
    expect(t.high?.at.getTime()).toBe(T0 + 2 * STEP)
  })
  it('says null past the table', () => {
    expect(nextTurns(EXTREMES, new Date(T0 + 20 * STEP)).next).toBeNull()
  })
})

describe('dayRangeFeet', () => {
  it('is the highest high less the lowest low on the venue day', () => {
    expect(dayRangeFeet(EXTREMES, '2026-11-02', NY)).toBeCloseTo(3.6, 6)
  })
  it('is null on a day with no high or no low in the table', () => {
    expect(dayRangeFeet(EXTREMES, '2026-12-25', NY)).toBeNull()
  })
})

describe('tideDayWindow: the day, drawn', () => {
  const W = 330
  const H = 150
  const model = (now: Date, date = '2026-11-02') => tideDayWindow({ now, date, timeZone: NY, curve: CURVE, extremes: EXTREMES, lat: VB.lat, lon: VB.lon, width: W, height: H })

  it('runs midnight to midnight at the venue, 25 hours on the day the clocks go back', () => {
    const plain = model(new Date('2026-11-02T15:00:00Z'))
    expect(plain).not.toBeNull()
    expect(((plain?.to ?? 0) - (plain?.from ?? 0)) / 3_600_000).toBe(24)
    expect(plain?.from).toBe(Date.parse('2026-11-02T05:00:00Z'))
    const back = model(new Date('2026-11-01T15:00:00Z'), '2026-11-01')
    expect(((back?.to ?? 0) - (back?.from ?? 0)) / 3_600_000).toBe(25)
  })

  it('puts every turn of the day on the line, labels kept inside the drawing', () => {
    const m = model(new Date('2026-11-02T15:00:00Z'))
    const day = EXTREMES.filter((e) => e.at.getTime() >= (m?.from ?? 0) && e.at.getTime() <= (m?.to ?? 0))
    expect(day.length).toBeGreaterThanOrEqual(3)
    expect(m?.marks.length).toBe(day.length)
    for (const k of m?.marks ?? []) {
      expect(k.labelX).toBeGreaterThanOrEqual(LABEL_HALF_W)
      expect(k.labelX).toBeLessThanOrEqual(W - LABEL_HALF_W)
      expect(k.labelY - 10).toBeGreaterThanOrEqual(0)
      expect(k.labelY + 12).toBeLessThanOrEqual(H)
      /* High higher on the page than low. */
      if (k.kind === 'high') expect(k.y).toBeLessThan(m?.marks.find((x) => x.kind === 'low')?.y ?? Infinity)
    }
    /* The axis rounds out to whole feet (4 ft over a 3.9 ft high), so the top dot sits just under the padding. */
    const top = Math.min(...(m?.marks ?? []).map((k) => k.y))
    expect(top).toBeGreaterThanOrEqual(CURVE_PAD_PX)
    expect(top).toBeLessThan(CURVE_PAD_PX + 5)
  })

  it('shades the night at both ends of a November day and not at noon', () => {
    const m = model(new Date('2026-11-02T15:00:00Z'))
    const nights = m?.nights ?? []
    expect(nights.length).toBe(2)
    expect(nights[0].x0).toBe(0)
    expect(nights[nights.length - 1].x1).toBeCloseTo(W, 6)
    const noonX = W / 2
    expect(nights.some((n) => n.x0 <= noonX && n.x1 >= noonX)).toBe(false)
  })

  it('never lets "now" touch a turn label, through the whole day', () => {
    let checked = 0
    for (let t = Date.parse('2026-11-02T05:00:00Z'); t < Date.parse('2026-11-03T05:00:00Z'); t += 10 * 60_000) {
      const m = model(new Date(t))
      const now = m?.now
      expect(now).not.toBeNull()
      if (now == null || m === null) continue
      for (const k of m.marks) {
        const apart = Math.abs(k.labelX - now.labelX) * 2 >= NOW_LABEL.w + LABEL_HALF_W * 2 || now.labelY <= k.labelY - 10 - NOW_LABEL.h / 2 || now.labelY - NOW_LABEL.h >= k.labelY - 10 + LABEL_H
        expect(apart, `now at ${new Date(t).toISOString()} against ${k.kind} ${k.at.toISOString()}`).toBe(true)
      }
      checked += 1
    }
    expect(checked).toBe(144)
  })

  it('has five ticks, midnight to midnight', () => {
    const m = model(new Date('2026-11-02T15:00:00Z'))
    expect(m?.ticks.map((t) => Math.round(t.x))).toEqual([0, 83, 165, 248, 330])
  })

  it('draws nothing where NOAA published nothing', () => {
    expect(model(new Date('2027-01-02T15:00:00Z'), '2027-01-02')).toBeNull()
  })
})

describe('tideHeight', () => {
  it('feet to a tenth, metres to a hundredth, a dash for none', () => {
    expect(tideHeight(2.34, 'ft')).toBe('2.3 ft')
    expect(tideHeight(3.28084, 'm')).toBe('1.00 m')
    expect(tideHeight(null, 'ft')).toBe('—')
  })
})

describe('moonLitPercent', () => {
  /* The mean month runs up to PHASE_AGREE (0.035 of a cycle) off the real moon (src/core/moonTides.ts); at a half moon that is pi x 0.035 x 100, about 11 points of lit share. */
  it('agrees with the lit share the synodic phase gives, within 11 points, across 2026', () => {
    let n = 0
    for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 1); t += 86_400_000 * 3) {
      const p = phaseBySynodic(new Date(t))
      const expected = ((1 - Math.cos(2 * Math.PI * p)) / 2) * 100
      expect(Math.abs(moonLitPercent(new Date(t)) - expected)).toBeLessThanOrEqual(11)
      n += 1
    }
    expect(n).toBeGreaterThan(100)
  })
})

describe('wetsuitFor: the convention, as data', () => {
  it('reads the band the water falls in', () => {
    expect(wetsuitFor((60 - 32) / 1.8)?.suit).toBe('4/3')
    expect(wetsuitFor((76 - 32) / 1.8)?.suit).toBe('Boardshorts')
    expect(wetsuitFor((66 - 32) / 1.8)?.suit).toBe('3/2')
    expect(wetsuitFor(2)?.suit).toBe('6/5 + hood')
  })
  it('takes each band from its lower edge up', () => {
    for (const b of WETSUIT_BANDS.filter((x) => Number.isFinite(x.fromF))) expect(wetsuitFor((b.fromF - 32) / 1.8)?.suit).toBe(b.suit)
  })
  it('is warmest first, with no gap: every temperature has a band', () => {
    for (let i = 1; i < WETSUIT_BANDS.length; i += 1) expect(WETSUIT_BANDS[i].fromF).toBeLessThan(WETSUIT_BANDS[i - 1].fromF)
    for (let c = -2; c <= 32; c += 0.5) expect(wetsuitFor(c)).not.toBeNull()
  })
  it('says nothing for no temperature', () => {
    expect(wetsuitFor(null)).toBeNull()
    expect(cToF(100)).toBe(212)
  })
})

describe('drag along the curve (Batch Flow, Section 7)', () => {
  const NY = 'America/New_York'
  it('a share of the way across is that share of the venue\'s day, midnight to midnight', () => {
    expect(timeAtShare('2026-11-02', NY, 0)?.toISOString()).toBe('2026-11-02T05:00:00.000Z')
    expect(timeAtShare('2026-11-02', NY, 0.5)?.toISOString()).toBe('2026-11-02T17:00:00.000Z')
    expect(timeAtShare('2026-11-02', NY, 1)?.toISOString()).toBe('2026-11-03T05:00:00.000Z')
  })
  it('a finger past either end is held at the end', () => {
    expect(timeAtShare('2026-11-02', NY, -0.3)?.toISOString()).toBe('2026-11-02T05:00:00.000Z')
    expect(timeAtShare('2026-11-02', NY, 1.4)?.toISOString()).toBe('2026-11-03T05:00:00.000Z')
  })
  it('the day the clocks go back is 25 hours wide', () => {
    const a = timeAtShare('2026-11-01', NY, 0) as Date
    const b = timeAtShare('2026-11-01', NY, 1) as Date
    expect((b.getTime() - a.getTime()) / 3_600_000).toBe(25)
  })
  it('back to now three seconds after the finger lifts', () => {
    expect(SCRUB_RETURN_MS).toBe(3000)
  })
})
