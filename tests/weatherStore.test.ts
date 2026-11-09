import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { backoffMs, busyWords, clearWeatherStore, DAILY_BACKOFF_MS, edgeUrl, FIRST_BACKOFF_MS, jittered, MAX_BACKOFF_MS, setBackoffRandom, setForecastEdge, weatherBusy, weatherEpoch, weatherJson, weatherKey, weatherSent } from '../src/lib/weatherStore.ts'

/*
 * THE SHARED WEATHER STORE (src/lib/weatherStore.ts): one request per
 * question, the last answer kept, and quiet after a 429. From the field test
 * at Virginia Beach on 30 Oct, where Wind and Cloud said "no data".
 */
const URL_A = 'https://api.open-meteo.com/v1/forecast?latitude=36.84&longitude=-75.97&hourly=wind_speed_10m&start_date=2026-10-30&end_date=2026-10-30'
const URL_A_REORDERED = 'https://api.open-meteo.com/v1/forecast?hourly=wind_speed_10m&longitude=-75.97&latitude=36.84&end_date=2026-10-30&start_date=2026-10-30'
const PAYLOAD = { hourly: { time: ['2026-10-30T07:00'], wind_speed_10m: [11] } }
const ok = () => vi.fn(async () => new Response(JSON.stringify(PAYLOAD), { status: 200 }))
const limited = (body = '{"reason":"Too many concurrent requests","error":true}') => vi.fn(async () => new Response(body, { status: 429 }))
const HOUR = 3_600_000

