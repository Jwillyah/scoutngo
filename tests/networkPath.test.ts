import { afterEach, describe, expect, it } from 'vitest'
import { BUOY_RETRY_MS, postBuoy } from '../src/lib/buoy.ts'
import { clearWeatherStore, setForecastEdge, weatherBusy, weatherJson } from '../src/lib/weatherStore.ts'

/*
 * BATCH MAP A3 (9 Nov, LTE): the home loaded through the forecast cache while
 * the Wind, Buoys and Surf pages said nothing arrived. Two of the ways that
 * happens, pinned here: a buoy request lost on a flaky link (asked once, no
 * time limit), and a refusal Open-Meteo gave the phone itself holding back
 * every request, the cache's too.
 */
afterEach(async () => {
  setForecastEdge(null)
  await clearWeatherStore()
})

describe('the buoy request', () => {
  it('is asked again after 2 s and 6 s when no answer comes, then answers', async () => {
    let n = 0
    const waits: number[] = []
    const fetchImpl = (async () => {
      n += 1
      if (n < 3) throw new TypeError('Load failed')
      return new Response('{"status":"ok"}', { status: 200 })
    }) as typeof fetch
    const r = await postBuoy('44100', async (ms) => void waits.push(ms), fetchImpl)
    expect(r.status).toBe(200)
    expect(n).toBe(3)
    expect(waits).toEqual([...BUOY_RETRY_MS])
  })

  it('an HTTP answer, even an error, is not asked again; three lost tries give up', async () => {
    let n = 0
    const five = (async () => {
      n += 1
      return new Response('', { status: 500 })
    }) as typeof fetch
    expect((await postBuoy('44100', async () => {}, five)).status).toBe(500)
    expect(n).toBe(1)
    const lost = (async () => {
      throw new TypeError('Load failed')
    }) as typeof fetch
    await expect(postBuoy('44100', async () => {}, lost)).rejects.toThrow('Load failed')
  })
})

describe('a refusal given to the phone directly', () => {
  const A = 'https://api.open-meteo.com/v1/forecast?latitude=36.03&longitude=-75.67&hourly=wind_speed_10m'
  const B = 'https://marine-api.open-meteo.com/v1/marine?latitude=36.03&longitude=-75.67&hourly=wave_height'

  it('does not hold back the next request through the cache', async () => {
    setForecastEdge('/api/forecast')
    const asked: string[] = []
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input)
      asked.push(url.startsWith('/api/') ? 'edge' : 'direct')
      /* The cache hiccups on the first (a 502), the phone's own ask is refused for the day. */
      if (url.startsWith('/api/') && url.includes('wind_speed_10m')) return new Response('', { status: 502 })
      if (!url.startsWith('/api/')) return new Response('Daily API request limit exceeded', { status: 429 })
      return new Response('{"hourly":{}}', { status: 200 })
    }) as typeof fetch
    const first = await weatherJson(A, { maxAgeMs: 60_000, fetchImpl })
    expect(first.ok).toBe(false)
    expect(weatherBusy()).toBeNull()
    const second = await weatherJson(B, { maxAgeMs: 60_000, fetchImpl })
    expect(second.ok).toBe(true)
    expect(asked).toEqual(['edge', 'direct', 'edge'])
  })

  it('a refusal the cache passes on (its own address over the limit) still holds every request back', async () => {
    setForecastEdge('/api/forecast')
    const fetchImpl = (async () => new Response('Daily API request limit exceeded', { status: 429 })) as typeof fetch
    const first = await weatherJson(A, { maxAgeMs: 60_000, fetchImpl })
    expect(first.ok).toBe(false)
    expect(weatherBusy()?.why).toBe('daily')
  })
})
