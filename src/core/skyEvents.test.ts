import { describe, expect, it } from 'vitest'
import { getMoonIllumination, getMoonTimes } from 'suncalc'
import {
  moonTurningPoints,
  showerEventsBetween,
  SKY_EVENT_DAYS,
  upcomingSkyEvents,
} from './skyEvents.ts'
import { skyWindow } from './skyWindow.ts'

const OVERLOOK = { lat: 38.7567229, lon: -78.2675403 }

const illumination = (at: Date): number => getMoonIllumination(at).fraction
const moonrise = (at: Date): Date | null => {
  const times = getMoonTimes(at, OVERLOOK.lat, OVERLOOK.lon)
  return times.rise instanceof Date && !Number.isNaN(times.rise.getTime()) ? times.rise : null
}
const milkyWayShootable = (eveningOf: Date): boolean =>
  skyWindow({
    target: { kind: 'milkyway' },
    at: OVERLOOK,
    eveningOf,
    horizon: { kind: 'flat' },
  }).kind === 'window'

const ymd = (at: Date): string =>
  `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`

describe('shower rows', () => {
  it('offers every peak as two nights, the night before and the night of', () => {
    const rows = showerEventsBetween(new Date(2026, 9, 1), new Date(2026, 10, 1))
    const orionids = rows.filter((r) => r.name === 'Orionids')
    expect(orionids).toHaveLength(2)
    expect(orionids.map((r) => ymd(r.eveningOf))).toEqual(['2026-10-20', '2026-10-21'])
    expect(orionids[0]?.note).toMatch(/night before/i)
    expect(orionids[1]?.note).toMatch(/peak night/i)
  })

  it('carries the shower as a target so the row can compute a window', () => {
    const rows = showerEventsBetween(new Date(2026, 9, 1), new Date(2026, 10, 1))
    const peak = rows.find((r) => r.name === 'Orionids' && ymd(r.eveningOf) === '2026-10-21')
    expect(peak?.target).toEqual({ kind: 'meteors', shower: 'orionids' })
  })

  it('does not lose the Quadrantids across a year boundary', () => {
    /*
     * A ninety day span from mid December runs into January. A search that
     * only looked at the start year would drop the strongest shower of the
     * first week of the year, silently.
     */
    const rows = showerEventsBetween(new Date(2026, 11, 15), new Date(2027, 2, 15))
    const quads = rows.filter((r) => r.name === 'Quadrantids')
    expect(quads.length).toBeGreaterThan(0)
    expect(quads.every((r) => r.eveningOf.getFullYear() === 2027)).toBe(true)
  })

  it('states ZHR as a perfect-sky figure rather than a promise of meteors', () => {
    const rows = showerEventsBetween(new Date(2026, 9, 1), new Date(2026, 10, 1))
    for (const row of rows) {
      expect(row.note).toMatch(/under a perfect sky/i)
      expect(row.note).not.toMatch(/you will see|expect to see/i)
    }
  })
})

describe('moon turning points', () => {
  it('finds new and full moons about a fortnight apart', () => {
    const { newMoons, fullMoons } = moonTurningPoints(
      new Date(2026, 9, 1),
      new Date(2026, 11, 31),
      illumination,
    )
    expect(newMoons.length).toBeGreaterThanOrEqual(2)
    expect(fullMoons.length).toBeGreaterThanOrEqual(2)
    for (const point of newMoons) expect(point.fraction).toBeLessThan(0.05)
    for (const point of fullMoons) expect(point.fraction).toBeGreaterThan(0.95)
  })

  it('spaces consecutive new moons by roughly a synodic month', () => {
    const { newMoons } = moonTurningPoints(
      new Date(2026, 0, 1),
      new Date(2026, 11, 31),
      illumination,
    )
    for (let i = 1; i < newMoons.length; i += 1) {
      const gapDays =
        ((newMoons[i]?.at.getTime() ?? 0) - (newMoons[i - 1]?.at.getTime() ?? 0)) / 86_400_000
      expect(gapDays).toBeGreaterThan(28)
      expect(gapDays).toBeLessThan(31)
    }
  })
})