beforeEach(async () => {
  await clearWeatherStore()
  setBackoffRandom(() => 0.5)
  setForecastEdge(null)
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  vi.setSystemTime(new Date('2026-10-30T11:30:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
})

describe('one question, one request', () => {
  it('the same request in another parameter order is the same key', () => {
    expect(weatherKey(URL_A)).toBe(weatherKey(URL_A_REORDERED))
  })

  it('two screens asking at once send one request', async () => {
    const f = ok()
    const [a, b] = await Promise.all([weatherJson(URL_A, { maxAgeMs: HOUR, fetchImpl: f }), weatherJson(URL_A_REORDERED, { maxAgeMs: HOUR, fetchImpl: f })])
    expect(f).toHaveBeenCalledTimes(1)
    expect(a.ok && b.ok).toBe(true)
  })

  it('an answer younger than the caller wants is reused; an older one is asked for again', async () => {
    const f = ok()
    await weatherJson(URL_A, { maxAgeMs: HOUR, fetchImpl: f })
    vi.setSystemTime(Date.now() + 59 * 60_000)
    await weatherJson(URL_A, { maxAgeMs: HOUR, fetchImpl: f })
    expect(f).toHaveBeenCalledTimes(1)
    vi.setSystemTime(Date.now() + 2 * 60_000)
    await weatherJson(URL_A, { maxAgeMs: HOUR, fetchImpl: f })
    expect(f).toHaveBeenCalledTimes(2)
  })
})

describe('a 429', () => {
  it('backs off 2, 4, 8, 16 then 30 min, and an hour for the daily limit', () => {
    expect([1, 2, 3, 4, 5, 6].map((n) => backoffMs(n, false) / 60_000)).toEqual([2, 4, 8, 16, 30, 30])
    expect(backoffMs(1, true)).toBe(DAILY_BACKOFF_MS)
    expect(FIRST_BACKOFF_MS).toBe(2 * 60_000)
    expect(MAX_BACKOFF_MS).toBe(30 * 60_000)
  })

  it('serves the last good answer, stale, with the time it arrived', async () => {
    await weatherJson(URL_A, { maxAgeMs: HOUR, fetchImpl: ok() })
    const kept = Date.now()
    vi.setSystemTime(kept + 9 * HOUR)
    const r = await weatherJson(URL_A, { maxAgeMs: HOUR, fetchImpl: limited() })
    expect(r).toMatchObject({ ok: true, stale: true, kept: true, fetchedAt: kept, payload: PAYLOAD })
  })

  it('sends nothing more until the back-off is over, then asks again', async () => {
    const f = limited()
    const first = await weatherJson(URL_A, { maxAgeMs: HOUR, fetchImpl: f })
    expect(first).toMatchObject({ ok: false, unreachable: false })
    expect(f).toHaveBeenCalledTimes(1)
    const busy = weatherBusy()
    expect(busy?.why).toBe('busy')
    expect(busyWords(busy!)).toBe('Weather service busy, retrying in 2 min')
    /* A minute later, from any screen: nothing is sent. */
    vi.setSystemTime(Date.now() + 60_000)
    const during = await weatherJson(URL_A, { maxAgeMs: HOUR, fetchImpl: f })
    expect(during).toMatchObject({ ok: false, reason: 'Weather service busy, retrying in 1 min' })
    expect(f).toHaveBeenCalledTimes(1)
    /* Past the two minutes: asked again, refused again, now four. */
    vi.setSystemTime(Date.now() + 61_000)
    await weatherJson(URL_A, { maxAgeMs: HOUR, fetchImpl: f })
    expect(f).toHaveBeenCalledTimes(2)
    expect(Math.round(((weatherBusy()?.until ?? 0) - Date.now()) / 60_000)).toBe(4)
  })

  it('reads the daily limit from the body and says so', async () => {
    await weatherJson(URL_A, { maxAgeMs: HOUR, fetchImpl: limited('{"reason":"Daily API request limit exceeded. Please try again tomorrow.","error":true}') })
    const b = weatherBusy()
    expect(b?.why).toBe('daily')
    expect(busyWords(b!)).toBe('Weather daily limit reached, retrying in 60 min')
  })

  it('an answer clears the back-off', async () => {
    await weatherJson(URL_A, { maxAgeMs: HOUR, fetchImpl: limited() })
    vi.setSystemTime(Date.now() + 3 * 60_000)
    const r = await weatherJson(URL_A, { maxAgeMs: HOUR, fetchImpl: ok() })
    expect(r.ok).toBe(true)
    expect(weatherBusy()).toBeNull()
    expect(weatherSent().map((s) => s.status)).toEqual([429, 200])
  })
})

describe('no answer at all', () => {
  it('offline with nothing kept says so in words, never a bare "no data"', async () => {
    const r = await weatherJson(URL_A, { maxAgeMs: HOUR, fetchImpl: vi.fn(async () => Promise.reject(new TypeError('Load failed'))) })
    expect(r).toEqual({ ok: false, unreachable: true, reason: 'Could not reach the weather service.' })
    expect(weatherBusy()).toBeNull()
  })
})

describe('Batch M: on a phone network', () => {
  it('a kept answer older than wanted is shown at once, marked refreshing, and the new one lands behind it', async () => {
    await weatherJson(URL_A, { maxAgeMs: HOUR, fetchImpl: ok() })
    const kept = Date.now()
    vi.setSystemTime(kept + 2 * HOUR)
    let release: (r: Response) => void = () => {}
    const slow = vi.fn(() => new Promise<Response>((r) => (release = r)))
    const before = weatherEpoch()
    const r = await weatherJson(URL_A, { maxAgeMs: HOUR, fetchImpl: slow })
    expect(r).toMatchObject({ ok: true, stale: true, kept: true, refreshing: true, fetchedAt: kept })
    expect(slow).toHaveBeenCalledTimes(1)
    release(new Response(JSON.stringify(PAYLOAD), { status: 200 }))
    await vi.waitFor(() => expect(weatherEpoch()).toBe(before + 1))
    const again = await weatherJson(URL_A, { maxAgeMs: HOUR, fetchImpl: slow })
    expect(again).toMatchObject({ ok: true, stale: false })
    expect(slow).toHaveBeenCalledTimes(1)
  })

  it('a 429 back-off is jittered 0.8 to 1.2 times, so phones behind one address do not ask again on the same second', () => {
    expect(jittered(120_000, 0)).toBe(96_000)
    expect(jittered(120_000, 0.5)).toBe(120_000)
    expect(jittered(120_000, 1)).toBe(144_000)
  })

  it('goes through the forecast cache: host and path in om, the UTC hour in hr, coordinates as rounded', async () => {
    expect(edgeUrl('https://marine-api.open-meteo.com/v1/marine?latitude=36.84&longitude=-75.97&hourly=wave_height', new Date('2026-11-08T13:42:00Z'), '/api/forecast')).toBe(
      '/api/forecast?om=marine-api.open-meteo.com/v1/marine&latitude=36.85&longitude=-75.95&hourly=wave_height&hr=2026-11-08T13',
    )
    setForecastEdge('http://127.0.0.1/api/forecast')
    const f = ok()
    await weatherJson('https://api.open-meteo.com/v1/forecast?latitude=36.84356&longitude=-75.97131&hourly=wind_speed_10m', { maxAgeMs: HOUR, fetchImpl: f })
    const asked = String((f.mock.calls[0] as unknown[])[0])
    expect(asked).toContain('/api/forecast?om=api.open-meteo.com/v1/forecast&latitude=36.85&longitude=-75.95')
    expect(asked).not.toMatch(/36\.84|75\.97/)
  })

  it('our function missing (a dev server, 404) asks Open-Meteo directly, and stops trying the cache', async () => {
    setForecastEdge('http://127.0.0.1/api/forecast')
    const f = vi.fn(async (u: string) => (u.includes('/api/forecast') ? new Response('', { status: 404 }) : new Response(JSON.stringify(PAYLOAD), { status: 200 })))
    const r = await weatherJson(URL_A, { maxAgeMs: HOUR, fetchImpl: f as unknown as typeof fetch })
    expect(r.ok).toBe(true)
    await weatherJson(URL_A.replace('wind_speed_10m', 'cloud_cover'), { maxAgeMs: HOUR, fetchImpl: f as unknown as typeof fetch })
    expect(f.mock.calls.map((c) => String(c[0]).includes('/api/forecast'))).toEqual([true, false, false])
  })

  it('a request the cache refuses (400: too many points) is asked directly', async () => {
    setForecastEdge('http://127.0.0.1/api/forecast')
    const f = vi.fn(async (u: string) => (u.includes('/api/forecast') ? new Response('{"error":true}', { status: 400 }) : new Response(JSON.stringify(PAYLOAD), { status: 200 })))
    expect((await weatherJson(URL_A, { maxAgeMs: HOUR, fetchImpl: f as unknown as typeof fetch })).ok).toBe(true)
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('our function failing (502) asks that one directly; a 429 from it is a 429', async () => {
    setForecastEdge('http://127.0.0.1/api/forecast')
    const bad = vi.fn(async (u: string) => (u.includes('/api/forecast') ? new Response('', { status: 502 }) : new Response(JSON.stringify(PAYLOAD), { status: 200 })))
    expect((await weatherJson(URL_A, { maxAgeMs: HOUR, fetchImpl: bad as unknown as typeof fetch })).ok).toBe(true)
    expect(bad).toHaveBeenCalledTimes(2)
    const refused = vi.fn(async () => new Response('{"reason":"Minutely API request limit exceeded"}', { status: 429 }))
    await weatherJson(URL_A.replace('wind_speed_10m', 'gusts'), { maxAgeMs: HOUR, fetchImpl: refused })
    expect(refused).toHaveBeenCalledTimes(1)
    expect(weatherBusy()?.why).toBe('busy')
  })
})

describe('the refreshing line', () => {
  it('"Updated 7:52 · refreshing" only while a new answer is on its way behind a kept one', async () => {
    const { refreshLine } = await import('../src/lib/useWeatherStatus.ts')
    const clock = () => '7:52'
    expect(refreshLine(Date.now(), true, clock)).toBe('Updated 7:52 · refreshing')
    expect(refreshLine(Date.now(), false, clock)).toBeNull()
    expect(refreshLine(null, true, clock)).toBeNull()
  })
})
