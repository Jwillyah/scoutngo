import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearBuildingsCache, fetchBuildings } from './buildings.ts'

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, String(v)),
  }
}

const bounds = { west: -75.61, south: 38.36, east: -75.6, north: 38.37 }
const payload = {
  elements: [
    {
      type: 'way',
      id: 7,
      tags: { building: 'yes', height: '9' },
      geometry: [
        { lat: 38.364, lon: -75.606 },
        { lat: 38.364, lon: -75.6055 },
        { lat: 38.3645, lon: -75.6055 },
        { lat: 38.364, lon: -75.606 },
      ],
    },
  ],
}

/* BUILDINGS WITH NO SIGNAL: a place loaded once still has its footprints, and says when they are from. */
describe('buildings kept on the phone', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage())
    clearBuildingsCache()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('reads the kept copy, with its age, when Overpass cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })))
    const live = await fetchBuildings(bounds)
    expect(live.status === 'ok' && live.buildings.length).toBe(1)

    clearBuildingsCache()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    const offline = await fetchBuildings(bounds)
    expect(offline.status).toBe('ok')
    if (offline.status !== 'ok') return
    expect(offline.buildings).toHaveLength(1)
    expect(typeof offline.savedAt).toBe('string')
  })

  it('reads the kept copy when Overpass answers but with an error (502 when it is overloaded)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })))
    await fetchBuildings(bounds)
    clearBuildingsCache()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Bad Gateway', { status: 502 })))
    const busy = await fetchBuildings(bounds)
    expect(busy.status).toBe('ok')
    if (busy.status !== 'ok') return
    expect(typeof busy.savedAt).toBe('string')
  })

  it('with nothing kept, still says why rather than an empty map', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    const out = await fetchBuildings(bounds)
    expect(out.status).toBe('unavailable')
  })
})
