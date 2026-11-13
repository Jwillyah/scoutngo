import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { AHEAD_MS, nowcastAt, nowcastWeight } from '../src/core/nowcast.ts'
import { DISAGREE_KT, disagreeLine, heightFactor, normalizeWind, spotSurface, STATION_SITES, stationOrder } from '../src/core/stationWind.ts'

/*
 * THE BEACH'S WIND FROM THE COAST'S STATIONS (Batch NOW, Section 2;
 * fixtures/truth/2026-11-13-vb.json: 7:55 AM, Surfline 14 g19 WNW, Cape Henry
 * 23 NNW, ours at Sandbridge 7 W). Cape Henry's 12:54Z reading, CO-OPS
 * 8638999: 20.8 kt from 329°, gusts 25.5.
 */
const KT = 0.514444
const truth = JSON.parse(readFileSync('fixtures/truth/2026-11-13-vb.json', 'utf8')) as { wind: { observed: { source: string; kt: number }[]; ours: { kt: number } } }
const surfline = truth.wind.observed.find((o) => o.source === 'Surfline')!.kt
const SANDBRIDGE_FACING = 100
const capeHenry = { id: '8638999', kind: 'coastal' as const, mps: 20.8 * KT, gustMps: 25.5 * KT, fromDeg: 329 }

describe('every station at 10 m over the beach', () => {
  it('Cape Henry, 30.6 m over the bay, carried to 10 m behind an offshore beach: within 4 kt of Surfline\'s 14', () => {
    const n = normalizeWind(capeHenry, SANDBRIDGE_FACING)
    expect(n.from).toBe('water')
    expect(n.to).toBe('shore')
    expect(n.sensorM).toBe(30.6)
    expect(Math.abs(n.mps / KT - surfline)).toBeLessThanOrEqual(4)
  })
  it('the log profile: higher and smoother reads more; the same surface at 10 m is 1', () => {
    expect(heightFactor(10, 'water', 'water')).toBeCloseTo(1, 6)
    expect(heightFactor(30.6, 'water', 'water')).toBeLessThan(1)
    expect(heightFactor(10, 'open', 'shore')).toBeLessThan(1)
    expect(spotSurface(90, 100)).toBe('water')
    expect(spotSurface(300, 100)).toBe('shore')
  })
  it('every station near the beach has its height said, or says it is not published', () => {
    for (const s of STATION_SITES) expect(s.source).toMatch(s.sensorM === null ? /no anemometer height/ : /anemometer [\d.]+ m above/)
    expect(normalizeWind({ ...capeHenry, id: '9999999' }, SANDBRIDGE_FACING).heightKnown).toBe(false)
  })
})

describe('the lean reads the report of its own hour (7:55 AM)', () => {
  const t = new Date('2026-11-13T12:30:00Z')
  const obsAt = new Date('2026-11-13T12:54:00Z')
  it('a report 24 minutes after the half past weighs 1, not 0', () => {
    expect(obsAt.getTime() - t.getTime()).toBeLessThan(AHEAD_MS)
    expect(nowcastWeight(obsAt, t)).toBe(1)
  })
  it('the headline: from our 7 kt W to within 4 kt of 14', () => {
    const model = () => ({ mps: truth.wind.ours.kt * KT, fromDeg: 270, gustMps: 10 * KT })
    const n = normalizeWind(capeHenry, SANDBRIDGE_FACING)
    const before = model().mps / KT
    const after = nowcastAt(model, { at: obsAt, mps: n.mps, fromDeg: capeHenry.fromDeg, gustMps: n.gustMps }, t)!
    expect(before).toBe(7)
    expect(Math.abs(after.mps / KT - surfline)).toBeLessThanOrEqual(4)
  })
})

describe('at a beach the coast first; both said when they part', () => {
  it('Cape Henry (coastal, 23.4 km) before KNTU (inland, 13.4 km) at Sandbridge; inland, the nearest', () => {
    const list = [{ station: { kind: 'airport' as const, km: 13.4, id: 'KNTU' } }, { station: { kind: 'coastal' as const, km: 23.4, id: '8638999' } }]
    expect(stationOrder(list, true)[0].station.id).toBe('8638999')
    expect(stationOrder(list, false)[0].station.id).toBe('KNTU')
  })
  it('"7 kt model · Cape Henry reads 23 kt" when more than 8 kt apart after normalizing', () => {
    expect(DISAGREE_KT).toBe(8)
    expect(disagreeLine(7, { label: 'Cape Henry', rawKt: 23, normKt: 16.1 })).toBe('7 kt model · Cape Henry reads 23 kt')
    expect(disagreeLine(14, { label: 'Cape Henry', rawKt: 23, normKt: 16.1 })).toBeNull()
  })
  it('the Wind page: the strip\'s "now" is the headline\'s value', () => {
    const page = readFileSync('src/components/WindPageV2.tsx', 'utf8')
    expect(page).toMatch(/n === 0 && shared !== null \? Math\.round\(windIn\(shared\.mps, unit\)/)
    expect(page).toMatch(/data-wind-disagree/)
  })
})
