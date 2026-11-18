import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { backoffMs, busyWords, clearWeatherStore, DAILY_BACKOFF_MS, DIRECT_HOLD_MS, directHeld, edgeUrl, FIRST_BACKOFF_MS, jittered, MAX_BACKOFF_MS, MIN_REUSE_MS, setBackoffRandom, setForecastEdge, weatherBusy, weatherEpoch, weatherJson, weatherKey, weatherRefreshing, weatherSent } from '../src/lib/weatherStore.ts'

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
  /* Batch SIMPLE-1, Section 4b: the first back-off is a minute (it was two). */
  it('backs off 1, 2, 4, 8, 16 then 30 min, and an hour for the daily limit', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((n) => backoffMs(n, false) / 60_000)).toEqual([1, 2, 4, 8, 16, 30, 30])
    expect(backoffMs(1, true)).toBe(DAILY_BACKOFF_MS)
    expect(FIRST_BACKOFF_MS).toBe(60_000)
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
    expect(busyWords(busy!)).toBe('Weather service busy, retrying in 1 min')
    /* Half a minute later, from any screen: nothing is sent. */
    vi.setSystemTime(Date.now() + 30_000)
    const during = await weatherJson(URL_A, { maxAgeMs: HOUR, fetchImpl: f })
    expect(during).toMatchObject({ ok: false, reason: 'Weather service busy, retrying in 1 min' })
    expect(f).toHaveBeenCalledTimes(1)
    /* Past the minute: asked again, refused again, now two. */
    vi.setSystemTime(Date.now() + 31_000)
    await weatherJson(URL_A, { maxAgeMs: HOUR, fetchImpl: f })
    expect(f).toHaveBeenCalledTimes(2)
    expect(Math.round(((weatherBusy()?.until ?? 0) - Date.now()) / 60_000)).toBe(2)
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

  /* Batch DRONE, Section 0.5: Open-Meteo from the phone first; the cache only when it refuses this phone or cannot be reached. */
  it('asks Open-Meteo from the phone first; the cache is not asked when that answers', async () => {
    expect(edgeUrl('https://marine-api.open-meteo.com/v1/marine?latitude=36.84&longitude=-75.97&hourly=wave_height', new Date('2026-11-08T13:42:00Z'), '/api/forecast')).toBe(
      '/api/forecast?om=marine-api.open-meteo.com/v1/marine&latitude=36.85&longitude=-75.95&hourly=wave_height&hr=2026-11-08T13',
    )
    setForecastEdge('http://127.0.0.1/api/forecast')
    const f = ok()
    await weatherJson('https://api.open-meteo.com/v1/forecast?latitude=36.84356&longitude=-75.97131&hourly=wind_speed_10m', { maxAgeMs: HOUR, fetchImpl: f })
    expect(f).toHaveBeenCalledTimes(1)
    expect(String((f.mock.calls[0] as unknown[])[0])).toMatch(/^https:\/\/api\.open-meteo\.com\/v1\/forecast\?latitude=36\.84&longitude=-75\.97/)
  })

  it('a 429 given to the phone goes through the cache, on its coarser grid', async () => {
    setForecastEdge('http://127.0.0.1/api/forecast')
    const f = vi.fn(async (u: string) => (u.includes('/api/forecast') ? new Response(JSON.stringify(PAYLOAD), { status: 200 }) : new Response('{"reason":"Minutely API request limit exceeded"}', { status: 429 })))
    const r = await weatherJson('https://api.open-meteo.com/v1/forecast?latitude=36.84356&longitude=-75.97131&hourly=wind_speed_10m', { maxAgeMs: HOUR, fetchImpl: f as unknown as typeof fetch })
    expect(r.ok).toBe(true)
    const asked = f.mock.calls.map((c) => String(c[0]))
    expect(asked[0]).toMatch(/^https:\/\/api\.open-meteo\.com/)
    expect(asked[1]).toContain('/api/forecast?om=api.open-meteo.com/v1/forecast&latitude=36.85&longitude=-75.95')
    expect(asked[1]).not.toMatch(/36\.84|75\.97/)
  })

  it('no network to Open-Meteo: the cache answers', async () => {
    setForecastEdge('http://127.0.0.1/api/forecast')
    const f = vi.fn(async (u: string) => {
      if (u.includes('/api/forecast')) return new Response(JSON.stringify(PAYLOAD), { status: 200 })
      throw new TypeError('Load failed')
    })
    expect((await weatherJson(URL_A, { maxAgeMs: HOUR, fetchImpl: f as unknown as typeof fetch })).ok).toBe(true)
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('our function missing (a dev server, 404) is not asked again this session; its 400 or 502 is no answer', async () => {
    setForecastEdge('http://127.0.0.1/api/forecast')
    const refusedHere = (edgeStatus: number) => vi.fn(async (u: string) => (u.includes('/api/forecast') ? new Response('', { status: edgeStatus }) : new Response('{"reason":"Minutely API request limit exceeded"}', { status: 429 })))
    const bad = refusedHere(502)
    await weatherJson(URL_A, { maxAgeMs: HOUR, fetchImpl: bad as unknown as typeof fetch })
    expect(bad).toHaveBeenCalledTimes(2)
    /* A refusal given to the phone does not hold the cache back (tests/networkPath.test.ts). */
    expect(weatherBusy()).toBeNull()
    await clearWeatherStore()
    setForecastEdge('http://127.0.0.1/api/forecast')
    const missing = refusedHere(404)
    await weatherJson(URL_A, { maxAgeMs: HOUR, fetchImpl: missing as unknown as typeof fetch })
    /* With no cache, the refusal holds requests back; let it go. The cache's 404 is remembered for the session. */
    await clearWeatherStore()
    await weatherJson(URL_A.replace('wind_speed_10m', 'cloud_cover'), { maxAgeMs: HOUR, fetchImpl: missing as unknown as typeof fetch })
    expect(missing.mock.calls.map((c) => String(c[0]).includes('/api/forecast'))).toEqual([false, true, false])
  })
})

