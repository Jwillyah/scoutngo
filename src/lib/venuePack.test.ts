import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  mayStart,
  networkKind,
  offlineLine,
  packFor,
  packMissing,
  packParts,
  packSizeLine,
  packSizeNote,
  packTileCount,
  PACK_FAR_RADIUS_M,
  PACK_NEAR_RADIUS_M,
  PACK_STORAGE_KEY,
  PACK_TIDE_DAYS,
  type VenuePack,
} from './venuePack.ts'
import { allUrls, AREAS_STORAGE_KEY, reviveAreas, spread, urlsFreedBy, type SavedArea } from './offlineCache.ts'
import { readForecast, saveForecast, SAVED_FORECAST_KEY } from './savedForecast.ts'
import { distanceMeters } from '../core/geo.ts'
import { tilesForRange } from './tileRange.ts'

const PIER = { lat: 36.8435575, lon: -75.9713104 }

function memoryStorage(limit = Infinity): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => {
      if (String(v).length > limit) throw new DOMException('full', 'QuotaExceededError')
      map.set(k, String(v))
    },
  }
}

describe('what a venue pack covers', () => {
  it('is 1.5 km at z12-19 near the pin and 30 km at z8-11 round it', () => {
    const [near, far] = packParts(PIER)
    expect(near.imageryZooms).toEqual([12, 19])
    expect(near.terrainZooms).toEqual([12, 15])
    expect(far.imageryZooms).toEqual([8, 11])
    /* The box's half-width on the ground is the radius asked for. */
    const half = (b: typeof near.box) => distanceMeters(PIER, { lat: PIER.lat, lon: b.east })
    expect(half(near.box)).toBeCloseTo(PACK_NEAR_RADIUS_M, -1)
    expect(half(far.box)).toBeCloseTo(PACK_FAR_RADIUS_M, -2)
  })

  it('holds the near ring at every zoom and the far context only coarse', () => {
    const [near, far] = packParts(PIER)
    const urls = allUrls({ ...near, extra: [far] })
    expect(urls.length).toBe(packTileCount(PIER))
    /* Each URL once, though the two parts overlap at no zoom and the vector tiles are shared. */
    expect(new Set(urls).size).toBe(urls.length)
    const z19 = tilesForRange(near.box, 19, 19).length
    expect(urls.filter((u) => /World_Imagery\/MapServer\/tile\/19\//.test(u)).length).toBe(z19)
    expect(urls.some((u) => /World_Imagery\/MapServer\/tile\/11\//.test(u))).toBe(true)
    expect(urls.some((u) => /World_Imagery\/MapServer\/tile\/7\//.test(u))).toBe(false)
    /* Buildings, their heights and the sea: the map tiles at 12-14. */
    expect(urls.some((u) => /openfreemap.*\/14\//.test(u))).toBe(true)
  })

  it('is kept as one area, and deleting a venue ring under it frees nothing the pack holds', () => {
    const [near, far] = packParts(PIER)
    const pack: SavedArea = { id: 'p', kind: 'pack', label: 'Pier', ...near, extra: [far], tiles: 1, bytes: 1, savedAt: '2026-10-29T00:00:00Z' }
    expect(reviveAreas([pack])).toHaveLength(1)
    const ring: SavedArea = { ...pack, id: 'r', kind: 'venue', box: near.box, imageryZooms: [14, 18], terrainZooms: [14, 15], extra: undefined }
    expect(urlsFreedBy(ring, [pack, ring])).toEqual([])
    /* A damaged extra part is dropped, not thrown. */
    expect(reviveAreas([{ ...pack, extra: [{ box: null }] }])).toHaveLength(0)
  })
})

describe('Wi-Fi first', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('waits on cellular when Wi-Fi only is on, and asks when the phone does not say', () => {
    expect(mayStart('wifi', true)).toBe('go')
    expect(mayStart('cellular', true)).toBe('wait')
    expect(mayStart('cellular', false)).toBe('go')
    /* iOS Safari has no navigator.connection: never pretend to know. */
    expect(mayStart('unknown', true)).toBe('ask')
  })

  it('reads the network type only when the phone gives one', () => {
    vi.stubGlobal('navigator', {})
    expect(networkKind()).toBe('unknown')
    vi.stubGlobal('navigator', { connection: { type: 'cellular' } })
    expect(networkKind()).toBe('cellular')
  })
})

describe('the words', () => {
  const pack = (over: Partial<VenuePack> = {}): VenuePack => ({
    id: 'x', lat: PIER.lat, lon: PIER.lon, name: 'Pier', day: '2026-10-30', timeZone: 'America/New_York', areaId: 'a',
    savedAt: '2026-10-30T13:12:00Z', tileBytes: 1, dataBytes: 1, keys: [],
    data: { day: true, hours: true, marine: true, tideDays: PACK_TIDE_DAYS, tideStation: 'Sewells Point', scan: false },
    ...over,
  })

  it('says offline in one line with the time the data is from', () => {
    vi.stubEnv('TZ', 'America/New_York')
    const line = offlineLine(pack(), new Date('2026-10-30T15:00:00Z'))
    expect(line).toMatch(/^Offline · using saved data from \d{1,2}:\d{2} [AP]M$/)
    expect(offlineLine(null)).toBe('Offline · no offline pack here · sun and shadows still work')
    vi.unstubAllEnvs()
  })

  it('names what is missing rather than calling a pack complete', () => {
    expect(packMissing(pack())).toEqual([])
    expect(packMissing(pack({ data: { day: false, hours: true, marine: 'inland', tideDays: 4, tideStation: 'X', scan: false } }))).toEqual([
      'the day’s forecast',
      '3 days of tides',
    ])
  })

  it('gives a size before anything downloads, and says it is estimated', () => {
    const sampled = { tiles: 100, alreadySaved: 0, imageryBytes: 40_000_000, imageryTiles: 90, measured: 96, terrainBytesEstimate: 2_000_000, vectorBytesEstimate: 1_000_000 }
    expect(packSizeLine({ sampled, total: 43_000_000 })).toBe('About 43.0 MB')
    expect(packSizeNote({ sampled, total: 43_000_000 })).toBe('Estimated from 96 tiles measured, before anything downloads.')
    expect(packSizeLine({ sampled, total: null })).toMatch(/could not be measured/)
    expect(packSizeLine({ sampled: { ...sampled, alreadySaved: 100 }, total: 0 })).toBe('Already on this phone.')
  })

  it('samples evenly, ends included', () => {
    expect(spread([1, 2, 3, 4, 5, 6, 7, 8, 9], 3)).toEqual([1, 5, 9])
    expect(spread([1, 2], 5)).toEqual([1, 2])
  })
})

describe('kept on the phone', () => {
  beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()))
  afterEach(() => vi.unstubAllGlobals())

  it('a pack whose tiles were deleted is not offline-ready', () => {
    const p = { id: 'x', lat: PIER.lat, lon: PIER.lon, name: 'Pier', day: 'd', timeZone: 'UTC', areaId: 'gone', savedAt: 's', tileBytes: 1, dataBytes: 1, keys: [], data: {} }
    localStorage.setItem(PACK_STORAGE_KEY, JSON.stringify([p]))
    expect(packFor(PIER)).toBeNull()
    const [near] = packParts(PIER)
    localStorage.setItem(AREAS_STORAGE_KEY, JSON.stringify([{ id: 'gone', kind: 'pack', label: 'Pier', ...near, tiles: 1, bytes: 1, savedAt: 's' }]))
    expect(packFor(PIER)?.id).toBe('x')
    expect(packFor({ lat: PIER.lat + 0.01, lon: PIER.lon })).toBeNull()
  })

  it('a full store drops the oldest forecast, never the new one', () => {
    vi.stubGlobal('localStorage', memoryStorage(400))
    for (let i = 0; i < 6; i += 1) saveForecast(`k${i}`, 'x'.repeat(60))
    expect(readForecast('k5')).not.toBeNull()
    expect(readForecast('k0')).toBeNull()
    expect((localStorage.getItem(SAVED_FORECAST_KEY) ?? '').length).toBeLessThanOrEqual(400)
  })
})
