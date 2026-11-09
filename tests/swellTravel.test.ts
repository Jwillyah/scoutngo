import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseRealtime } from '../api/buoy.ts'
import { destinationPoint } from '../src/core/geo.ts'
import { AIMED_TOLERANCE_DEG, angleApart, groupSpeedMps, headedFor, swellTravel, travelSeconds, versusForecast } from '../src/core/swellTravel.ts'
import { nearestBuoys } from '../src/lib/buoy.ts'

/*
 * THE BUOYS PAGE'S ARITHMETIC (Batch N, Section 4): deep-water group speed,
 * the travel time, the "headed for the spot" test, and the buoy against the
 * forecast. The Virginia Beach case reads NDBC's files as published on
 * 2 Nov 2026 (tests/data/ndbc-2026-11-02/<id>.txt).
 */
const PIER = { lat: 36.8436, lon: -75.9713 }

describe('group speed, cg = g T / 4 pi', () => {
  it('10 s: 7.80 m/s', () => {
    expect(groupSpeedMps(10)).toBeCloseTo(7.804, 3)
  })
  it('scales with the period: 16 s is 1.6 times 10 s', () => {
    expect(groupSpeedMps(16)! / groupSpeedMps(10)!).toBeCloseTo(1.6, 10)
  })
  it('no period, no speed', () => {
    expect(groupSpeedMps(null)).toBeNull()
    expect(groupSpeedMps(0)).toBeNull()
    expect(groupSpeedMps(Number.NaN)).toBeNull()
  })
  it('30 km at 10 s: about 64 minutes', () => {
    expect(travelSeconds(30_000, 10)! / 60).toBeCloseTo(64.07, 1)
  })
})

describe('headed for the spot: the heading (MWD + 180) within the tolerance of the buoy-to-spot bearing', () => {
  it('angles wrap round north', () => {
    expect(angleApart(350, 10)).toBe(20)
    expect(angleApart(10, 350)).toBe(20)
    expect(angleApart(0, 180)).toBe(180)
  })
  it('waves from the east reach a spot due west of the buoy', () => {
    expect(headedFor(90, 270)).toBe(true)
  })
  it('at the tolerance yes, just past it no', () => {
    expect(headedFor(90, 270 + AIMED_TOLERANCE_DEG)).toBe(true)
    expect(headedFor(90, 270 + AIMED_TOLERANCE_DEG + 1)).toBe(false)
  })
  it('waves from the west do not reach a spot west of the buoy; no direction, no answer', () => {
    expect(headedFor(270, 270)).toBe(false)
    expect(headedFor(null, 270)).toBe(false)
  })
  it('swellTravel gives minutes only when aimed', () => {
    const buoy = destinationPoint(PIER, 90, 30_000) /* 30 km due east of the pier */
    const aimed = swellTravel(buoy, PIER, 10, 90)
    expect(aimed.aimed).toBe(true)
    expect(aimed.meters).toBeCloseTo(30_000, -1)
    expect(aimed.minutes!).toBeCloseTo(64.1, 0)
    const away = swellTravel(buoy, PIER, 10, 270)
    expect(away.aimed).toBe(false)
    expect(away.minutes).toBeNull()
    expect(swellTravel(buoy, PIER, null, 90).minutes).toBeNull()
  })
})

const read = (id: string) => parseRealtime(readFileSync(`tests/data/ndbc-2026-11-02/${id}.txt`, 'utf8'))!

describe('Virginia Beach, 2 Nov 2026, from NDBC files', () => {
  it('the buoys chosen, each leg printed, and which are headed for the pier', () => {
    const picks = nearestBuoys(PIER, 3, 100)
    expect(picks.map((b) => b.id)).toEqual(['44099', '44100', '44056'])
    const legs = picks.map((b) => {
      const r = read(b.id)
      const leg = swellTravel(b.at, PIER, r.periodS, r.fromDeg)
      return { id: b.id, km: +(leg.meters / 1000).toFixed(1), bearing: Math.round(leg.bearingToSpot), mwd: r.fromDeg, dpd: r.periodS, aimed: leg.aimed, minutes: leg.minutes === null ? null : Math.round(leg.minutes) }
    })
    /* 44099 Cape Henry, MWD 106 (heading 286) against a bearing of about 252 to the pier: inside 45. */
    expect(legs[0]).toMatchObject({ id: '44099', mwd: 106, dpd: 8, aimed: true })
    expect(legs[0].minutes).toBe(Math.round(travelSeconds(legs[0].km * 1000, 8)! / 60))
    /* 44100 at Duck, MWD 95 (heading 275) against about 333 to the pier: 58 apart, no travel time. */
    expect(legs[1]).toMatchObject({ id: '44100', aimed: false, minutes: null })
  })
})

describe('the buoy against the forecast', () => {
  it('within the larger of 0.15 m and 20% is as forecast', () => {
    expect(versusForecast(1.1, 1.0)).toBe('as-forecast')
    expect(versusForecast(0.6, 0.5)).toBe('as-forecast') /* 0.1 under the 0.15 m floor */
    expect(versusForecast(1.3, 1.0)).toBe('bigger')
    expect(versusForecast(0.7, 1.0)).toBe('smaller')
  })
  it('nothing to compare, no answer', () => {
    expect(versusForecast(null, 1)).toBeNull()
    expect(versusForecast(1, null)).toBeNull()
  })
})

describe('the Buoys page test copies the NDBC files right', () => {
  it('LATEST in src/components/buoysPageV2.test.tsx is the newest line of each file', () => {
    const page = readFileSync('src/components/buoysPageV2.test.tsx', 'utf8')
    for (const id of ['44099', '44100', '44056']) {
      const r = read(id)
      expect(page).toContain(`'${id}': { at: '${r.at}', waveM: ${r.waveM}, periodS: ${r.periodS}, fromDeg: ${r.fromDeg} }`)
    }
  })
})
