import { describe, expect, it } from 'vitest'
import { agreement, extremesFromLevels, HIT, matchExtremes, nearestInTime, parseNdbcWaves, score, worstRows, type LevelSample } from '../src/core/accuracy.ts'
import type { TideExtreme } from '../src/core/tide.ts'

/*
 * THE ACCURACY REPORT'S ARITHMETIC (scripts/measure-accuracy.mjs), on
 * fixtures only: the script fetches, this is what it does with what came
 * back. Errors are forecast minus observed throughout.
 */

const at = (iso: string) => new Date(iso)

describe('score', () => {
  it('gives the mean absolute error, the bias and the share within the tolerance', () => {
    const s = score([1, -3, 2, 6], 2)
    expect(s.n).toBe(4)
    expect(s.mae).toBeCloseTo(3)
    expect(s.bias).toBeCloseTo(1.5)
    /* 1 and 2 are within 2; -3 and 6 are not. The edge counts as a hit. */
    expect(s.hit).toBeCloseTo(0.5)
  })

  it('says nothing, not zero, when nothing was scored, and leaves out what is not a number', () => {
    expect(score([], 5)).toEqual({ n: 0, mae: null, bias: null, hit: null })
    expect(score([Number.NaN, 4], 5)).toEqual({ n: 1, mae: 4, bias: 4, hit: 1 })
  })

  it('scores words by agreement', () => {
    expect(agreement([['Fun', 'Fun'], ['Small', 'Fun'], ['Flat', 'Flat'], ['Big', 'Solid']]).hit).toBeCloseTo(0.5)
    expect(agreement([]).n).toBe(0)
  })

  it('holds the tolerances the report states', () => {
    expect(HIT).toEqual({ tempC: 2, windKt: 5, gustKt: 5, waveFt: 1, periodS: 2, faceFt: 1, tideMin: 15, tideFt: 0.5 })
  })
})

describe('the buoy file', () => {
  /* NDBC 44099 as published: wave-only rows are the ones wanted; MM is missing. */
  const SAMPLE = `#YY  MM DD hh mm WDIR WSPD GST  WVHT   DPD   APD MWD   PRES  ATMP  WTMP  DEWP  VIS PTDY  TIDE
#yr  mo dy hr mn degT m/s  m/s     m   sec   sec degT   hPa  degC  degC  degC  nmi  hPa    ft
2026 11 03 15 26  MM   MM   MM    MM    MM   7.5  MM     MM    MM  17.2    MM   MM   MM    MM
2026 11 03 14 56  MM   MM   MM   0.8     9   7.5 104     MM    MM  17.2    MM   MM   MM    MM
2026 11 03 14 26  MM   MM   MM   0.9    MM   7.1  MM     MM    MM  17.2    MM   MM   MM    MM`

  it('keeps every row with a wave height, with its period and direction when given', () => {
    const w = parseNdbcWaves(SAMPLE)
    expect(w).toHaveLength(2)
    expect(w[0]).toEqual({ at: at('2026-11-03T14:56:00Z'), waveM: 0.8, periodS: 9, fromDeg: 104 })
    expect(w[1].periodS).toBeNull()
  })

  it('reads nothing from a file with no wave column', () => {
    expect(parseNdbcWaves('#YY MM DD hh mm WDIR WSPD\n2026 11 03 14 56 100 5')).toEqual([])
  })

  it('pairs an hour with the nearest report within the limit, and none beyond it', () => {
    const w = parseNdbcWaves(SAMPLE)
    expect(nearestInTime(w, at('2026-11-03T15:00:00Z'))?.waveM).toBe(0.8)
    expect(nearestInTime(w, at('2026-11-03T16:00:00Z'))).toBeNull()
  })
})

/* A clean semidiurnal tide: period 12.42 h, 3 ft range about 1.5 ft, first high at 02:00 UTC. */
const PERIOD_MIN = 745.2
const FIRST_HIGH = at('2026-11-01T02:00:00Z').getTime()
function series(hours: number, noise = 0): LevelSample[] {
  const out: LevelSample[] = []
  for (let m = 0; m <= hours * 60; m += 6) {
    const t = at('2026-11-01T00:00:00Z').getTime() + m * 60_000
    const phase = ((t - FIRST_HIGH) / 60_000 / PERIOD_MIN) * 2 * Math.PI
    /* A fixed zig-zag stands in for chop: deterministic, so the test is too. */
    out.push({ at: new Date(t), feet: 1.5 + 1.5 * Math.cos(phase) + (m % 12 === 0 ? noise : -noise) })
  }
  return out
}

