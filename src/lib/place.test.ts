import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearPlace, loadPlace, placeQuery, placeState } from './place.ts'
import { resetOverpassClient } from './overpassClient.ts'
import { seaMask, seaStatus } from './seaMask.ts'

const memory = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }
}
const pier = { lat: 36.8435575, lon: -75.9713104 }
const square = [
  { lat: 36.8436, lon: -75.9714 },
  { lat: 36.8437, lon: -75.9714 },
  { lat: 36.8437, lon: -75.9713 },
  { lat: 36.8436, lon: -75.9714 },
]
const payload = {
  elements: [
    { type: 'way', id: 1, tags: { building: 'yes', height: '30' }, geometry: square },
    { type: 'way', id: 2, tags: { natural: 'coastline' }, geometry: [{ lat: 36.84, lon: -75.97 }, { lat: 36.85, lon: -75.973 }] },
    { type: 'way', id: 3, tags: { natural: 'water' }, geometry: square },
    ...Array.from({ length: 30 }, (_, i) => ({ type: 'node', id: 100 + i, lat: 36.843 + i * 1e-5, lon: -75.972, tags: { natural: 'tree' } })),
  ],
}

describe('the place, in one request', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memory())
    resetOverpassClient()
    clearPlace()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('asks for buildings, coastline, water and trees in one query', () => {
    const q = placeQuery(pier)
    expect(q).toContain('way["building"]')
    expect(q).toContain('way["natural"="coastline"]')
    expect(q).toContain('way["natural"="water"]')
    expect(q).toContain('node["natural"="tree"]')
  })

  it('makes one request for all of it, and shares it when asked twice', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(payload)))
    const a = loadPlace(pier, { fetcher: fetcher as unknown as typeof fetch })
    const b = loadPlace(pier, { fetcher: fetcher as unknown as typeof fetch })
    const [sa] = await Promise.all([a, b])
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(sa.status).toBe('ready')
    expect(sa.buildings?.list).toHaveLength(1)
    expect(sa.trees).toMatchObject({ status: 'drawn' })
    expect(seaStatus()).toBe('ready')
    expect(seaMask()?.coastlines).toHaveLength(1)
  })

  it('says it failed, keeps what the phone saved, and asks again on Retry', async () => {
    await loadPlace(pier, { fetcher: (async () => new Response(JSON.stringify(payload))) as unknown as typeof fetch })
    clearPlace()
    const down = vi.fn(async () => new Response('', { status: 502 }))
    const failed = await loadPlace(pier, { fetcher: down as unknown as typeof fetch, sleep: async () => undefined })
    expect(failed.status).toBe('failed')
    expect(failed.reason).toBe('Overpass returned HTTP 502.')
    expect(failed.buildings?.savedAt).not.toBeNull()
    expect(seaMask()?.coastlines).toHaveLength(1)
    const again = vi.fn(async () => new Response(JSON.stringify(payload)))
    expect((await loadPlace(pier, { retry: true, fetcher: again as unknown as typeof fetch })).status).toBe('ready')
    expect(again).toHaveBeenCalledTimes(1)
    expect(placeState().buildings?.savedAt).toBeNull()
  })

  it('with nothing saved and no answer, the sea mask says it failed (the elevation is still cleaned from its own shape)', async () => {
    const down = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    const s = await loadPlace(pier, { fetcher: down as unknown as typeof fetch })
    expect(s.status).toBe('failed')
    expect(s.buildings).toBeNull()
    expect(seaStatus()).toBe('failed')
  })
})
