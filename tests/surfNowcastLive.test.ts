import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseHourly, MARINE_NAMES, BRIEF_WIND_NAMES } from '../src/lib/tideSheetData.ts'
import { buoyLean, rangeHourAt } from '../src/lib/surfPageData.ts'
import { surfCall } from '../src/core/surfCall.ts'
import { reachShare, towardBeachM } from '../src/core/surf.ts'
import { spotStats } from '../src/core/spotSkill.ts'
import { beachFactorAt } from '../src/core/beachFactor.ts'
import type { BuoyReading } from '../src/lib/buoy.ts'

/*
 * THE SURF NOWCAST, WEIGHED (Batch LIVE, Section 9A; 14 Nov 3:13 PM Surfline
 * saw 2-3 ft at 1st St Jetty, 1-2 at Croatan and North End; we said 0-1 Flat
 * when 44099's nowcast took the forecast's 1.4 ft to 0.1). The recorded
 * days: tests/data/surf-2026-11-12-14/; before and after:
 * measurements/2026-11-14-surf-nowcast-before.md, -after.md.
 */
const DIR = 'tests/data/surf-2026-11-12-14'
const marine = parseHourly(JSON.parse(readFileSync(`${DIR}/marine.json`, 'utf8')), MARINE_NAMES)!
const wind = parseHourly(JSON.parse(readFileSync(`${DIR}/wind.json`, 'utf8')), BRIEF_WIND_NAMES)!
const num = (x: string | undefined) => (x === undefined || x === 'MM' ? null : Number(x))
const rows = (b: string, ext: string) => readFileSync(`${DIR}/${b}.${ext}`, 'utf8').split('\n').filter((l) => !l.startsWith('#') && l.trim() !== '').map((l) => l.trim().split(/\s+/))
const stamp = (f: string[]) => new Date(`${f[0]}-${f[1]}-${f[2]}T${f[3]}:${f[4]}:00Z`)
const buoyAt = (id: string, t: Date): BuoyReading | null => {
  const f = rows(id, 'txt').filter((r) => stamp(r).getTime() <= t.getTime() - 30 * 60_000 && r[8] !== 'MM').sort((a, b) => stamp(b).getTime() - stamp(a).getTime())[0]
  if (f === undefined) return null
  return { status: 'ok', buoy: { id, name: id, at: { lat: 0, lon: 0 }, km: 0 }, at: stamp(f), waveM: Number(f[8]), periodS: num(f[9]), fromDeg: num(f[11]), split: null }
}
const FACING = 100
const factor = beachFactorAt({ lat: 36.83, lon: -75.97 })
const callAt = (iso: string) => {
  const t = new Date(iso)
  const others = ['44014', '44100'].map((id) => buoyAt(id, t)).filter((b): b is BuoyReading => b !== null)
  const lean = buoyLean(marine, wind, buoyAt('44099', t), FACING, spotStats([], 0), factor, t.getTime(), others)
  const h = rangeHourAt(marine, wind, t, FACING, spotStats([], 0), factor, lean)!
  return surfCall({ centerFt: h.centerFt, shape: h.shape, side: null }, 0)!
}

describe('14 Nov 1-4 PM: 1-2 ft, not Flat', () => {
  for (const hour of [18, 19, 20, 21]) it(`${hour - 5} PM`, () => {
    const c = callAt(`2026-11-14T${hour}:30:00Z`)
    expect(c.words).toBe('1–2 ft')
    expect(c.size).not.toBe('Flat')
  })
})

describe('the flat days stay flat', () => {
  it('13 Nov (Surfline: Flat): Flat', () => {
    for (const h of [13, 15, 17]) expect(callAt(`2026-11-13T${h}:30:00Z`).size).toBe('Flat')
  })
  it('12 Nov (knee high or less, mostly unrideable): Small at most', () => {
    for (const h of [13, 15, 17]) expect(['Flat', 'Small']).toContain(callAt(`2026-11-12T${h}:30:00Z`).size)
  })
})

describe('a taper, not a cut', () => {
  it('nothing is zero until about 110° off the beach\'s normal', () => {
    expect(reachShare(0)).toBe(1)
    expect(reachShare(90)).toBeGreaterThan(0.05)
    expect(reachShare(100)).toBeGreaterThan(0.02)
    expect(reachShare(125)).toBe(0)
    /* A N windswell at an E-facing beach (94° off) reaches it, smaller. */
    expect(towardBeachM(1, 1, 6, FACING)).toBeGreaterThan(0.2)
  })
  it('one buoy\'s "0 at the beach" never zeroes a forecast', () => {
    const t = new Date('2026-11-14T19:30:00Z')
    const lean = buoyLean(marine, wind, buoyAt('44099', t), FACING, spotStats([], 0), factor, t.getTime(), [])
    const plain = rangeHourAt(marine, wind, t, FACING, spotStats([], 0), factor, null)!
    const leaned = rangeHourAt(marine, wind, t, FACING, spotStats([], 0), factor, lean)!
    expect(leaned.centerFt).toBeGreaterThanOrEqual(plain.centerFt * 0.5 - 1e-9)
  })
})

describe('a jetty\'s own factor (Section 9A.4)', () => {
  it('a spot by Croatan takes the factor from reports filed under Croatan', async () => {
    const { factorHere } = await import('../src/lib/beachFactorHere.ts')
    const { spotKey } = await import('../src/core/spotSkill.ts')
    const croatan = { lat: 36.8172, lon: -75.9725 }
    const key = spotKey(croatan)
    const r = (i: number) => ({ at: Date.UTC(2026, 10, 10 + i, 15), spot: key, name: 'Croatan', size: '2-3' as const, rating: 'Good' as const, buoyFt: 2 })
    const near = { lat: 36.8180, lon: -75.9730 }
    const region = factorHere(near, [])
    const own = factorHere(near, [r(1), r(2), r(3)])
    expect(own).not.toBe(region)
  })
})
