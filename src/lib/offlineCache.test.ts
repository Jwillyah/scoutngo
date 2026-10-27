import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  areaLabel,
  areaUrls,
  AUTO_CACHE_CEILING_BYTES,
  fitsCeiling,
  isOnline,
  loadTile,
  realUrl,
  reportNetwork,
  resetConnectivity,
  reviveAreas,
  sizeLine,
  TERRAIN_TILE_MEAN_BYTES,
  VECTOR_TILE_MEAN_BYTES,
  urlsFreedBy,
  venueBox,
  viaProtocol,
  type SavedArea,
} from './offlineCache.ts'
import { IMAGERY_TEMPLATE, TERRAIN_TEMPLATE } from './offlineSources.ts'
import { boxAround, tileAt, tilesForRange, tileUrl } from './tileRange.ts'

const BIG_MEADOW = { lat: 38.5195, lon: -78.444 }

describe('tile arithmetic', () => {
  it('numbers a known tile the standard way', () => {
    /* z0 is the whole world in one tile. */
    expect(tileAt(BIG_MEADOW, 0)).toEqual({ x: 0, y: 0 })
    /* Null Island sits on the corner of the four z1 tiles: south-east one. */
    expect(tileAt({ lat: 0, lon: 0 }, 1)).toEqual({ x: 1, y: 1 })
  })

  it('covers the 400 m ring with the tile counts the measurement fetched', () => {
    /* measurements/2026-10-25-venue-cache-400m.md: 2, 4, 9, 25, 64 at Big Meadow. */
    const box = boxAround(BIG_MEADOW, 400)
    expect([14, 15, 16, 17, 18].map((z) => tilesForRange(box, z, z).length)).toEqual([
      2, 4, 9, 25, 64,
    ])
  })

  it('fills each template in its own axis order', () => {
    const tile = { z: 18, x: 74000, y: 100000 }
    expect(tileUrl(IMAGERY_TEMPLATE, tile)).toMatch(/tile\/18\/100000\/74000$/)
    expect(tileUrl(TERRAIN_TEMPLATE, tile)).toMatch(/terrarium\/18\/74000\/100000\.png$/)
  })
})

describe('protocol URLs', () => {
  it('round-trips a real URL through the scheme', () => {
    const real = tileUrl(IMAGERY_TEMPLATE, { z: 1, x: 0, y: 1 })
    const via = viaProtocol(IMAGERY_TEMPLATE).replace('{z}', '1').replace('{y}', '1').replace('{x}', '0')
    expect(via.startsWith('scoutngo://')).toBe(true)
    expect(realUrl(via)).toBe(real)
  })

  /*
   * THE CACHE KEY IS THE REAL URL. A tile saved by the downloader under one
   * spelling and asked for by the map under another is never hit, and nothing
   * on screen would say so.
   */
  it('keys the map request and the saved tile the same way', () => {
    const { imagery } = areaUrls(venueBox(BIG_MEADOW, 400))
    const mapAsks = viaProtocol(imagery[0])
    expect(realUrl(mapAsks)).toBe(imagery[0])
  })
})

