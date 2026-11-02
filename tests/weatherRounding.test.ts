import { beforeEach, describe, expect, it } from 'vitest'
import { clearWeatherStore, roundedWeatherUrl, weatherJson, weatherSent, FORECAST_MAX_AGE_MS } from '../src/lib/weatherStore.ts'

/*
 * "WEATHER SERVICE BUSY" ON AN ORDINARY SESSION (Batch H, 2 Nov 9:36 AM).
 * A pin nudged 50 m, or a second spot down the beach, asked Open-Meteo again
 * for the same forecast. The coordinates go out rounded to 2 decimals, so
 * it is one request, kept for the hour.
 */
const BASE = 'https://api.open-meteo.com/v1/forecast'
const at = (lat: string, lon: string) => `${BASE}?latitude=${lat}&longitude=${lon}&hourly=wind_speed_10m`

describe('the weather question, rounded', () => {
  beforeEach(async () => {
    await clearWeatherStore()
  })

  it('rounds every latitude and longitude, lists included, and nothing else', () => {
    const u = new URL(roundedWeatherUrl(`${BASE}?latitude=36.8435575,36.9012&longitude=-75.9713104,-75.5&hourly=cloud_cover&forecast_days=2`))
    expect(u.searchParams.get('latitude')).toBe('36.84,36.90')
    expect(u.searchParams.get('longitude')).toBe('-75.97,-75.50')
    expect(u.searchParams.get('forecast_days')).toBe('2')
  })

  it('a pin nudged 50 m asks nothing new within the hour', async () => {
    let calls = 0
    const fetchImpl = (async (url: string) => {
      calls += 1
      expect(new URL(url).searchParams.get('latitude')).toBe('36.84')
      return new Response(JSON.stringify({ hourly: {} }), { status: 200 })
    }) as unknown as typeof fetch
    for (const [lat, lon] of [['36.8435575', '-75.9713104'], ['36.8440', '-75.9708'], ['36.8431', '-75.9717']]) {
      const got = await weatherJson(at(lat, lon), { maxAgeMs: FORECAST_MAX_AGE_MS, fetchImpl })
      expect(got.ok).toBe(true)
    }
    expect(calls).toBe(1)
    expect(weatherSent()).toHaveLength(1)
  })

  it('backs off on 429 and serves the kept answer, sending nothing meanwhile', async () => {
    let calls = 0
    const ok = (async () => {
      calls += 1
      return new Response('{"a":1}', { status: 200 })
    }) as unknown as typeof fetch
    await weatherJson(at('36.84', '-75.97'), { maxAgeMs: FORECAST_MAX_AGE_MS, fetchImpl: ok })
    const busy = (async () => {
      calls += 1
      return new Response('Too many', { status: 429 })
    }) as unknown as typeof fetch
    const first = await weatherJson(at('36.84', '-75.97'), { maxAgeMs: -1, fetchImpl: busy })
    expect(first.ok && first.stale).toBe(true)
    const again = await weatherJson(at('36.84', '-75.97'), { maxAgeMs: -1, fetchImpl: busy })
    expect(again.ok && again.stale).toBe(true)
    expect(calls).toBe(2)
  })
})
