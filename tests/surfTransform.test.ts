import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { beachFactorAt } from '../src/core/beachFactor.ts'
import { jettyOf, shelteredMps, SHELTER_SHARE, type Shelter } from '../src/core/jettyFactor.ts'
import { spotStats } from '../src/core/spotSkill.ts'
import { surfShape } from '../src/core/surf.ts'
import { CHOP_WIND_KT, surfCall, surfChop, surfQuality } from '../src/core/surfCall.ts'
import { buoyConsensus, cappedMiss, LEAN_CAP_FT } from '../src/core/surfNowcast.ts'
import { forecastParts, partWords, swellOf } from '../src/core/surfReads.ts'
import { partShare, periodShare, seaFaceFt, PERIOD_SHORT_SHARE } from '../src/core/surfTransform.ts'
import { logWeek, weekBias, WEEK_BIAS_MIN_DAYS, type WeekCall } from '../src/core/weekBias.ts'
import { SURF_SPOTS } from '../src/data/surfSpots.ts'
import type { BuoyReading } from '../src/lib/buoy.ts'
import { buoyLean, rangeHourAt } from '../src/lib/surfPageData.ts'
import { BRIEF_WIND_NAMES, hourlyAt, MARINE_NAMES, parseHourly } from '../src/lib/tideSheetData.ts'
import { seaNow } from '../src/lib/useSurfNow.ts'
import type { SurfSea } from '../src/lib/useSurfSea.ts'
import { readWeekLog, keepWeek } from '../src/lib/weekBiasStore.ts'

/*
 * THE SURF TRANSFORM (Batch DRONE, Section 1, the real fix for CORE 8.1). One
 * model, the four days (measurements/2026-11-16-surf-transform.md):
 *
 *   12, 13 Nov      Flat          fixtures/truth/2026-11-12-vb.json, -13-vb.json
 *   14 Nov 1-4 PM   VB 1-2, Croatan ≥ 1-2   (Surfline cams 3:13 PM, src/core/surf.ts)
 *   16 Nov 10:50    VB 1-2, Croatan best, no clean, no Rideable   fixtures/truth/2026-11-16-vb-surf.json
 *
 * Replayed as the phone has it: 44099 leans, 44014 and 44100 check it, each
 * with its spectral split; no per-spot history.
 */
const num = (x: string | undefined) => (x === undefined || x === 'MM' ? null : Number(x))
const stamp = (f: string[]) => new Date(`${f[0]}-${f[1]}-${f[2]}T${f[3]}:${f[4]}:00Z`)
function day(dir: string) {
  const marine = parseHourly(JSON.parse(readFileSync(`${dir}/marine.json`, 'utf8')), MARINE_NAMES)!
  const wind = parseHourly(JSON.parse(readFileSync(`${dir}/wind.json`, 'utf8')), BRIEF_WIND_NAMES)!
  const rows = (b: string, ext: string) => readFileSync(`${dir}/${b}.${ext}`, 'utf8').split('\n').filter((l) => !l.startsWith('#') && l.trim() !== '').map((l) => l.trim().split(/\s+/))
  const buoyAt = (id: string, t: Date, lagMin: number): BuoyReading | null => {
    const f = rows(id, 'txt').filter((r) => stamp(r).getTime() <= t.getTime() - lagMin * 60_000 && r[8] !== 'MM').sort((a, b) => stamp(b).getTime() - stamp(a).getTime())[0]
    if (f === undefined) return null
    const s = rows(id, 'spec').find((g) => stamp(g).getTime() === stamp(f).getTime())
    const split = s === undefined ? null : { swellM: num(s[6]), swellS: num(s[7]), windWaveM: num(s[8]), windWaveS: num(s[9]), swellFrom: s[10] === 'MM' ? null : s[10], windWaveFrom: s[11] === 'MM' ? null : s[11] }
    return { status: 'ok', buoy: { id, name: id, at: { lat: 0, lon: 0 }, km: 0 }, at: stamp(f), waveM: Number(f[8]), periodS: num(f[9]), fromDeg: num(f[11]), split }
  }
  return { marine, wind, buoyAt }
}
const D1214 = day('tests/data/surf-2026-11-12-14')
const D16 = day('tests/data/surf-2026-11-16')
const NONE = spotStats([], 0)
const VB = { at: { lat: 36.83, lon: -75.97 }, facing: 100, id: null as string | null }
const croatanSpot = SURF_SPOTS.find((s) => s.id === 'vb-croatan')!
const CROATAN = { at: croatanSpot.at, facing: croatanSpot.facing, id: croatanSpot.id as string | null }

