import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearBuildingsCache, fetchBuildings } from './buildings.ts'
import { encodeTestTile, square } from './mvtTestTile.ts'
import { setVectorLoader } from './vectorTiles.ts'

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
/* The bounds' middle is at about 542, 2643 in its zoom 14 tile (4751, 6298). */
const tile = () => encodeTestTile({ building: [{ rings: [square(500, 2600, 600, 2700)], properties: { render_height: 9 } }] })

/* BUILDINGS WITH NO SIGNAL: a place loaded once still has its footprints, and says when they are from. */
describe('buildings kept on the phone', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage())
    clearBuildingsCache()
  })
  afterEach(() => {
    setVectorLoader(null)
    vi.unstubAllGlobals()
  })

  it('reads the kept copy, with its age, when the map tiles cannot be had', async () => {
    setVectorLoader(async () => tile())
    const live = await fetchBuildings(bounds)
    expect(live.status === 'ok' && live.buildings.length).toBeGreaterThan(0)

    clearBuildingsCache()
    setVectorLoader(async () => null)
    const offline = await fetchBuildings(bounds)
    expect(offline.status).toBe('ok')
    if (offline.status !== 'ok') return
    expect(offline.buildings.length).toBeGreaterThan(0)
    expect(typeof offline.savedAt).toBe('string')
  })

  it('with nothing kept, still says why rather than an empty map', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    const out = await fetchBuildings(bounds)
    expect(out.status).toBe('unavailable')
  })
})
