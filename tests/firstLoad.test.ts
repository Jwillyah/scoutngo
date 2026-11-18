import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { firstLoadSettled, resetFirstLoad, SETTLE_MAX_MS, SETTLE_MIN_MS, SETTLE_QUIET_MS, whenFirstLoadSettled } from '../src/lib/firstLoad.ts'
import { clearWeatherStore, setForecastEdge, weatherJson, weatherRefreshing } from '../src/lib/weatherStore.ts'

/*
 * AFTER THE FIRST LOAD (Batch SIMPLE-1, Section 4b; src/lib/firstLoad.ts).
 * What the home's first screen does not need (the Best Sky grid, the daily
 * wave-model check) waits until the first load's questions have landed, so
 * it is not in the opening burst that drew the 429.
 */
const URL_A = 'https://api.open-meteo.com/v1/forecast?latitude=36.84&longitude=-75.97&hourly=wind_speed_10m'

beforeEach(async () => {
  await clearWeatherStore()
  setForecastEdge(null)
  resetFirstLoad()
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  vi.setSystemTime(new Date('2026-11-18T18:07:00Z'))
})
afterEach(() => {
  resetFirstLoad()
  vi.useRealTimers()
})

describe('after the first load', () => {
  it('nothing in flight: runs SETTLE_MIN_MS after the first ask to wait, not before', () => {
    const f = vi.fn()
    whenFirstLoadSettled(f)
    vi.advanceTimersByTime(Math.max(SETTLE_MIN_MS, SETTLE_QUIET_MS) - 1)
    expect(f).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(f).toHaveBeenCalledTimes(1)
    expect(firstLoadSettled()).toBe(true)
  })

  it('waits for the first load\'s questions to land, then for the quiet', async () => {
    let release: (r: Response) => void = () => {}
    const slow = vi.fn(() => new Promise<Response>((r) => (release = r)))
    const asked = weatherJson(URL_A, { maxAgeMs: 3_600_000, fetchImpl: slow })
    await vi.waitFor(() => expect(weatherRefreshing()).toBe(1))
    const f = vi.fn()
    whenFirstLoadSettled(f)
    vi.advanceTimersByTime(5_000)
    expect(f).not.toHaveBeenCalled()
    release(new Response('{"hourly":{}}', { status: 200 }))
    await asked
    expect(weatherRefreshing()).toBe(0)
    vi.advanceTimersByTime(SETTLE_QUIET_MS - 1)
    expect(f).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('a network that never goes quiet still gets there at SETTLE_MAX_MS', async () => {
    const never = vi.fn(() => new Promise<Response>(() => {}))
    void weatherJson(URL_A, { maxAgeMs: 3_600_000, fetchImpl: never, timeoutMs: 120_000 })
    await vi.waitFor(() => expect(weatherRefreshing()).toBe(1))
    const f = vi.fn()
    whenFirstLoadSettled(f)
    vi.advanceTimersByTime(SETTLE_MAX_MS - 1)
    expect(f).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('once settled, a later screen runs at once; a cancelled wait never runs', () => {
    const gone = vi.fn()
    const cancel = whenFirstLoadSettled(gone)
    cancel()
    vi.advanceTimersByTime(SETTLE_MAX_MS)
    expect(gone).not.toHaveBeenCalled()
    expect(firstLoadSettled()).toBe(true)
    const later = vi.fn()
    whenFirstLoadSettled(later)
    expect(later).toHaveBeenCalledTimes(1)
  })
})