function callAt(d: ReturnType<typeof day>, place: typeof VB, iso: string, lagMin = 30) {
  const t = new Date(iso)
  const j = place.id === null ? null : jettyOf(place.id)
  const factor = beachFactorAt(place.at) * (j?.sizeFactor ?? 1)
  const shelter: Shelter | null = j?.shelter ?? null
  const others = ['44014', '44100'].map((id) => d.buoyAt(id, t, lagMin)).filter((b): b is BuoyReading => b !== null)
  const lean = buoyLean(d.marine, d.wind, d.buoyAt('44099', t, lagMin), place.facing, NONE, factor, t.getTime(), others, shelter)
  const h = rangeHourAt(d.marine, d.wind, t, place.facing, NONE, factor, lean, shelter)!
  return { h, call: surfCall({ centerFt: h.centerFt, shape: h.shape, side: null, chop: h.chop }, 0)! }
}
const SHAPE_RANK = { Clean: 2, Bumpy: 1, Messy: 0 } as const

describe('one model, four days', () => {
  it('12 Nov: Small at most, never over 1-2 ft (truth: knee high or less, "Small")', () => {
    for (const h of [13, 15, 17]) {
      const { call } = callAt(D1214, VB, `2026-11-12T${h}:30:00Z`)
      expect(['Flat', 'Small']).toContain(call.size)
      expect(call.highFt).toBeLessThanOrEqual(2)
    }
    expect(callAt(D1214, VB, '2026-11-12T15:30:00Z').call.words).toBe('0–1 ft')
  })
  it('13 Nov: Flat through the morning, 0-1 ft all day', () => {
    for (const h of [13, 15]) expect(callAt(D1214, VB, `2026-11-13T${h}:30:00Z`).call.size).toBe('Flat')
    for (const h of [13, 15, 17]) expect(callAt(D1214, VB, `2026-11-13T${h}:30:00Z`).call.words).toBe('0–1 ft')
  })
  it('14 Nov 1-3 PM: VB 1-2, Croatan 1-2 or more', () => {
    for (const h of [18, 19, 20]) {
      const iso = `2026-11-14T${h}:30:00Z`
      expect(callAt(D1214, VB, iso).call.words, iso).toBe('1–2 ft')
      expect(callAt(D1214, CROATAN, iso).call.lowFt, iso).toBeGreaterThanOrEqual(1)
    }
  })
  it('16 Nov 10:50: VB 1-2, not Rideable, no clean band; Croatan the best of the two', () => {
    const iso = '2026-11-16T15:50:00Z'
    const vb = callAt(D16, VB, iso, 20)
    const cr = callAt(D16, CROATAN, iso, 20)
    expect(vb.call.words).toBe('1–2 ft')
    expect(vb.call.size).not.toBe('Rideable')
    expect(vb.h.clean).toBe(false)
    expect(cr.h.centerFt).toBeGreaterThanOrEqual(vb.h.centerFt)
    expect(SHAPE_RANK[cr.h.shape!]).toBeGreaterThan(SHAPE_RANK[vb.h.shape!])
  })
  it('16 Nov, the hours the app shaded "clean" 11 AM-1 PM: none clean at the open beach', () => {
    for (const iso of ['2026-11-16T16:00:00Z', '2026-11-16T17:00:00Z', '2026-11-16T18:00:00Z']) expect(callAt(D16, VB, iso, 20).h.clean, iso).toBe(false)
  })
})

describe('the transform, part by part', () => {
  it('a short wind sea breaks at a fraction of its height; a groundswell at all of it', () => {
    expect(periodShare(5)).toBe(PERIOD_SHORT_SHARE)
    expect(periodShare(6)).toBeGreaterThan(0.35)
    expect(periodShare(6)).toBeLessThan(0.65)
    expect(periodShare(11)).toBe(1)
    expect(periodShare(15)).toBe(1)
  })
  it('cos² with spread: whole head-on, a taper past 100°, nothing at 140°', () => {
    expect(partShare(0)).toBe(1)
    expect(partShare(100)).toBeGreaterThan(0.05)
    expect(partShare(100)).toBeLessThan(0.2)
    expect(partShare(120)).toBeLessThan(partShare(100))
    expect(partShare(140)).toBeLessThan(1e-9)
  })
  it('parts combine by energy, not by adding heights', () => {
    const a = { heightM: 1, periodS: 12, fromDeg: 100 }
    const one = seaFaceFt([a], 100, 1) as number
    expect(seaFaceFt([a, a], 100, 1)).toBeCloseTo(one * Math.SQRT2, 9)
  })
})

