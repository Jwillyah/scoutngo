import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseHourly, MARINE_NAMES, BRIEF_WIND_NAMES } from '../src/lib/tideSheetData.ts'
import { buoyLean, rangeHourAt } from '../src/lib/surfPageData.ts'
import { surfCall } from '../src/core/surfCall.ts'
import { surfEstimate } from '../src/core/surf.ts'
import { buoyFaceFt, spotStats } from '../src/core/spotSkill.ts'
import { beachFactorAt } from '../src/core/beachFactor.ts'
import type { BuoyReading } from '../src/lib/buoy.ts'

/*
 * 16 NOV 10:50 AM, THE OVER-CALL (Batch CORE, Section 8.1, the addendum;
 * fixtures/truth/2026-11-16-vb-surf.json): cams knee to thigh, the app said
 * "2-3 ft Rideable", its buoy line "44099 3.9 ft 6 s NE, as faces ~3.3 ft,
 * bigger than forecast". The data is tests/data/surf-2026-11-16/.
 *
 * FIXED IN BATCH DRONE, Section 1 (src/core/surfTransform.ts): the as-faces
 * step made a 6 s wind sea about its whole height (the old step, still
 * src/core/surf.ts surfEstimate, pinned below as what it said); the buoy now
 * goes part by part through the forecast's own transform, and the replay
 * with the reading the phone had at 10:50 (44099's 15:26Z, 20 min late)
 * says 1-2 ft, where the old code said 2-3 (measurements/2026-11-16-surf-transform.md).
 */
const DIR = 'tests/data/surf-2026-11-16'
const marine = parseHourly(JSON.parse(readFileSync(`${DIR}/marine.json`, 'utf8')), MARINE_NAMES)!
const wind = parseHourly(JSON.parse(readFileSync(`${DIR}/wind.json`, 'utf8')), BRIEF_WIND_NAMES)!
const num = (x: string | undefined) => (x === undefined || x === 'MM' ? null : Number(x))
const rows = (b: string, ext: string) => readFileSync(`${DIR}/${b}.${ext}`, 'utf8').split('\n').filter((l) => !l.startsWith('#') && l.trim() !== '').map((l) => l.trim().split(/\s+/))
const stamp = (f: string[]) => new Date(`${f[0]}-${f[1]}-${f[2]}T${f[3]}:${f[4]}:00Z`)
/* The phone's reading: what NDBC had posted `lagMin` before, with its spectral split as /api/buoy sends it. */
const buoyAt = (id: string, t: Date, lagMin: number): BuoyReading | null => {
  const f = rows(id, 'txt').filter((r) => stamp(r).getTime() <= t.getTime() - lagMin * 60_000 && r[8] !== 'MM').sort((a, b) => stamp(b).getTime() - stamp(a).getTime())[0]
  if (f === undefined) return null
  const s = rows(id, 'spec').find((g) => stamp(g).getTime() === stamp(f).getTime())
  const split = s === undefined ? null : { swellM: num(s[6]), swellS: num(s[7]), windWaveM: num(s[8]), windWaveS: num(s[9]), swellFrom: s[10] === 'MM' ? null : s[10], windWaveFrom: s[11] === 'MM' ? null : s[11] }
  return { status: 'ok', buoy: { id, name: id, at: { lat: 0, lon: 0 }, km: 0 }, at: stamp(f), waveM: Number(f[8]), periodS: num(f[9]), fromDeg: num(f[11]), split }
}
const FACING = 100
const factor = beachFactorAt({ lat: 36.83, lon: -75.97 })
const callAt = (iso: string, lagMin: number) => {
  const t = new Date(iso)
  const others = ['44014', '44100'].map((id) => buoyAt(id, t, lagMin)).filter((b): b is BuoyReading => b !== null)
  const lean = buoyLean(marine, wind, buoyAt('44099', t, lagMin), FACING, spotStats([], 0), factor, t.getTime(), others)
  const h = rangeHourAt(marine, wind, t, FACING, spotStats([], 0), factor, lean)!
  return surfCall({ centerFt: h.centerFt, shape: h.shape, side: null, chop: h.chop }, 0)!
}

describe('16 Nov 10:50 AM: where the 2-3 ft came from, and where it went', () => {
  const b = buoyAt('44099', new Date('2026-11-16T15:50:00Z'), 20)
  if (b === null || b.status !== 'ok') throw new Error('no 44099 reading in the kept data')
  it('the reading the phone showed: 44099 at 15:26Z, 1.2 m, 6 s, from 44°, split 1.1 m 5.6 s NE + 0.2 m 11.8 s ENE', () => {
    expect([b.waveM, b.periodS, b.fromDeg]).toEqual([1.2, 6, 44])
    expect(b.split).toMatchObject({ windWaveM: 1.1, windWaveS: 5.6, windWaveFrom: 'NE', swellM: 0.2, swellS: 11.8, swellFrom: 'ENE' })
  })
  it('the old as-faces step made it about 3.3 ft, the phone\'s "as faces ~3.3 ft"', () => {
    const old = surfEstimate(b.waveM, b.periodS as number, b.fromDeg as number, FACING, factor).faceFt
    expect(old).toBeGreaterThan(3)
    expect(old).toBeLessThan(3.6)
  })
  it('part by part it is under 1.5 ft: the 5.6 s wind sea 55° off breaks at a fraction of its height', () => {
    const now = buoyFaceFt(b, FACING, factor) as number
    expect(now).toBeLessThan(1.5)
    expect(now).toBeGreaterThan(1)
    /* Without the split, the whole sea as one 6 s part, still under 1.5. */
    expect(buoyFaceFt({ waveM: b.waveM, periodS: b.periodS, fromDeg: b.fromDeg }, FACING, factor) as number).toBeLessThan(1.5)
  })
  it('the replay at 10:50 with the reading the phone had: 1-2 ft (the old code: 2-3)', () => {
    expect(callAt('2026-11-16T15:50:00Z', 20).words).toBe('1–2 ft')
    expect(callAt('2026-11-16T15:30:00Z', 30).words).toBe('1–2 ft')
  })
})