describe('loadTile never hangs', () => {
  const realFetch = globalThis.fetch
  const onLine = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine')

  beforeEach(() => {
    resetConnectivity()
    vi.useRealTimers()
  })
  afterEach(() => {
    globalThis.fetch = realFetch
    if (onLine) Object.defineProperty(Navigator.prototype, 'onLine', onLine)
    resetConnectivity()
  })

  /* Every request rejects: tiles and the check on the app's own origin alike. */
  const hanging = ((_url: string, init: RequestInit) =>
    new Promise((_resolve, reject) => {
      /* Like the real fetch: an already-aborted signal rejects at once. */
      if (init.signal?.aborted === true) reject(new DOMException('aborted', 'AbortError'))
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })) as unknown as typeof fetch

  it('once offline is confirmed, refuses at once without fetching', async () => {
    Object.defineProperty(Navigator.prototype, 'onLine', { get: () => false, configurable: true })
    globalThis.fetch = vi.fn(() => Promise.reject(new TypeError('Load failed'))) as unknown as typeof fetch
    await expect(loadTile({ url: 'scoutngo://example.com/1/2/3' }, new AbortController())).rejects.toThrow()
    /* The failed tile asked the app's own origin; that failed too, and the device agrees. */
    await vi.waitFor(() => expect(isOnline()).toBe(false))
    const fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy as unknown as typeof fetch
    await expect(loadTile({ url: 'scoutngo://example.com/1/2/4' }, new AbortController())).rejects.toThrow(/offline/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  /*
   * THE MOUNTAIN. The device says it is online and nothing is ever answered,
   * the app's own origin included. The tile fails in bounded time, and the
   * network is called gone once the check has failed twice.
   */
  it('gives up on a request that is never answered, and says the network is gone once the check fails twice', async () => {
    vi.useFakeTimers()
    Object.defineProperty(Navigator.prototype, 'onLine', { get: () => true, configurable: true })
    globalThis.fetch = hanging

    const pending = loadTile({ url: 'scoutngo://example.com/1/2/3' }, new AbortController())
    const settled = expect(pending).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(9000)
    await settled
    expect(isOnline()).toBe(true)
    await vi.advanceTimersByTimeAsync(6000 + 2500 + 6000)
    expect(isOnline()).toBe(false)
  })

  /*
   * PRIVATE RELAY. One host refuses (Overpass, the map tiles) while the rest
   * of the network works. That host's tiles fail; the app stays online.
   */
  it('one host refusing does not make the app offline', async () => {
    Object.defineProperty(Navigator.prototype, 'onLine', { get: () => true, configurable: true })
    globalThis.fetch = ((url: string) =>
      url.startsWith('https://example.com/')
        ? Promise.reject(new TypeError('Load failed'))
        : Promise.resolve(new Response(null, { status: 200 }))) as unknown as typeof fetch
    for (let i = 0; i < 5; i += 1) {
      await expect(loadTile({ url: `scoutngo://example.com/1/2/${i}` }, new AbortController())).rejects.toThrow()
    }
    await new Promise((r) => setTimeout(r, 50))
    expect(isOnline()).toBe(true)
  })

  it('a tile the map scrolled past does not count against the network', async () => {
    Object.defineProperty(Navigator.prototype, 'onLine', { get: () => true, configurable: true })
    globalThis.fetch = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        /* Like the real fetch: an already-aborted signal rejects at once. */
        if (init.signal?.aborted === true) reject(new DOMException('aborted', 'AbortError'))
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        )
      })) as unknown as typeof fetch
    const abort = new AbortController()
    const pending = loadTile({ url: 'scoutngo://example.com/1/2/3' }, abort)
    abort.abort()
    await expect(pending).rejects.toThrow()
    expect(isOnline()).toBe(true)
  })

  it('one success clears a confirmed offline, with no reload', async () => {
    Object.defineProperty(Navigator.prototype, 'onLine', { get: () => false, configurable: true })
    globalThis.fetch = vi.fn(() => Promise.reject(new TypeError('Load failed'))) as unknown as typeof fetch
    reportNetwork(false)
    await vi.waitFor(() => expect(isOnline()).toBe(false))
    /* The phone has its signal back, and the next request through says so. */
    Object.defineProperty(Navigator.prototype, 'onLine', { get: () => true, configurable: true })
    reportNetwork(true)
    expect(isOnline()).toBe(true)
  })
})

