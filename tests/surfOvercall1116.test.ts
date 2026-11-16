import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseHourly, MARINE_NAMES, BRIEF_WIND_NAMES } from '../src/lib/tideSheetData.ts'
import { buoyLean, rangeHourAt } from '../src/lib/surfPageData.ts'
import { surfCall } from '../src/core/surfCall.ts'
import { buoyFaceFt, spotStats } from '../src/core/spotSkill.ts'
import { beachFactorAt } from '../src/core/beachFactor.ts'
import type { BuoyReading } from '../src/lib/buoy.ts'

/*
 * 16 NOV 10:50 AM, THE OVER-CALL (Batch CORE, Section 8.1, the addendum;
 * fixtures/truth/2026-11-16-vb-surf.json): cams knee to thigh, the app said
 * "2-3 ft Rideable", its buoy line "44099 3.9 ft 6 s NE, as faces ~3.3 ft,
 * bigger than forecast". The data is tests/data/surf-2026-11-16/.
 *
 * NOT FIXED IN THIS BATCH. What is pinned here: the source of the over-call
 * (the as-faces step makes a 6 s wind sea about its whole height: a fix
 * changes that number, and this test with it), and what the replay says
 * today. A period share alone (0.42 at 5 s to 1 at 11 s) set 16 Nov right and
 * left 14 Nov 3-4 PM at 0-1 ft against a truth of 1-2: the model path and the
 * buoy lean want recalibrating together, per partition, as the addendum says.
 */
const DIR = 'tests/data/surf-2026-11-16'
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


describe('16 Nov 10:50 AM: where the 2-3 ft came from', () => {
  it('44099 at 15:26Z (1.2 m, 6 s, from 44 deg) as faces: about 3.3 ft, the phone\'s "as faces ~3.3 ft"', () => {
    const b = buoyAt('44099', new Date('2026-11-16T15:56:00Z'))
    if (b === null || b.status !== 'ok') throw new Error('no 44099 reading in the kept data')
    expect([b.waveM, b.periodS, b.fromDeg]).toEqual([1.2, 6, 44])
    const face = buoyFaceFt({ waveM: b.waveM, periodS: b.periodS, fromDeg: b.fromDeg }, FACING, factor)!
    expect(face).toBeGreaterThan(3)
    expect(face).toBeLessThan(3.6)
  })
  it('the replay, with the other two buoys, says 1-2 ft through the morning: the phone\'s 2-3 is not reproduced here', () => {
    for (const iso of ['2026-11-16T15:30:00Z', '2026-11-16T15:55:00Z', '2026-11-16T16:30:00Z', '2026-11-16T18:30:00Z']) expect(callAt(iso).words, iso).toBe('1–2 ft')
  })
})
