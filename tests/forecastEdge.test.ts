import { describe, expect, it } from 'vitest'
import { GET, MAX_POINTS, upstreamFor } from '../api/forecast.ts'
import { setForecastEdge } from '../src/lib/weatherStore.ts'
import { fetchCloudGrid } from '../src/lib/forecast.ts'
import { GRID_CELLS } from '../src/core/cloudGrid.ts'

/*
 * THE FORECAST CACHE (api/forecast.ts, Batch M, Section 1): it passes on only
 * Open-Meteo requests the app makes, only with coordinates already rounded
 * to 2 decimals, keyed by the hour, and logs nothing.
 */
const NOW = new Date('2026-11-08T13:42:00Z')
const at = (q: string) => `https://scoutngo.vercel.app/api/forecast?${q}`

describe('what it passes on', () => {
  it('the request as asked, without om and hr, to the host om names', () => {
    const r = upstreamFor(at('om=api.open-meteo.com/v1/forecast&latitude=36.85&longitude=-75.95&hourly=wind_speed_10m&hr=2026-11-08T13'), NOW)
    expect(r).toEqual({ ok: true, cacheable: true, upstream: 'https://api.open-meteo.com/v1/forecast?latitude=36.85&longitude=-75.95&hourly=wind_speed_10m' })
  })

  it('with a key in its environment, Open-Meteo’s customer host and the key; a key in the request is dropped', () => {
    const r = upstreamFor(at('om=marine-api.open-meteo.com/v1/marine&latitude=36.85&longitude=-75.95&apikey=theirs&hr=2026-11-08T13'), NOW, 'k123')
    expect(r).toEqual({ ok: true, cacheable: true, upstream: 'https://customer-marine-api.open-meteo.com/v1/marine?latitude=36.85&longitude=-75.95&apikey=k123' })
  })

  it('refuses a coordinate finer than 2 decimals: nothing precise is cached or passed on', () => {
    expect(upstreamFor(at('om=api.open-meteo.com/v1/forecast&latitude=36.8435&longitude=-75.97&hr=2026-11-08T13'), NOW)).toMatchObject({ ok: false, status: 400 })
  })

  it('Batch N: only the 0.05° grid is cached; a 2-decimal spot (an older build) is answered, never cached', () => {
    expect(upstreamFor(at('om=api.open-meteo.com/v1/forecast&latitude=36.84&longitude=-75.97&hr=2026-11-08T13'), NOW)).toMatchObject({ ok: true, cacheable: false })
    expect(upstreamFor(at('om=api.open-meteo.com/v1/forecast&latitude=36.80&longitude=-76.00&hr=2026-11-08T13'), NOW)).toMatchObject({ ok: true, cacheable: true })
  })

  it('a phone whose clock is off gets its answer, uncached: no stray hour becomes a cache entry', () => {
    expect(upstreamFor(at('om=api.open-meteo.com/v1/forecast&latitude=36.84&longitude=-75.97&hr=2026-11-07T13'), NOW)).toMatchObject({ ok: true, cacheable: false })
    expect(upstreamFor(at('om=api.open-meteo.com/v1/forecast&latitude=36.84&longitude=-75.97'), NOW)).toMatchObject({ ok: true, cacheable: false })
  })

  it('refuses any other host or path, and more than MAX_POINTS points', () => {
    expect(upstreamFor(at('om=example.com/x&latitude=1&longitude=1&hr=2026-11-08T13'), NOW)).toMatchObject({ ok: false })
    const many = Array.from({ length: MAX_POINTS + 1 }, () => '36.84').join(',')
    expect(upstreamFor(at(`om=api.open-meteo.com/v1/forecast&latitude=${many}&longitude=${many}&hr=2026-11-08T13`), NOW)).toMatchObject({ ok: false })
  })
})

describe('what it answers', () => {
  it('a good answer is kept at the CDN for the hour; a refusal is passed on uncached', async () => {
    const real = globalThis.fetch
    const hr = new Date().toISOString().slice(0, 13)
    try {
      globalThis.fetch = (async () => new Response('{"hourly":{}}', { status: 200 })) as typeof fetch
      const good = await GET(new Request(at(`om=api.open-meteo.com/v1/forecast&latitude=36.85&longitude=-75.95&hr=${hr}`)))
      expect(good.status).toBe(200)
      expect(good.headers.get('vercel-cdn-cache-control')).toBe('max-age=3600, stale-while-revalidate=600')
      globalThis.fetch = (async () => new Response('{"reason":"Minutely API request limit exceeded"}', { status: 429 })) as typeof fetch
      const refused = await GET(new Request(at(`om=api.open-meteo.com/v1/forecast&latitude=36.84&longitude=-75.97&hr=${hr}`)))
      expect(refused.status).toBe(429)
      expect(refused.headers.get('cache-control')).toBe('no-store')
      expect(refused.headers.get('vercel-cdn-cache-control')).toBeNull()
    } finally {
      globalThis.fetch = real
    }
  })

  it('logs nothing', async () => {
    const src = await import('node:fs').then((fs) => fs.readFileSync('api/forecast.ts', 'utf8'))
    expect(src).not.toMatch(/console\.|waitUntil|kv|blob|database/i)
  })
})

describe('every multi-point request the app makes fits', () => {
  /*
   * 8 Nov: the Wind map layer drew nothing. Its grid is 25 points (5 by 5) and
   * this function refused anything over 16, so the phone got a 400 and an
   * empty grid. The grid's own request, built by the app, goes through here.
   */
  it('the wind and cloud map grid, as fetchCloudGrid asks for it', async () => {
    setForecastEdge('/api/forecast')
    try {
      const asked: string[] = []
      const fake = (async (input: RequestInfo | URL) => {
        asked.push(String(input))
        const time = Array.from({ length: 24 }, (_, h) => `2026-11-08T${String(h).padStart(2, '0')}:00`)
        const one = { hourly: { time, cloud_cover_low: time.map(() => 10), cloud_cover_mid: time.map(() => 0), cloud_cover_high: time.map(() => 0) } }
        return new Response(JSON.stringify(Array.from({ length: GRID_CELLS ** 2 }, () => one)), { status: 200, headers: { 'content-type': 'application/json' } })
      }) as typeof fetch
      const now = new Date()
      const got = await fetchCloudGrid({ lat: 36.8435575, lon: -75.9713104 }, now, 'America/New_York', fake)
      expect(asked).toHaveLength(1)
      expect(asked[0]).toMatch(/^\/api\/forecast\?/)
      expect(upstreamFor(`https://scoutngo.vercel.app${asked[0]}`, now)).toMatchObject({ ok: true })
      expect(got.status).toBe('ok')
      expect(GRID_CELLS ** 2).toBeLessThanOrEqual(MAX_POINTS)
    } finally {
      setForecastEdge(null)
    }
  })
})
