import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { backoffMs, busyWords, clearWeatherStore, DAILY_BACKOFF_MS, FIRST_BACKOFF_MS, MAX_BACKOFF_MS, weatherBusy, weatherJson, weatherKey, weatherSent } from '../src/lib/weatherStore.ts'

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