/*
 * Batch SIMPLE-1, Section 4b (18 Nov, 1:07 PM: api.open-meteo.com 429 among
 * ~15 calls in a minute). One question in flight is one request, an answer
 * is kept ten minutes at the least, and a refusal holds the phone's own asks
 * for a minute while the kept answer, with its age, stands in.
 */
describe('Section 4b: dedupe, ten minutes, a minute after a 429', () => {
  it('an answer is reused for ten minutes even by a caller that wants a fresher one', async () => {
    expect(MIN_REUSE_MS).toBe(10 * 60_000)
    const f = ok()
    await weatherJson(URL_A, { maxAgeMs: 60_000, fetchImpl: f })
    vi.setSystemTime(Date.now() + 9 * 60_000)
    expect(await weatherJson(URL_A, { maxAgeMs: 60_000, fetchImpl: f })).toMatchObject({ ok: true, stale: false, kept: true })
    expect(f).toHaveBeenCalledTimes(1)
    vi.setSystemTime(Date.now() + 2 * 60_000)
    await weatherJson(URL_A, { maxAgeMs: 60_000, fetchImpl: f })
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('five screens asking the same question at once send one request', async () => {
    const f = ok()
    const all = await Promise.all(Array.from({ length: 5 }, () => weatherJson(URL_A, { maxAgeMs: HOUR, fetchImpl: f })))
    expect(f).toHaveBeenCalledTimes(1)
    expect(all.every((a) => a.ok)).toBe(true)
  })

  it('a 429 to the phone holds its direct asks for 60 s: the cache only, then Open-Meteo again', async () => {
    expect(DIRECT_HOLD_MS).toBe(60_000)
    setForecastEdge('http://127.0.0.1/api/forecast')
    const asked: string[] = []
    const f = vi.fn(async (u: string) => {
      const edge = u.includes('/api/forecast')
      asked.push(edge ? 'edge' : 'direct')
      return edge ? new Response(JSON.stringify(PAYLOAD), { status: 200 }) : new Response('{"reason":"Minutely API request limit exceeded"}', { status: 429 })
    })
    const fetchImpl = f as unknown as typeof fetch
    expect((await weatherJson(URL_A, { maxAgeMs: HOUR, fetchImpl })).ok).toBe(true)
    expect(directHeld()).toBe(true)
    /* Two more questions inside the minute: nothing to Open-Meteo itself. */
    await weatherJson(URL_A.replace('wind_speed_10m', 'cloud_cover'), { maxAgeMs: HOUR, fetchImpl })
    vi.setSystemTime(Date.now() + 59_000)
    await weatherJson(URL_A.replace('wind_speed_10m', 'wind_gusts_10m'), { maxAgeMs: HOUR, fetchImpl })
    expect(asked).toEqual(['direct', 'edge', 'edge', 'edge'])
    /* Past the minute, the phone asks Open-Meteo first again. */
    vi.setSystemTime(Date.now() + 2_000)
    expect(directHeld()).toBe(false)
    await weatherJson(URL_A.replace('wind_speed_10m', 'temperature_2m'), { maxAgeMs: HOUR, fetchImpl })
    expect(asked.slice(4)).toEqual(['direct', 'edge'])
  })

  it('held with no cache answer: the kept answer and the time it arrived, never a made-up one; with none kept, no value', async () => {
    await weatherJson(URL_A, { maxAgeMs: HOUR, fetchImpl: ok() })
    const kept = Date.now()
    vi.setSystemTime(kept + 2 * HOUR)
    setForecastEdge('http://127.0.0.1/api/forecast')
    /* Open-Meteo refuses the phone and the cache fails too (a 502). */
    const f = vi.fn(async (u: string) => (u.includes('/api/forecast') ? new Response('', { status: 502 }) : new Response('{"reason":"Minutely API request limit exceeded"}', { status: 429 })))
    const fetchImpl = f as unknown as typeof fetch
    const first = await weatherJson(URL_A, { maxAgeMs: HOUR, fetchImpl })
    /* The kept answer is given at once, marked as refreshing; the refusal lands behind it. */
    expect(first).toMatchObject({ ok: true, stale: true, kept: true, fetchedAt: kept, payload: PAYLOAD })
    await vi.waitFor(() => expect(weatherRefreshing()).toBe(0))
    expect(directHeld()).toBe(true)
    const calls = f.mock.calls.length
    const again = await weatherJson(URL_A, { maxAgeMs: HOUR, fetchImpl })
    await vi.waitFor(() => expect(f.mock.calls.length).toBe(calls + 1))
    expect(again).toMatchObject({ ok: true, stale: true, fetchedAt: kept, payload: PAYLOAD })
    /* The one call made while held went to the cache, not to Open-Meteo. */
    expect(String((f.mock.calls[calls] as unknown[])[0])).toContain('/api/forecast')
    const none = await weatherJson(URL_A.replace('wind_speed_10m', 'cloud_cover'), { maxAgeMs: HOUR, fetchImpl })
    expect(none).toMatchObject({ ok: false, unreachable: false })
    expect('payload' in none).toBe(false)
  })

  it('the hold ending tells the screens to ask again', async () => {
    setForecastEdge('http://127.0.0.1/api/forecast')
    const f = vi.fn(async (u: string) => (u.includes('/api/forecast') ? new Response('', { status: 502 }) : new Response('{}', { status: 429 })))
    await weatherJson(URL_A, { maxAgeMs: HOUR, fetchImpl: f as unknown as typeof fetch })
    const before = weatherEpoch()
    vi.advanceTimersByTime(DIRECT_HOLD_MS)
    expect(weatherEpoch()).toBe(before + 1)
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
