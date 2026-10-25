import { describe, expect, it, vi } from 'vitest'
import { fetchWind, parseWind, venueClock } from './forecast.ts'

/*
 * WIND, FOR TWO THINGS. A drone pilot, for whom speed and gusts decide whether
 * the aircraft goes up, and the upwind ranking in src/core/upwind.ts, which
 * needs the direction to say which camera shows what is coming.
 */
/* 07:00 EDT at Lynnhaven Inlet. Every instant here is pinned to the venue's zone. */
const ZONE = 'America/New_York'
const WHEN = new Date('2026-10-20T11:00:00Z')

const payload = (over: Record<string, unknown> = {}) => ({
  hourly: {
    time: ['2026-10-20T06:00', '2026-10-20T07:00', '2026-10-20T08:00'],
    wind_speed_10m: [18, 36, 25],
    wind_direction_10m: [300, 315, 320],
    wind_gusts_10m: [30, 54, 40],
    ...over,
  },
})

describe('parsing wind', () => {
  it('picks the hour the shoot is in, not the first of the day', () => {
    const out = parseWind(payload(), WHEN, ZONE)
    expect(out.status).toBe('ok')
    if (out.status !== 'ok') return
    expect(out.wind.fromDegrees).toBe(315)
  })

  /* Open-Meteo reports km/h; everything in core is metres per second. */
  it('converts km/h to metres per second', () => {
    const out = parseWind(payload(), WHEN, ZONE)
    if (out.status !== 'ok') return
    expect(out.wind.speedMps).toBeCloseTo(10, 6)
    expect(out.gustMps).toBeCloseTo(15, 6)
  })

  /*
   * A MISSING DIRECTION MUST NOT READ AS NORTH. numberAt returns 0 for an
   * absent value, which for a bearing is a confident claim of due north and
   * would rank the upwind list exactly wrong. Absent stays absent.
   */
  it('refuses rather than inventing a direction of zero', () => {
    const out = parseWind(payload({ wind_direction_10m: [null, null, null] }), WHEN, ZONE)
    expect(out.status).toBe('unavailable')
    if (out.status !== 'unavailable') return
    expect(out.reason).toMatch(/missing/i)
  })

  it('refuses rather than inventing a calm', () => {
    expect(parseWind(payload({ wind_speed_10m: [null, null, null] }), WHEN, ZONE).status).toBe(
      'unavailable',
    )
  })

  /* A gust is genuinely optional: no gust reading is not a broken wind reading. */
  it('reports a missing gust as null and keeps the wind', () => {
    const out = parseWind(payload({ wind_gusts_10m: [null, null, null] }), WHEN, ZONE)
    expect(out.status).toBe('ok')
    if (out.status !== 'ok') return
    expect(out.gustMps).toBeNull()
    expect(out.wind.speedMps).toBeCloseTo(10, 6)
  })

  it('survives a payload of the wrong shape', () => {
    expect(parseWind(null, WHEN, ZONE).status).toBe('unavailable')
    expect(parseWind({}, WHEN, ZONE).status).toBe('unavailable')
    expect(parseWind({ hourly: { time: [] } }, WHEN, ZONE).status).toBe('unavailable')
  })

  /*
   * THIS TEST WAS WRONG. It was "falls back to the first hour when the wanted
   * one is not listed", and it asserted that a 23:00 shoot was handed the
   * 06:00 wind. That fallback is exactly how the UTC date bug showed up: an
   * evening shoot asked for tomorrow's UTC date, found no row for its hour,
   * and read the first row of the wrong day as its own. No row is no reading.
   */
  it('refuses rather than serving another hour as this one', () => {
    const out = parseWind(payload(), new Date('2026-10-21T03:00:00Z'), ZONE)
    expect(out.status).toBe('unavailable')
    if (out.status !== 'unavailable') return
    expect(out.reason).toContain('23:00')
  })
})

/*
 * THE VENUE'S DATE, NOT THE UTC DATE. 21:30 EDT on the 20th is 01:30 UTC on
 * the 21st. The request must ask for the 20th and read the 21:00 row.
 */
describe('a late-evening shoot reads its own hour', () => {
  const EVENING = new Date('2026-10-21T01:30:00Z')

  it('the venue clock is local wall time in the venue zone', () => {
    expect(venueClock(EVENING, ZONE)).toEqual({ date: '2026-10-20', hour: '2026-10-20T21' })
    /* Not the device's zone: the same instant in Tokyo is the next afternoon. */
    expect(venueClock(EVENING, 'Asia/Tokyo').hour).toBe('2026-10-21T10')
  })

  it('asks Open-Meteo for the local date', async () => {
    const fetchImpl = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify(payload()), { status: 200 }),
    )
    await fetchWind({ lat: 36.9063, lon: -76.0836 }, EVENING, ZONE, fetchImpl as unknown as typeof fetch)
    const url = String(fetchImpl.mock.calls[0][0])
    expect(url).toContain('start_date=2026-10-20')
    expect(url).toContain('end_date=2026-10-20')
    expect(url).not.toContain('2026-10-21')
  })

  it('reads the 21:00 row, not the first one', () => {
    const evening = {
      hourly: {
        time: ['2026-10-20T00:00', '2026-10-20T21:00', '2026-10-20T22:00'],
        wind_speed_10m: [5, 18, 25],
        wind_direction_10m: [10, 200, 220],
        wind_gusts_10m: [8, 30, 40],
      },
    }
    const out = parseWind(evening, EVENING, ZONE)
    expect(out.status === 'ok' && out.wind.fromDegrees).toBe(200)
  })
})

describe('fetching wind', () => {
  const ok = (body: unknown) =>
    vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify(body), { status: 200 }),
    )

  it('asks for speed, direction and gusts at the venue', async () => {
    const fetchImpl = ok(payload())
    await fetchWind({ lat: 36.9063, lon: -76.0836 }, WHEN, 'America/New_York', fetchImpl as unknown as typeof fetch)
    const url = String(fetchImpl.mock.calls[0][0])
    expect(url).toContain('wind_speed_10m')
    expect(url).toContain('wind_direction_10m')
    expect(url).toContain('wind_gusts_10m')
    expect(url).toContain('latitude=36.9063')
    /* Keyless, like the cloud forecast it shares an endpoint with. */
    expect(url.toLowerCase()).not.toContain('key=')
  })

  it('reports a server error as a state, not a throw', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 503 }))
    const out = await fetchWind(
      { lat: 1, lon: 2 },
      WHEN,
      'UTC',
      fetchImpl as unknown as typeof fetch,
    )
    expect(out.status).toBe('unavailable')
    if (out.status !== 'unavailable') return
    expect(out.reason).toContain('503')
  })

  it('reports being offline as a state', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    const out = await fetchWind(
      { lat: 1, lon: 2 },
      WHEN,
      'UTC',
      fetchImpl as unknown as typeof fetch,
    )
    expect(out.status).toBe('unavailable')
  })
})