describe('the quality words', () => {
  it(`${CHOP_WIND_KT} kt or more from cross-shore round to onshore chops it: "Poor · choppy" small, "Fair · textured" bigger, never Rideable or clean`, () => {
    expect(surfChop(10, 'cross-shore')).toBe(true)
    expect(surfChop(14, 'onshore')).toBe(true)
    expect(surfChop(9.9, 'cross-shore')).toBe(false)
    expect(surfChop(20, 'cross-offshore')).toBe(false)
    expect(surfChop(20, 'offshore')).toBe(false)
    expect(surfQuality(1.5, true)).toBe('Poor · choppy')
    expect(surfQuality(3, true)).toBe('Fair · textured')
    /* Without chop the pill is the scale word (Batch SIMPLE-3, Section 5.1): 3 ft clean is Fair. */
    expect(surfQuality(3, false)).toBe('Fair')
    /* 16 Nov as the cams had it: 1-2 ft in N 12 kt cross-shore. */
    const c = surfCall({ centerFt: 1.5, shape: 'Bumpy', side: 'cross-shore', chop: surfChop(12, 'cross-shore') }, 0)!
    expect(c.quality).toBe('Poor · choppy')
    const big = surfCall({ centerFt: 3, shape: 'Bumpy', side: 'cross-shore', chop: true }, 0)!
    expect(big.size).toBe('Rideable')
    expect(big.quality).toBe('Fair · textured')
  })
  it('a chopping hour is never clean, and says its words', () => {
    const t = new Date('2026-11-16T15:30:00Z')
    const kt = 0.514444
    const times = [t.getTime() - 1_800_000]
    const wind = { times, values: { wind_speed_10m: [12 * kt], wind_direction_10m: [10] } }
    const h = rangeHourAt(D16.marine, wind, t, 100, NONE, 1)!
    expect(h.chop).toBe(true)
    expect(h.clean).toBe(false)
    expect(h.quality).toBe('Poor · choppy')
    /* 8 kt cross-offshore is no longer "clean" (16 Nov), 7 kt still is (12 Nov). */
    expect(surfShape(8 * kt, 330, 100)).toBe('Bumpy')
    expect(surfShape(7 * kt, 210, 100)).toBe('Clean')
  })
})

describe('the buoy lean: the same transform, capped at ±1 ft when they disagree', () => {
  it('a weighted face; the plain mean when no buoy\'s sea heads for the beach', () => {
    expect(buoyConsensus([{ faceFt: 2, weight: 1 }, { faceFt: 0, weight: 0 }])).toBe(2)
    expect(buoyConsensus([{ faceFt: 2, weight: 0 }, { faceFt: 0, weight: 0 }])).toBe(1)
    expect(buoyConsensus([])).toBeNull()
  })
  it('capped at ±1 ft when the buoys disagree with each other or the forecast', () => {
    expect(cappedMiss(2.5, [3, 3.2])).toBe(LEAN_CAP_FT)
    expect(cappedMiss(-2.5, [0.1, 0.2])).toBe(-LEAN_CAP_FT)
    expect(cappedMiss(0.8, [0.5, 2])).toBe(0.8)
    expect(cappedMiss(0.6, [1, 1.3])).toBe(0.6)
  })
  it('16 Nov 10:50: the lean moves the centre by no more than a foot', () => {
    const t = new Date('2026-11-16T15:50:00Z')
    const others = ['44014', '44100'].map((id) => D16.buoyAt(id, t, 20)).filter((b): b is BuoyReading => b !== null)
    const lean = buoyLean(D16.marine, D16.wind, D16.buoyAt('44099', t, 20), 100, NONE, beachFactorAt(VB.at), t.getTime(), others)!
    expect(Math.abs(lean.missFt)).toBeLessThanOrEqual(LEAN_CAP_FT)
  })
})

