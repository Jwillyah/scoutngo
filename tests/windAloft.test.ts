import { describe, expect, it } from 'vitest'
import { halfHour } from '../src/core/markerWind.ts'
import { normalizeWind } from '../src/core/stationWind.ts'
import { ALOFT_MIN_RATIO, saneAloft } from '../src/core/windProfile.ts'
import { zonedTimeToUtc } from '../src/core/timezone.ts'
import { droneWindAt, windAt } from '../src/lib/windNow.ts'
import { hourlyAt, type Hourly } from '../src/lib/tideSheetData.ts'
import { BEACH, capeHenry, hourlyOf, TZ } from './wxFixture.ts'

/*
 * BATCH SIMPLE-3, SECTION 1c: 23 Nov at 11:14 PM the home's Wind said
 * "18 kt NNE · gusts 22" and its Drone tile "8 kt at 400 ft" in the same
 * minute. Two causes, both shown here on the archive
 * (tests/data/wx-2026-11-21-24-vb):
 *
 *   the hour     the Drone tile read the briefing's day hours, 5:30 AM to
 *                8:30 PM local (src/lib/useBriefing.ts), the nearest to now:
 *                at 11:14 PM that is 8:30 PM, before the front
 *   the source   the Wind tile leans to the station (Cape Henry read 27 kt
 *                NNE at 11:12 PM, the front through at 10:42); 400 ft was
 *                the model's alone
 *
 * Now both read droneWindAt / windAt: the brief's series, the same half
 * hour, the same station, and 400 ft never under 0.9 of the surface.
 */
const KT = 0.514444
const NOW = new Date('2026-11-24T04:14:00Z')
const wx = hourlyOf(BEACH)

/** Cape Henry's report at 11:12 PM, carried to 10 m over the beach the way the home does (src/lib/useStationObs.ts). */
function capeHenryObs() {
  const r = capeHenry().find((x) => x.at.toISOString() === '2026-11-24T04:12:00.000Z')
  if (r === undefined) throw new Error('no Cape Henry report at 04:12Z in the recording')
  const n = normalizeWind({ id: '8638999', kind: 'coastal', mps: r.kt * KT, gustMps: r.gustKt === null ? null : r.gustKt * KT, fromDeg: r.fromDeg }, BEACH.facing)
  return { at: r.at, mps: n.mps, gustMps: n.gustMps, fromDeg: r.fromDeg }
}

/** What the Drone tile read before: the nearest of the briefing's day hours (5:30 AM to 8:30 PM local) to now, its model 120 m. */
function tileBefore(series: Hourly, now: Date) {
  const start = zonedTimeToUtc('2026-11-23', '00:00', TZ) as Date
  const hours = Array.from({ length: 16 }, (_, i) => new Date(start.getTime() + (5 + i) * 3_600_000 + 1_800_000))
  const h = hours.reduce((a, b) => (Math.abs(b.getTime() - now.getTime()) < Math.abs(a.getTime() - now.getTime()) ? b : a))
  return { hour: h, mps: hourlyAt(series, 'wind_speed_120m', h) }
}

describe('the contradiction, on the archive', () => {
  it('before: the Drone tile read 8:30 PM, not now, and no station; under half the leaned surface wind', () => {
    const obs = capeHenryObs()
    const surface = windAt(wx, NOW, obs, NOW)
    const before = tileBefore(wx, NOW)
    expect(before.hour.toISOString()).toBe('2026-11-24T01:30:00.000Z')
    expect(surface).not.toBeNull()
    expect((before.mps as number) / (surface?.mps as number)).toBeLessThan(0.5)
  })
  it('after: 400 ft reads the same half hour as the surface, from the same series, and is at least 0.9 of it', () => {
    const obs = capeHenryObs()
    const a = droneWindAt(wx, NOW, obs, NOW)
    const surface = windAt(wx, NOW, obs, NOW)
    expect(a?.surface).toEqual(surface)
    expect(a?.modelMps).toBe(hourlyAt(wx, 'wind_speed_120m', halfHour(NOW)))
    expect(a?.mps).toBeGreaterThanOrEqual(ALOFT_MIN_RATIO * (surface?.mps as number))
  })
})

describe('the phone that night: 18 kt at the ground, 8 kt at 400 ft in the run it had', () => {
  /* The phone's run had the front later than the archive's: 3 kt at 10 m and 8 kt at 120 m for 11 PM. */
  const t = (h: number) => Date.parse('2026-11-24T00:00:00Z') + h * 3_600_000
  const phone: Hourly = { times: [0, 1, 2, 3, 4, 5].map(t), values: { wind_speed_10m: [1.5, 1.5, 1.5, 1.5, 1.5, 1.5], wind_direction_10m: [180, 180, 180, 180, 180, 180], wind_gusts_10m: [3, 3, 3, 3, 3, 3], wind_speed_120m: [8 * KT, 8 * KT, 8 * KT, 8 * KT, 8 * KT, 8 * KT] } }
  const obs = { at: new Date('2026-11-24T04:12:00Z'), mps: 18 * KT, gustMps: 22 * KT, fromDeg: 22 }
  it('400 ft is held at 0.9 of the leaned surface wind (16.5 kt at the half hour), not the 8 kt the run said, and says so', () => {
    const a = droneWindAt(phone, NOW, obs, NOW)
    const surface = windAt(phone, NOW, obs, NOW)
    expect(a?.surface).toEqual(surface)
    expect((surface?.mps as number) / KT).toBeGreaterThan(16)
    expect(a?.floored).toBe(true)
    expect(a?.mps).toBeCloseTo(ALOFT_MIN_RATIO * (surface?.mps as number), 9)
    expect((a?.mps as number) / KT).toBeGreaterThan(14)
  })
  it('a measured profile stands as measured', () => {
    expect(droneWindAt(phone, NOW, obs, NOW, 6 * KT)).toMatchObject({ mps: 6 * KT, measured: true, floored: false })
  })
})

describe('saneAloft', () => {
  it('floors, passes, and says nothing without a value', () => {
    expect(saneAloft(10, 5)).toEqual({ mps: 9, floored: true, measured: false })
    expect(saneAloft(10, 12)).toEqual({ mps: 12, floored: false, measured: false })
    expect(saneAloft(null, 4)).toEqual({ mps: 4, floored: false, measured: false })
    expect(saneAloft(10, null)).toBeNull()
  })
})
