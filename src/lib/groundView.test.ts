import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearGroundViewCache,
  fetchGroundView,
  groundViewCacheSize,
  groundViewUrl,
} from './groundView.ts'

const AT = { lat: 38.364236, lon: -75.605912 }

const reply = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })

afterEach(() => {
  clearGroundViewCache()
  vi.unstubAllGlobals()
})

describe('groundViewUrl', () => {
  it('pins the precision, which is what makes it a usable cache key', () => {
    const url = groundViewUrl(AT, 87.32, 5.14)
    expect(url).toContain('lat=38.364236')
    expect(url).toContain('lon=-75.605912')
    expect(url).toContain('heading=87.3')
    expect(url).toContain('fov=5.1')
  })
})

/*
 * ONE REQUEST PER DISTINCT VIEW. Reopening a card is a second billed image
 * request and a second disclosure of the same coordinate, for a picture the
 * session already has.
 */
describe('the session cache', () => {
  it('asks once for the same position, however many times the card opens', async () => {
    const fetchMock = vi.fn(async () => reply({ status: 'ok', image: 'data:x', date: '2019-08' }))
    vi.stubGlobal('fetch', fetchMock)

    const first = await fetchGroundView(AT, 87.3, 5.1)
    const second = await fetchGroundView(AT, 87.3, 5.1)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(first).toEqual(second)
    expect(first).toMatchObject({ status: 'ok', date: '2019-08' })
  })

  it('shares one request between two cards opening at once', async () => {
    const fetchMock = vi.fn(async () => reply({ status: 'ok', image: 'data:x' }))
    vi.stubGlobal('fetch', fetchMock)

    await Promise.all([fetchGroundView(AT, 87.3, 5.1), fetchGroundView(AT, 87.3, 5.1)])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  /* A MOVED POSITION IS A NEW KEY: it is a different photograph. */
  it('asks again when the position moves', async () => {
    const fetchMock = vi.fn(async () => reply({ status: 'ok', image: 'data:x' }))
    vi.stubGlobal('fetch', fetchMock)

    await fetchGroundView(AT, 87.3, 5.1)
    await fetchGroundView({ lat: AT.lat + 0.00002, lon: AT.lon }, 87.3, 5.1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('asks again when the camera is re-aimed or the lens changes', async () => {
    const fetchMock = vi.fn(async () => reply({ status: 'ok', image: 'data:x' }))
    vi.stubGlobal('fetch', fetchMock)

    await fetchGroundView(AT, 87.3, 5.1)
    await fetchGroundView(AT, 91.0, 5.1)
    await fetchGroundView(AT, 87.3, 24.0)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  /* Settled facts about this request. Worth keeping. */
  it('keeps no-coverage and no-key, which will not change this session', async () => {
    const fetchMock = vi.fn(async () => reply({ status: 'no-coverage', message: 'none here' }))
    vi.stubGlobal('fetch', fetchMock)

    await fetchGroundView(AT, 87.3, 5.1)
    const again = await fetchGroundView(AT, 87.3, 5.1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(again.status).toBe('no-coverage')
  })

  /*
   * A TRANSIENT FAILURE IS NOT AN ANSWER. Caching it would stick for the rest
   * of the session and the card would never recover from one bad moment.
   */
  it('does not cache an error, so a retry is possible', async () => {
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(reply({ status: 'ok', image: 'data:x' }))
    vi.stubGlobal('fetch', fetchMock)

    const failed = await fetchGroundView(AT, 87.3, 5.1)
    expect(failed.status).toBe('error')
    expect(groundViewCacheSize()).toBe(0)

    const recovered = await fetchGroundView(AT, 87.3, 5.1)
    expect(recovered.status).toBe('ok')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('stays bounded, because the images are tens of kilobytes each', async () => {
    vi.stubGlobal('fetch', async () => reply({ status: 'ok', image: 'data:x' }))
    for (let i = 0; i < 60; i++) {
      await fetchGroundView({ lat: 38 + i / 100_000, lon: -75.6 }, 0, 60)
    }
    expect(groundViewCacheSize()).toBeLessThanOrEqual(40)
  })
})
