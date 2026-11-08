import { describe, expect, it } from 'vitest'
import { GET, MAX_POINTS, upstreamFor } from '../api/forecast.ts'

/*
 * THE FORECAST CACHE (api/forecast.ts, Batch M, Section 1): it passes on only
 * Open-Meteo requests the app makes, only with coordinates already rounded
 * to 2 decimals, keyed by the hour, and logs nothing.
 */
const NOW = new Date('2026-11-08T13:42:00Z')
const at = (q: string) => `https://scoutngo.vercel.app/api/forecast?${q}`

describe('what it passes on', () => {
  it('the request as asked, without om and hr, to the host om names', () => {
    const r = upstreamFor(at('om=api.open-meteo.com/v1/forecast&latitude=36.84&longitude=-75.97&hourly=wind_speed_10m&hr=2026-11-08T13'), NOW)
    expect(r).toEqual({ ok: true, cacheable: true, upstream: 'https://api.open-meteo.com/v1/forecast?latitude=36.84&longitude=-75.97&hourly=wind_speed_10m' })
  })

  it('with a key in its environment, Open-Meteo’s customer host and the key; a key in the request is dropped', () => {
    const r = upstreamFor(at('om=marine-api.open-meteo.com/v1/marine&latitude=36.84&longitude=-75.97&apikey=theirs&hr=2026-11-08T13'), NOW, 'k123')
    expect(r).toEqual({ ok: true, cacheable: true, upstream: 'https://customer-marine-api.open-meteo.com/v1/marine?latitude=36.84&longitude=-75.97&apikey=k123' })
  })

  it('refuses a coordinate finer than 2 decimals: nothing precise is cached or passed on', () => {
    expect(upstreamFor(at('om=api.open-meteo.com/v1/forecast&latitude=36.8435&longitude=-75.97&hr=2026-11-08T13'), NOW)).toMatchObject({ ok: false, status: 400 })
  })

  it('a phone whose clock is off gets its answer, uncached: no stray hour becomes a cache entry', () => {
    expect(upstreamFor(at('om=api.open-meteo.com/v1/forecast&latitude=36.84&longitude=-75.97&hr=2026-11-07T13'), NOW)).toMatchObject({ ok: true, cacheable: false })
    expect(upstreamFor(at('om=api.open-meteo.com/v1/forecast&latitude=36.84&longitude=-75.97'), NOW)).toMatchObject({ ok: true, cacheable: false })
  })

  it('refuses any other host or path, and more than 16 points', () => {
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
      const good = await GET(new Request(at(`om=api.open-meteo.com/v1/forecast&latitude=36.84&longitude=-75.97&hr=${hr}`)))
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
