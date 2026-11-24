import { describe, expect, it } from 'vitest'
import { getMoonPosition, getTimes } from 'suncalc'
import { moonPosition2 } from '../src/core/ephemeris2.ts'
import { pickMoment, type Moment } from '../src/core/homeTiles.ts'
import { MOON_ALERT_LEAD_MS, moonDistanceKm, moonGoAlert, moonHomeMoment, SUPERMOON_MAX_KM, supermoonsBetween } from '../src/core/moonMoment.ts'
import { moonMoments } from '../src/core/moonNights.ts'
import { moonPhasesBetween } from '../src/core/moonPhases.ts'
import { formatClock } from '../src/core/timezone.ts'

/*
 * Batch SIMPLE-3, Section 2b: the moon's moment on the home. Fixture:
 * Atlantic Park Surf, Mon 23 Nov 2026 10:27 PM. Table and the second
 * ephemeris: measurements/2026-11-24-supermoon.md.
 */
const LAT = 36.851
const LON = -75.98
const TZ = 'America/New_York'
const at = (iso: string) => new Date(iso)
const MON_1027PM = at('2026-11-24T03:27:00Z')
const near = (d: Date, iso: string, min: number) => expect(Math.abs(d.getTime() - at(iso).getTime())).toBeLessThanOrEqual(min * 60_000)

describe('the distance: suncalc is Meeus 47 to the book, and a second ephemeris agrees', () => {
  it("Meeus's example 47.a: 1992 Apr 12 0h TD, 368,409.7 km", () => {
    /* suncalc adds ΔT itself; it is given UT, TD less 59 s in 1992. */
    expect(getMoonPosition(new Date(Date.UTC(1992, 3, 12) - 59_000), 0, 0).distance).toBeCloseTo(368409.7, 0)
  })

  it('every full moon of 2026-27: within 200 km of ephemeris2, and on the same side of 362,000 km', () => {
    const fulls = moonPhasesBetween(at('2026-01-01T00:00:00Z'), at('2028-01-01T00:00:00Z')).filter((p) => p.kind === 'full')
    expect(fulls.length).toBe(25)
    for (const p of fulls) {
      const ours = moonDistanceKm(p.at)
      const second = moonPosition2(p.at, LAT, LON).distanceKm
      expect(Math.abs(ours - second)).toBeLessThan(200)
      expect(ours <= SUPERMOON_MAX_KM).toBe(second <= SUPERMOON_MAX_KM)
    }
  })

  it('24 Nov 2026 is a supermoon at 360,767 km (the batch said 360,765); 3 Jan 2026 at 362,313 km is not', () => {
    const list = supermoonsBetween(at('2026-01-01T00:00:00Z'), at('2028-01-01T00:00:00Z'), LAT, LON, TZ)
    expect(list.map((s) => s.date)).toEqual(['2026-11-24', '2026-12-23', '2027-01-22'])
    expect(list[0].distanceKm).toBeCloseTo(360767.3, 0)
    expect(Math.abs(list[0].distanceKm - 360765)).toBeLessThan(5)
    const jan = moonPhasesBetween(at('2026-01-01T00:00:00Z'), at('2026-01-10T00:00:00Z')).find((p) => p.kind === 'full')!
    expect(moonDistanceKm(jan.at)).toBeGreaterThan(SUPERMOON_MAX_KM)
  })
})

