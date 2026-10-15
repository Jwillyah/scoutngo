import { describe, expect, it, vi } from 'vitest'
import { fetchWind, parseWind } from './forecast.ts'

/*
 * WIND, FOR TWO THINGS. A drone pilot, for whom speed and gusts decide whether
 * the aircraft goes up, and the upwind ranking in src/core/upwind.ts, which
 * needs the direction to say which camera shows what is coming.
 */
const WHEN = new Date('2026-10-20T07:00:00')

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
    const out = parseWind(payload(), WHEN)
    expect(out.status).toBe('ok')
    if (out.status !== 'ok') return
    expect(out.wind.fromDegrees).toBe(315)
  })

  /* Open-Meteo reports km/h; everything in core is metres per second. */
  it('converts km/h to metres per second', () => {
    const out = parseWind(payload(), WHEN)
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
    const out = parseWind(payload({ wind_direction_10m: [null, null, null] }), WHEN)
    expect(out.status).toBe('unavailable')
    if (out.status !== 'unavailable') return
    expect(out.reason).toMatch(/missing/i)
  })

  it('refuses rather than inventing a calm', () => {
    expect(parseWind(payload({ wind_speed_10m: [null, null, null] }), WHEN).status).toBe(
      'unavailable',
    )
  })

  /* A gust is genuinely optional: no gust reading is not a broken wind reading. */
  it('reports a missing gust as null and keeps the wind', () => {
    const out = parseWind(payload({ wind_gusts_10m: [null, null, null] }), WHEN)
    expect(out.status).toBe('ok')
    if (out.status !== 'ok') return
    expect(out.gustMps).toBeNull()
    expect(out.wind.speedMps).toBeCloseTo(10, 6)
  })

  it('survives a payload of the wrong shape', () => {
    expect(parseWind(null, WHEN).status).toBe('unavailable')
    expect(parseWind({}, WHEN).status).toBe('unavailable')
    expect(parseWind({ hourly: { time: [] } }, WHEN).status).toBe('unavailable')
  })

  it('falls back to the first hour when the wanted one is not listed', () => {
    const out = parseWind(payload(), new Date('2026-10-20T23:00:00'))
    if (out.status !== 'ok') return
    expect(out.wind.fromDegrees).toBe(300)
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
