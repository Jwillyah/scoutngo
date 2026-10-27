import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearBuildingsCache } from './buildings.ts'
import { encodeTestTile, square } from './mvtTestTile.ts'
import { clearPlace, loadPlace, placeState, treesQuery } from './place.ts'
import { resetOverpassClient } from './overpassClient.ts'
import { setVectorLoader } from './vectorTiles.ts'

const memory = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }
}
const pier = { lat: 36.8435575, lon: -75.9713104 }
/* A building by the pier, which is at about 1889, 210 in its zoom 14 tile. */
const tile = () => encodeTestTile({ building: [{ rings: [square(1850, 180, 1900, 230)], properties: { render_height: 30 } }] })
const trees = { elements: Array.from({ length: 30 }, (_, i) => ({ type: 'node', id: 100 + i, lat: 36.843 + i * 1e-5, lon: -75.972, tags: { natural: 'tree' } })) }
const answer = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body))) as unknown as typeof fetch
const down = (async () => new Response('', { status: 429 })) as unknown as typeof fetch
const quick = { sleep: async () => undefined, budgetMs: 200 }

describe('the place: buildings from the map tiles, trees from Overpass', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memory())
    resetOverpassClient()
    clearBuildingsCache()
    clearPlace()
  })
  afterEach(() => {
    setVectorLoader(null)
    vi.unstubAllGlobals()
  })

  it('asks Overpass for the trees only', () => {
    const q = treesQuery(pier)
    expect(q).toContain('node["natural"="tree"]')
    expect(q).not.toContain('building')
    expect(q).not.toContain('coastline')
  })

  it('draws the buildings from the tiles, and the trees when Overpass answers', async () => {
    setVectorLoader(async () => tile())
    const fetcher = answer(trees)
    const s = await loadPlace(pier, { fetcher })
    expect(s.status).toBe('ready')
    expect(s.buildings?.list.length).toBeGreaterThan(0)
    expect(s.buildings?.list[0].height.metres).toBe(30)
    expect(s.trees).toMatchObject({ status: 'drawn' })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('is ready, with no pill, when Overpass refuses every time (Private Relay): the trees say so in the legend', async () => {
    setVectorLoader(async () => tile())
    const s = await loadPlace(pier, { fetcher: down, ...quick })
    expect(s.status).toBe('ready')
    expect(s.buildings?.list.length).toBeGreaterThan(0)
    expect(s.trees).toEqual({ status: 'unavailable' })
  })

  it('fails when the tiles cannot be had and nothing is saved, and Retry asks again', async () => {
    setVectorLoader(async () => null)
    const failed = await loadPlace(pier, { fetcher: down, ...quick })
    expect(failed.status).toBe('failed')
    expect(failed.buildings).toBeNull()
    setVectorLoader(async () => tile())
    const again = await loadPlace(pier, { retry: true, fetcher: answer(trees) })
    expect(again.status).toBe('ready')
    expect(placeState().trees).toMatchObject({ status: 'drawn' })
  })

  it('draws the copy kept on the phone, with its age, when the tiles are gone', async () => {
    setVectorLoader(async () => tile())
    await loadPlace(pier, { fetcher: answer(trees) })
    clearPlace()
    clearBuildingsCache()
    setVectorLoader(async () => null)
    const offline = await loadPlace(pier, { fetcher: down, ...quick })
    expect(offline.status).toBe('ready')
    expect(offline.buildings?.savedAt).not.toBeNull()
    expect(offline.trees).toMatchObject({ status: 'drawn' })
  })

  it('asks the map tiles again at once on Retry, though they failed moments ago', async () => {
    let up = false
    setVectorLoader(async () => (up ? tile() : null))
    expect((await loadPlace(pier, { fetcher: down, ...quick })).status).toBe('failed')
    up = true
    const again = await loadPlace(pier, { retry: true, fetcher: answer(trees) })
    expect(again.status).toBe('ready')
    expect(again.buildings?.list.length).toBeGreaterThan(0)
  })
})