describe('the home card, Atlantic Park, Mon 23 Nov 10:27 PM', () => {
  const m = moonHomeMoment(MON_1027PM, LAT, LON, TZ)

  it('shows the Supermoon, its words computed', () => {
    expect(m?.which).toBe('supermoon')
    expect(m?.eyebrow.toUpperCase()).toBe('SUPERMOON TOMORROW · TUE 24')
    expect(m?.line).toBe('Rises 4:38 PM ENE · at sunset')
    expect(m?.target).toBe('sky-night')
    expect(m?.kind).toBe('moonrise')
    expect(m?.always).toBe(true)
  })

  it('moonrise ~4:38 PM at ~57° (ENE); sunset ~4:50; moonset Tue 24 ~7:00 AM WNW', () => {
    near(m!.event.at, '2026-11-24T21:38:00Z', 1)
    expect(m!.event.azimuth).toBeGreaterThan(56)
    expect(m!.event.azimuth).toBeLessThan(58)
    near(getTimes(at('2026-11-24T17:00:00Z'), LAT, LON).sunset as Date, '2026-11-24T21:50:00Z', 1)
    /* Tue 24's Moonset at sunrise (USNO 7:01 AM at Chic's Beach, measurements/2026-11-19-moon-fixture.md); here the Supermoon outranks it. */
    const set = moonMoments(MON_1027PM, LAT, LON, TZ, 2).find((x) => x.kind === 'moonset-at-sunrise')
    expect(set?.kind === 'moonset-at-sunrise' && set.date).toBe('2026-11-24')
    if (set?.kind === 'moonset-at-sunrise') {
      near(set.moonset.at, '2026-11-24T12:00:00Z', 1)
      expect(set.moonset.compass).toBe('WNW')
    }
  })

  it('shown from the sunset the evening before through 30 min after the rise; gone after', () => {
    expect(moonHomeMoment(at('2026-11-23T21:40:00Z'), LAT, LON, TZ)).toBeNull()
    expect(moonHomeMoment(at('2026-11-23T21:55:00Z'), LAT, LON, TZ)?.which).toBe('supermoon')
    expect(moonHomeMoment(at('2026-11-24T15:00:00Z'), LAT, LON, TZ)?.eyebrow).toBe('Supermoon tonight · Tue 24')
    const up = moonHomeMoment(at('2026-11-24T21:50:00Z'), LAT, LON, TZ)
    expect(up?.eyebrow).toBe('Supermoon up now · Tue 24')
    expect(up?.line).toMatch(/^Rose 4:38 PM ENE · look [A-Z]+$/)
    expect(moonHomeMoment(at('2026-11-24T22:10:00Z'), LAT, LON, TZ)).toBeNull()
  })

  it('a Supermoon always shows, whatever the persona ranks first', () => {
    const glassy: Moment = { kind: 'glassy', at: at('2026-11-24T13:00:00Z'), eyebrow: 'Glassy · 8–10 AM', line: '', target: 'surf' }
    for (const p of ['surf', 'shoot', 'fish', 'drone', 'weather'] as const) expect(pickMoment([glassy, m], p)).toBe(m)
    /* Without `always` it takes the moon's place in the rank. */
    const big: Moment = { ...m!, always: false }
    expect(pickMoment([glassy, big], 'surf')?.kind).toBe('glassy')
  })

  it('the Go alert: 15 min before the rise, "Supermoon rising now · look ENE", never after the rise', () => {
    const a = moonGoAlert(m, MON_1027PM)
    expect(a?.text).toBe('Supermoon rising now · look ENE')
    expect(a!.until.getTime() - a!.fireAt.getTime()).toBe(MOON_ALERT_LEAD_MS)
    expect(formatClock(new Date(Math.round(a!.fireAt.getTime() / 60_000) * 60_000), TZ, 12)).toBe('4:23 PM')
    expect(moonGoAlert(moonHomeMoment(at('2026-11-24T21:50:00Z'), LAT, LON, TZ), at('2026-11-24T21:50:00Z'))).toBeNull()
  })
})

describe('Big moonrise and Moonset at sunrise, from moonMoments, when no Supermoon', () => {
  it('Tue 24 Nov 7:00 AM WNW is a Moonset at sunrise; on a night with no supermoon (Oct 2026) the moments still come', () => {
    /* October 2026's full moon (368,871 km) is no supermoon: its moments are the Big moonrise / Moonset at sunrise. */
    let found = 0
    for (let h = 0; h < 24 * 5; h += 1) {
      const now = new Date(at('2026-10-24T12:00:00Z').getTime() + h * 3_600_000)
      const x = moonHomeMoment(now, LAT, LON, TZ)
      if (x === null) continue
      expect(x.which).not.toBe('supermoon')
      expect(x.always).toBe(false)
      expect(x.line).toMatch(/^(Rises|Rose|Sets) \d{1,2}(:\d\d)? [AP]M [NESW]{1,3} · /)
      expect(now.getTime()).toBeGreaterThanOrEqual(x.from.getTime())
      expect(now.getTime()).toBeLessThan(x.until.getTime())
      found += 1
    }
    expect(found).toBeGreaterThan(0)
  })
})