describe('turns from observed water levels', () => {
  it('finds each high and low within a sample of the true time, alternating', () => {
    const turns = extremesFromLevels(series(48, 0.15))
    expect(turns.length).toBeGreaterThanOrEqual(6)
    for (let i = 1; i < turns.length; i += 1) expect(turns[i].kind).not.toBe(turns[i - 1].kind)
    for (const e of turns) {
      const k = Math.round(((e.at.getTime() - FIRST_HIGH) / 60_000 / PERIOD_MIN) * 2) / 2
      const truth = FIRST_HIGH + k * PERIOD_MIN * 60_000
      expect(Math.abs(e.at.getTime() - truth) / 60_000).toBeLessThanOrEqual(6)
      expect(e.kind).toBe(Number.isInteger(k) ? 'high' : 'low')
    }
  })

  it('calls no turn where its window runs off the series or over a gap', () => {
    /* The 02:00 high is 120 min from the start, inside the 150-minute window: not called. */
    expect(extremesFromLevels(series(48)).some((e) => Math.abs(e.at.getTime() - FIRST_HIGH) < 3_600_000)).toBe(false)
    const lowAt = FIRST_HIGH + (PERIOD_MIN / 2) * 60_000
    const highAt = FIRST_HIGH + PERIOD_MIN * 60_000
    /* 90 minutes missing just after the second high: the high itself was sampled, but its window was not all seen. */
    const gapped = series(48).filter((s) => s.at.getTime() <= highAt + 30 * 60_000 || s.at.getTime() >= highAt + 120 * 60_000)
    expect(extremesFromLevels(series(48)).some((e) => Math.abs(e.at.getTime() - highAt) < 3_600_000)).toBe(true)
    expect(extremesFromLevels(gapped).some((e) => Math.abs(e.at.getTime() - lowAt) < 3_600_000)).toBe(true)
    expect(extremesFromLevels(gapped).some((e) => Math.abs(e.at.getTime() - highAt) < 3_600_000)).toBe(false)
  })

  it('is nothing at all from too few samples', () => {
    expect(extremesFromLevels(series(48).slice(0, 2))).toEqual([])
  })
})

describe('predicted turns against observed', () => {
  const t = (iso: string, feet: number, kind: 'high' | 'low'): TideExtreme => ({ at: at(iso), feet, kind })
  const observed = [t('2026-11-01T05:00:00Z', 3.4, 'high'), t('2026-11-01T11:10:00Z', 0.6, 'low'), t('2026-11-01T17:20:00Z', 4.0, 'high')]

  it('pairs each with the nearest of its own kind and gives minutes and feet as predicted minus observed', () => {
    const predicted = [t('2026-11-01T05:12:00Z', 3.0, 'high'), t('2026-11-01T11:00:00Z', 0.9, 'low'), t('2026-11-01T17:30:00Z', 4.2, 'high')]
    const { pairs, unmatched } = matchExtremes(predicted, observed)
    expect(unmatched).toEqual([])
    expect(pairs.map((p) => p.minutes)).toEqual([12, -10, 10])
    expect(pairs.map((p) => Math.round(p.feet * 10) / 10)).toEqual([-0.4, 0.3, 0.2])
    expect(score(pairs.map((p) => p.minutes), HIT.tideMin).hit).toBe(1)
  })

  it('never pairs a high with a low, nor a turn beyond the limit', () => {
    const { pairs, unmatched } = matchExtremes([t('2026-11-01T11:00:00Z', 3.5, 'high'), t('2026-11-02T05:00:00Z', 3.4, 'high')], observed)
    /* The 11:00 high's nearest turn is the 11:10 low; its nearest high is 6 h off. */
    expect(pairs).toEqual([])
    expect(unmatched).toHaveLength(2)
  })
})

describe('the worst rows', () => {
  it('are the lowest hit rates, the larger error first on a tie, and never a row with nothing scored', () => {
    const r = (label: string, hit: number | null, mae: number | null, n = 10) => ({ label, score: { n, mae, bias: null, hit } })
    const rows = [r('a', 0.9, 1), r('b', 0.2, 1), r('c', 0.2, 3), r('d', null, null, 0), r('e', 0.5, 1)]
    expect(worstRows(rows, 3).map((x) => x.label)).toEqual(['c', 'b', 'e'])
  })
})

describe('the call against the field truth (Batch TRUTH, Section 2.5)', () => {
  it('12 Nov at the pier: seen 1–2 ft, Small (fixtures/truth/2026-11-12-vb.json)', async () => {
    const { readFileSync } = await import('node:fs')
    const { truthRow, truthSurfOf } = await import('../src/core/accuracy.ts')
    const t = truthSurfOf(JSON.parse(readFileSync('fixtures/truth/2026-11-12-vb.json', 'utf8')), '2026-11-12')
    expect(t).toMatchObject({ seenFt: [1, 2], sizeWord: 'Small' })
    expect(truthRow(t!, { lowFt: 0, highFt: 2, size: 'Flat' })).toMatchObject({ rangeHit: true, wordHit: false })
    expect(truthRow(t!, { lowFt: 1, highFt: 2, size: 'Small' })).toMatchObject({ rangeHit: true, wordHit: true })
    expect(truthRow(t!, { lowFt: 3, highFt: 4, size: 'Fun' })).toMatchObject({ rangeHit: false, wordHit: false })
    expect(truthRow(t!, null).ours).toBe('—')
  })
})