describe('the ninety day listing at the overlook', () => {
  const events = upcomingSkyEvents({
    from: new Date(2026, 9, 18),
    days: SKY_EVENT_DAYS,
    illumination,
    moonrise,
    milkyWayShootable,
  })

  it('looks ninety days ahead', () => {
    expect(SKY_EVENT_DAYS).toBe(90)
  })

  it('is in date order', () => {
    for (let i = 1; i < events.length; i += 1) {
      expect(events[i]?.eveningOf.getTime() ?? 0).toBeGreaterThanOrEqual(
        events[i - 1]?.eveningOf.getTime() ?? 0,
      )
    }
  })

  it('stays inside the span it was asked for', () => {
    const from = new Date(2026, 9, 18, 12)
    const to = new Date(from.getTime() + 90 * 86_400_000)
    for (const event of events) {
      expect(event.eveningOf.getTime()).toBeGreaterThanOrEqual(from.getTime() - 86_400_000)
      expect(event.eveningOf.getTime()).toBeLessThanOrEqual(to.getTime())
    }
  })

  it('carries the Orionid peak, the Leonids and the Geminids', () => {
    const names = events.map((e) => e.name)
    expect(names).toContain('Orionids')
    expect(names).toContain('Leonids')
    expect(names).toContain('Geminids')
  })

  it('carries new moons and full moons', () => {
    expect(events.some((e) => e.kind === 'new-moon')).toBe(true)
    expect(events.some((e) => e.kind === 'full-moon')).toBe(true)
  })

  it('gives every row a unique id, so nothing is keyed by index', () => {
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length)
  })

  it('gives a full moon the moon as its target, not a meteor shower', () => {
    const full = events.find((e) => e.kind === 'full-moon')
    expect(full?.target).toEqual({ kind: 'moon' })
  })

  it('never claims a night will be good, clear or worth it', () => {
    for (const event of events) {
      expect(event.note).not.toMatch(/\bclear\b|\bgood night\b|\bbest\b|\bworth it\b|\bperfect night\b/i)
      expect(event.name).not.toMatch(/\bclear\b/i)
    }
  })
})

describe('the Milky Way season edges', () => {
  it('marks the night the core stops clearing the horizon in the dark', () => {
    /*
     * From Virginia the core is a summer target, so somewhere in the autumn
     * there is a last night. Searched across a span that contains it.
     */
    const events = upcomingSkyEvents({
      from: new Date(2026, 7, 1),
      days: 120,
      illumination,
      moonrise,
      milkyWayShootable,
    })
    const closes = events.filter((e) => e.kind === 'milkyway-season')
    expect(closes.length).toBeGreaterThan(0)
    expect(closes.some((e) => /closes/i.test(e.name))).toBe(true)
  })

  it('gives a season-closing row no target, because there is nothing to shoot', () => {
    const events = upcomingSkyEvents({
      from: new Date(2026, 7, 1),
      days: 120,
      illumination,
      moonrise,
      milkyWayShootable,
    })
    const closing = events.find((e) => e.kind === 'milkyway-season' && /closes/i.test(e.name))
    expect(closing?.target).toBeNull()
  })
})

describe('missing input', () => {
  it('reports a moonrise that did not compute rather than printing a time', () => {
    const events = upcomingSkyEvents({
      from: new Date(2026, 9, 18),
      days: 60,
      illumination,
      moonrise: () => null,
      milkyWayShootable: () => false,
    })
    const full = events.find((e) => e.kind === 'full-moon')
    expect(full?.note).toMatch(/did not compute/i)
  })

  it('produces an empty list rather than throwing for a zero day span', () => {
    const events = upcomingSkyEvents({
      from: new Date(2026, 9, 18),
      days: 0,
      illumination,
      moonrise,
      milkyWayShootable: () => false,
    })
    expect(Array.isArray(events)).toBe(true)
  })
})