describe('the jetties, seeded from the looks in the repo', () => {
  it('Croatan as big as the open beach, in the N wind\'s lee; 1st St Jetty a third bigger, no lee', () => {
    expect(jettyOf('vb-croatan')).toMatchObject({ sizeFactor: 1 })
    expect(jettyOf('vb-croatan')?.shelter?.share).toBe(SHELTER_SHARE)
    expect(jettyOf('vb-1st-street-jetty')?.sizeFactor).toBeCloseTo(4 / 3, 9)
    expect(jettyOf('vb-1st-street-jetty')?.shelter).toBeNull()
    expect(jettyOf('sandbridge')).toBeNull()
    const lee = jettyOf('vb-croatan')!.shelter
    expect(shelteredMps(10, 350, lee)).toBeCloseTo(10 * SHELTER_SHARE, 9)
    expect(shelteredMps(10, 180, lee)).toBe(10)
  })
})

describe('one surf series: the map\'s crosshair and the Surf page read one function', () => {
  /* 16 Nov 11:02 AM: the map said "swell 1.6 ft 4 s" (Open-Meteo's swell_wave at the crosshair), the page "0.7 ft 12 s" (44099's own split, fresh). */
  const now = new Date('2026-11-16T16:02:00Z')
  const buoy = D16.buoyAt('44099', now, 20)
  const sea: SurfSea = { status: 'ready', marine: D16.marine, wind: D16.wind, facing: 100, facingState: 'ok', buoy, buoys: [], factor: beachFactorAt(VB.at) }
  it('the two numbers, and where each came from', () => {
    const oldMap = { m: hourlyAt(D16.marine, 'swell_wave_height', now)!, s: hourlyAt(D16.marine, 'swell_wave_period', now)! }
    expect(Math.round(oldMap.s)).toBe(4)
    const page = swellOf(seaNow(sea, now).parts)!
    expect(partWords(page)).toBe('0.7 ft · 12 s')
    expect(seaNow(sea, now).from).toBe('buoy')
  })
  /* The page drawing it: src/components/surfPageV2.test.tsx, "one surf series". */
  it('off the spot the map reads the forecast\'s parts at the crosshair through the same swellOf', () => {
    const cross = swellOf(forecastParts((n) => hourlyAt(D16.marine, n, now)))!
    expect(cross.name).toBe('Swell')
  })
})

describe('the week\'s bias, kept on the phone', () => {
  const iso = (d: number) => new Date(Date.UTC(2026, 10, 1 + d)).toISOString().slice(0, 10)
  /* Each day's call made 1 and 2 days ahead runs one bin over the day's own. */
  const build = (days: number): WeekCall[] => {
    let log: WeekCall[] = []
    for (let d = 0; d < days; d += 1) log = logWeek(log, iso(d), [0, 1, 2].map((k) => ({ date: iso(d + k), lowFt: k === 0 ? 1 : 2 })))
    return log
  }
  it(`nothing until the log is ${WEEK_BIAS_MIN_DAYS} days old`, () => {
    expect(weekBias(build(WEEK_BIAS_MIN_DAYS), iso(WEEK_BIAS_MIN_DAYS - 1))).toBeNull()
    expect(weekBias([], iso(30))).toBeNull()
  })
  it('then the mean bin error per day ahead', () => {
    const rows = weekBias(build(WEEK_BIAS_MIN_DAYS + 1), iso(WEEK_BIAS_MIN_DAYS))!
    expect(rows.map((r) => r.ahead)).toEqual([1, 2])
    for (const r of rows) expect(r.meanBins).toBe(1)
  })
  it('a later call the same day replaces the earlier; kept in localStorage only', () => {
    const mem = new Map<string, string>()
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) }
    keepWeek('36.83,-75.97', '2026-11-16', [{ date: '2026-11-16', lowFt: 2 }, { date: '2026-11-17', lowFt: 1 }], 0, store)
    keepWeek('36.83,-75.97', '2026-11-16', [{ date: '2026-11-16', lowFt: 1 }, { date: '2026-11-17', lowFt: null }], 0, store)
    expect(readWeekLog('36.83,-75.97', store)).toEqual([
      { made: '2026-11-16', date: '2026-11-16', lowFt: 1 },
      { made: '2026-11-16', date: '2026-11-17', lowFt: 1 },
    ])
    expect([...mem.keys()]).toEqual(['scoutngo.weekBias.v1'])
  })
})
