import { getPosition, getTimes } from 'suncalc'
import { describe, expect, it } from 'vitest'
import { dipDeg, groundSpeed, HALF_FIELD_DEG, lensAir, lensSun, sunsetAtHeight, turnBack } from './dronePlan.ts'

const MI = 1609.344
const VB = { lat: 36.85, lon: -75.98 }

describe('turn back by (board Drone_P4)', () => {
  it('in still air, turns at the way home plus the reserve', () => {
    const t = turnBack({ distM: 0.8 * MI, outDeg: 180, windFromDeg: 0, windMps: 0, ratedMin: 45, tempC: 20 })
    expect(t.kind).toBe('ok')
    if (t.kind !== 'ok') return
    const legPct = ((0.8 * MI) / 10 / 60 / 45) * 100
    expect(t.outPct).toBeCloseTo(legPct, 6)
    expect(t.turnPct).toBeCloseTo(legPct + 25, 6)
  })

  it('downwind out, headwind back: the way home is the slow leg', () => {
    const t = turnBack({ distM: 0.8 * MI, outDeg: 180, windFromDeg: 0, windMps: 5, ratedMin: 45, tempC: 20 })
    if (t.kind !== 'ok') throw new Error(t.kind)
    expect(t.outGroundMps).toBeCloseTo(15)
    expect(t.backGroundMps).toBeCloseTo(5)
    expect(t.headBackMps).toBeCloseTo(5)
    expect(t.turnPct - 25).toBeCloseTo(3 * t.outPct, 6)
  })

  it('takes the cold off the pack: 47 °F leaves 38 of 45 minutes', () => {
    const warm = turnBack({ distM: MI, outDeg: 90, windFromDeg: 0, windMps: 0, ratedMin: 45, tempC: 20 })
    const cold = turnBack({ distM: MI, outDeg: 90, windFromDeg: 0, windMps: 0, ratedMin: 45, tempC: (47 - 32) / 1.8 })
    if (warm.kind !== 'ok' || cold.kind !== 'ok') throw new Error('not ok')
    expect(Math.floor(cold.usableMin)).toBe(38)
    expect(cold.turnPct).toBeGreaterThan(warm.turnPct)
  })

  it('says when it makes no headway home, and when the pack is too small', () => {
    expect(turnBack({ distM: MI, outDeg: 180, windFromDeg: 0, windMps: 12, ratedMin: 45, tempC: 20 })).toMatchObject({ kind: 'no-headway', leg: 'back' })
    expect(turnBack({ distM: 12_000, outDeg: 180, windFromDeg: 0, windMps: 0, ratedMin: 45, tempC: 20 }).kind).toBe('short')
  })

  it('holds off a crosswind: a 6 m/s beam wind leaves 8 of 10 m/s', () => {
    expect(groundSpeed(10, 0, 90, 6)).toBeCloseTo(8)
    expect(groundSpeed(10, 0, 90, 10)).toBeNull()
  })
})

describe('sun at 400 ft', () => {
  it('the horizon dips 0.354° from 400 ft', () => {
    expect(dipDeg(400)).toBeCloseTo(0.354, 3)
    expect(dipDeg(0)).toBe(0)
  })

  it('sets the dip’s worth of descent later: 0.16°/min is 2.2 min', () => {
    const s = new Date('2026-11-16T21:53:00Z')
    const alt = (t: Date) => -0.833 - ((t.getTime() - s.getTime()) / 60_000) * 0.16
    const up = sunsetAtHeight(s, 400, alt)
    expect((up.getTime() - s.getTime()) / 60_000).toBeCloseTo(dipDeg(400) / 0.16, 1)
  })

  it('at Virginia Beach on 16 Nov, about 2 minutes after the beach', () => {
    const s = getTimes(new Date('2026-11-16T17:00:00Z'), VB.lat, VB.lon).sunset!
    const up = sunsetAtHeight(s, 400, (t) => getPosition(t, VB.lat, VB.lon).altitude)
    const min = (up.getTime() - s.getTime()) / 60_000
    expect(min).toBeGreaterThan(1.5)
    expect(min).toBeLessThan(3)
  })
})

describe('sun in the lens', () => {
  it('the afternoon’s low sun at Virginia Beach, the bearings within 20° of it', () => {
    const now = new Date('2026-11-16T17:00:00Z')
    const s = lensSun(now, (t) => getPosition(t, VB.lat, VB.lon))!
    expect(s.part).toBe('evening')
    const setAz = getPosition(getTimes(now, VB.lat, VB.lon).sunset!, VB.lat, VB.lon).azimuth
    expect(s.fromDeg).toBeLessThan(setAz - HALF_FIELD_DEG + 1)
    expect(s.toDeg).toBeGreaterThanOrEqual(Math.floor(setAz + HALF_FIELD_DEG - 1))
    expect(s.from.getTime()).toBeGreaterThan(now.getTime())
  })

  it('after dark, the next morning’s low sun', () => {
    const s = lensSun(new Date('2026-11-17T01:00:00Z'), (t) => getPosition(t, VB.lat, VB.lon))!
    expect(s.part).toBe('morning')
    expect(s.midDeg).toBeGreaterThan(90)
    expect(s.midDeg).toBeLessThan(160)
  })
})

describe('lens fog and ice', () => {
  it('reads the dew-point spread', () => {
    expect(lensAir(8, 0, 400, 0).fog).toBe('unlikely')
    expect(lensAir(4, 0, 400, 0).fog).toBe('possible')
    expect(lensAir(1, 0, 400, 0).fog).toBe('likely')
  })
  it('icing only at or under freezing at the height, with moisture', () => {
    expect(lensAir(0.5, 0, 400, 0).icing).toBe(true)
    expect(lensAir(1, 0, 400, 0).icing).toBe(false)
    expect(lensAir(-3, -15, 400, 0).icing).toBe(false)
    expect(lensAir(-3, -15, 400, 80).icing).toBe(true)
    expect(lensAir(8, 0, 400, 0).aloftC).toBeCloseTo(8 - 0.0065 * 121.92, 3)
  })
})