describe('saved areas', () => {
  const area = (id: string, lat: number, kind: 'venue' | 'trip' = 'venue'): SavedArea => ({
    id,
    kind,
    label: id,
    box: venueBox({ lat, lon: -78.444 }, 400),
    imageryZooms: [14, 18],
    terrainZooms: [14, 15],
    tiles: 0,
    bytes: 0,
    savedAt: '2026-10-25T00:00:00Z',
  })

  /*
   * A trip that includes the venue shares its tiles. Deleting the venue must
   * not punch holes in the trip.
   */
  it('deleting one area keeps every tile another area still covers', () => {
    const venue = area('venue', 38.5195)
    const trip: SavedArea = { ...area('trip', 38.5195, 'trip'), box: venueBox(BIG_MEADOW, 1500) }
    const freed = urlsFreedBy(venue, [venue, trip])
    expect(freed).toEqual([])
  })

  it('deleting an area nobody shares frees all of it', () => {
    const a = area('a', 38.5195)
    const far = area('far', 36.8466)
    const all = areaUrls(a.box)
    expect(urlsFreedBy(a, [a, far]).length).toBe(all.imagery.length + all.terrain.length + all.vector.length)
  })

  it('drops an unreadable stored entry rather than throwing', () => {
    expect(reviveAreas([area('ok', 38.5), { id: 'broken' }, null, 'x'])).toHaveLength(1)
    expect(reviveAreas('not a list')).toEqual([])
  })
})

describe('the size line says which half is measured', () => {
  it('names imagery as measured and terrain as estimated', () => {
    expect(
      sizeLine({
        imageryTiles: 104,
        terrainTiles: 6,
        imageryBytes: 1_747_203,
        terrainBytesEstimate: 6 * TERRAIN_TILE_MEAN_BYTES,
        vectorTiles: 2,
        vectorBytesEstimate: 2 * VECTOR_TILE_MEAN_BYTES,
        alreadySaved: 0,
      }),
    ).toBe('2.2 MB · imagery measured, terrain and map data estimated')
  })

  it('saves the map tiles the buildings and the sea come from, at the zooms the terrain reads them', () => {
    const ring = areaUrls(venueBox(BIG_MEADOW, 400))
    expect(ring.vector.length).toBeGreaterThan(0)
    expect(ring.vector.every((u) => /^https:\/\/tiles\.openfreemap\.org\/planet\/latest\/14\//.test(u))).toBe(true)
    const overview = areaUrls(venueBox(BIG_MEADOW, 1500), [0, 13], [0, 15])
    expect(new Set(overview.vector.map((u) => u.split('/')[5]))).toEqual(new Set(['12', '13', '14']))
  })

  it('never prints a size it could not measure', () => {
    const line = sizeLine({
      imageryTiles: 10,
      terrainTiles: 2,
      imageryBytes: null,
      terrainBytesEstimate: 2 * TERRAIN_TILE_MEAN_BYTES,
      vectorTiles: 0,
      vectorBytesEstimate: 0,
      alreadySaved: 0,
    })
    expect(line).not.toMatch(/MB/)
    expect(line).toMatch(/could not be measured/)
  })

  it('an unmeasured area never counts as fitting the ceiling', () => {
    expect(
      fitsCeiling({ imageryTiles: 1, terrainTiles: 0, imageryBytes: null, terrainBytesEstimate: 0, vectorTiles: 0, vectorBytesEstimate: 0, alreadySaved: 0 }),
    ).toBe(false)
    expect(
      fitsCeiling({
        imageryTiles: 1,
        terrainTiles: 0,
        imageryBytes: AUTO_CACHE_CEILING_BYTES + 1,
        terrainBytesEstimate: 0,
        vectorTiles: 0,
        vectorBytesEstimate: 0,
        alreadySaved: 0,
      }),
    ).toBe(false)
  })
})

/*
 * ONE FACT, ONE PLACE. The surface audit refused a screen with the venue named
 * in the venue bar and again in the saved-areas list.
 */
describe('the saved list does not repeat the venue on screen', () => {  const here = 'Brew River Dock Bar, Salisbury MD'

  it('calls the venue on screen "this venue"', () => {
    expect(areaLabel(here, here)).toBe('This venue')
    expect(areaLabel(`Around ${here}, 258 m × 558 m`, here)).toBe('Around this venue, 258 m × 558 m')
  })

  it('keeps the names of other venues, which is how they are told apart', () => {
    expect(areaLabel('Big Meadow, Shenandoah', here)).toBe('Big Meadow, Shenandoah')
  })
})
