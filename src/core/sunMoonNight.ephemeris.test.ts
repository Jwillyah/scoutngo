import { describe, expect, it } from 'vitest'
import { moonRiseSet2, sunApparentCrossings2, sunRiseSet2 } from './ephemeris2.ts'
import { moonEvents, sunBoundaries, type BoundaryKind } from './sunMoonNight.ts'
import { zonedTimeToUtc } from './timezone.ts'

/*
 * EVERY TIME THE SUN · MOON · NIGHT PAGE PRINTS, WORKED TWICE.
 *
 * The page's times come from suncalc (sunBoundaries: getTimes and the Sky
 * page's lightMarks; moonEvents: src/core/moonTimes.ts). The second source is
 * src/core/ephemeris2.ts, Meeus's low-accuracy sun and his 24-term moon,
 * written here with no suncalc code. The functions asserted are the page's
 * own, not a copy (docs/failure-modes.md, C).
 *
 * Virginia Beach, November and December 2026, every third night, and two
 * other latitudes. A gap over 5 minutes fails. The count of comparisons is
 * asserted too, so a run that found no events cannot pass (B).
 */
const PLACES = [
  { name: 'Virginia Beach', lat: 36.85, lon: -75.98, tz: 'America/New_York' },
  { name: 'Denver', lat: 39.74, lon: -104.99, tz: 'America/Denver' },
  { name: 'Miami', lat: 25.76, lon: -80.19, tz: 'America/New_York' },
]
const LIMIT_MS = 5 * 60_000

function dates(): string[] {
  const out: string[] = []
  for (let t = Date.UTC(2026, 10, 1); t <= Date.UTC(2026, 11, 31); t += 3 * 86_400_000) out.push(new Date(t).toISOString().slice(0, 10))
  return out
}

/** Nearest instant in a list, and the gap. */
function nearest(at: Date, list: Date[]): number {
  return Math.min(...list.map((d) => Math.abs(d.getTime() - at.getTime())))
}

/* Which height and direction each light edge is, for the second source. */
const EDGE: Record<BoundaryKind, { deg: number | 'rise-set'; rising: boolean }> = {
  golden: { deg: 6, rising: false },
  sunset: { deg: 'rise-set', rising: false },
  blue: { deg: -4, rising: false },
  dark: { deg: -6, rising: false },
  dawn: { deg: -6, rising: true },
  glow: { deg: -4, rising: true },
  sunrise: { deg: 'rise-set', rising: true },
  day: { deg: 6, rising: true },
}

describe('the page’s sun and moon times, against a second ephemeris', () => {
  const worst: Record<string, number> = {}
  let compared = 0
  const note = (kind: string, gap: number) => {
    worst[kind] = Math.max(worst[kind] ?? 0, gap)
    compared += 1
  }

  for (const p of PLACES) {
    it(`${p.name}: sunrise, sunset, golden, blue and dark within 5 min`, () => {
      for (const date of dates()) {
        const from = zonedTimeToUtc(date, '00:00', p.tz)!
        const to = new Date(from.getTime() + 86_400_000)
        const pad = 6 * 3_600_000
        const a = new Date(from.getTime() - pad)
        const b = new Date(to.getTime() + pad)
        const edges = sunBoundaries(from, to, p.lat, p.lon)
        expect(edges.length).toBeGreaterThanOrEqual(8)
        for (const e of edges) {
          const spec = EDGE[e.kind]
          const second = (spec.deg === 'rise-set' ? sunRiseSet2(a, b, p.lat, p.lon) : sunApparentCrossings2(a, b, p.lat, p.lon, spec.deg)).filter((c) => c.rising === spec.rising).map((c) => c.at)
          const gap = nearest(e.at, second)
          note(e.kind, gap)
          expect(gap, `${p.name} ${date} ${e.kind} ${e.at.toISOString()}`).toBeLessThanOrEqual(LIMIT_MS)
        }
      }
    })

    it(`${p.name}: moonrise and moonset within 5 min`, () => {
      for (const date of dates()) {
        const from = zonedTimeToUtc(date, '00:00', p.tz)!
        const to = new Date(from.getTime() + 86_400_000)
        const pad = 6 * 3_600_000
        const second = moonRiseSet2(new Date(from.getTime() - pad), new Date(to.getTime() + pad), p.lat, p.lon)
        const events = moonEvents(from, to, p.lat, p.lon, p.tz)
        expect(events.length).toBeGreaterThanOrEqual(1)
        for (const e of events) {
          const gap = nearest(e.at, second.filter((c) => c.rising === (e.kind === 'rise')).map((c) => c.at))
          note(`moon${e.kind}`, gap)
          expect(gap, `${p.name} ${date} moon${e.kind} ${e.at.toISOString()}`).toBeLessThanOrEqual(LIMIT_MS)
        }
      }
    })
  }

  it('compared every kind of time, and says the worst gap of each', () => {
    for (const k of ['golden', 'sunset', 'blue', 'dark', 'dawn', 'glow', 'sunrise', 'day', 'moonrise', 'moonset']) expect(worst[k], k).toBeDefined()
    expect(compared).toBeGreaterThan(600)
    console.log(`ephemeris check, ${compared} times, worst gap in seconds: ${Object.entries(worst).map(([k, v]) => `${k} ${Math.round(v / 1000)}`).join(', ')}`)
  })
})
