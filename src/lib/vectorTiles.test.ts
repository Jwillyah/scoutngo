import { afterEach, describe, expect, it, vi } from 'vitest'
import { VectorTile } from '@mapbox/vector-tile'
import { PbfReader } from 'pbf'
import { tilePointLonLat } from '../core/seaTile.ts'
import { encodeTestTile, square } from './mvtTestTile.ts'
import { buildingsFromTiles, buildingsInTile, loadVectorTile, oceanFeatures, setVectorLoader, VECTOR_RETRY_MS, vectorTileFor, vectorTileUrl } from './vectorTiles.ts'

const at = { z: 14, x: 4734, y: 6386 }
const decode = (bytes: ArrayBuffer) => new VectorTile(new PbfReader(new Uint8Array(bytes)))

describe('buildings from the map tiles', () => {
  const tile = decode(
    encodeTestTile({
      building: [
        { rings: [square(100, 100, 200, 200)], properties: { render_height: 9, render_min_height: 0 } },
        { rings: [square(300, 300, 400, 400)], properties: { render_height: 5, render_min_height: 0 } },
        { rings: [square(500, 500, 600, 600)], properties: { render_height: 30, hide_3d: true } },
        { rings: [square(4000, 100, 4150, 200)], properties: { render_height: 39, render_min_height: 0 } },
        /* Only touches the east edge from the buffer: nothing of it on this tile. */
        { rings: [square(4096, 300, 4160, 400)], properties: { render_height: 12, render_min_height: 0 } },
      ],
    }),
  )
  const list = buildingsInTile(tile, at)

  it('keeps a recorded height and calls the tiles\' 5 m unknown', () => {
    expect(list.map((b) => b.height.metres)).toEqual([9, null, 39])
    expect(list[0].height.source).toBe('tile')
    expect(list[1].height).toMatchObject({ source: 'unknown', metres: null })
  })

  it('leaves out an outline whose parts are drawn instead, and a building with nothing of it on this tile', () => {
    /* A footprint of no area stopped the 3D engine for good on 27 Oct. */
    expect(list).toHaveLength(3)
  })

  it('cuts a building across the tile edge at the edge, closed', () => {
    const ring = list[2].ring
    expect(Math.max(...ring.map((p) => p[0]))).toBeCloseTo(tilePointLonLat(at, 1, 0).lon, 9)
    expect(ring[0]).toEqual(ring[ring.length - 1])
  })
})

describe('the sea in the map tiles', () => {
  it('is the ocean class only: not a lake, not a pool', () => {
    const tile = decode(
      encodeTestTile({
        water: [
          { rings: [square(0, 0, 100, 100)], properties: { class: 'lake' } },
          { rings: [square(2048, 0, 4096, 4096)], properties: { class: 'ocean' } },
          { rings: [square(10, 10, 20, 20)], properties: { class: 'swimming_pool' } },
        ],
      }),
    )
    expect(oceanFeatures(tile)).toHaveLength(1)
  })

  it('is read for an elevation tile from its own zoom, or the deepest there is', () => {
    expect(vectorTileFor({ z: 15, x: 9469, y: 12773 })).toEqual({ z: 14, x: 4734, y: 6386 })
    expect(vectorTileFor({ z: 13, x: 2367, y: 3193 })).toEqual({ z: 13, x: 2367, y: 3193 })
    expect(vectorTileFor({ z: 11, x: 591, y: 798 })).toBeNull()
    expect(vectorTileUrl(at)).toBe('https://tiles.openfreemap.org/planet/latest/14/4734/6386.pbf')
  })
})

describe('buildings over a box', () => {
  afterEach(() => setVectorLoader(null))
  const box = { south: 36.84, west: -75.975, north: 36.847, east: -75.968 }

  it('are drawn when every tile is there, the ones in the box only', async () => {
    /* The box's middle is at about 1854, 224 in tile 4734/6386; the corner square is far outside it. */
    setVectorLoader(async () =>
      encodeTestTile({
        building: [
          { rings: [square(1800, 180, 1900, 280)], properties: { render_height: 12 } },
          { rings: [square(3900, 3900, 3950, 3950)], properties: { render_height: 12 } },
        ],
      }),
    )
    const out = await buildingsFromTiles(box)
    expect(out.status).toBe('ok')
    if (out.status !== 'ok') return
    expect(out.buildings.length).toBeGreaterThan(0)
    for (const b of out.buildings) expect(b.ring.some(([lon, lat]) => lon >= box.west && lon <= box.east && lat >= box.south && lat <= box.north)).toBe(true)
    expect(out.buildings.some((b) => b.id.endsWith('/1/0'))).toBe(false)
  })

  it('are unavailable, with a reason, when a tile cannot be had: half a town reads as the other half empty', async () => {
    let n = 0
    setVectorLoader(async () => (n++ === 0 ? null : encodeTestTile({ building: [] })))
    const out = await buildingsFromTiles(box)
    expect(out.status).toBe('unavailable')
  })

  it('does not ask again for a tile that just failed, then does after VECTOR_RETRY_MS', async () => {
    vi.useFakeTimers()
    let asked = 0
    setVectorLoader(async () => {
      asked += 1
      return null
    })
    const t = { z: 14, x: 1, y: 1 }
    expect(await loadVectorTile(t)).toBeNull()
    await Promise.resolve()
    expect(await loadVectorTile(t)).toBeNull()
    expect(asked).toBe(1)
    vi.advanceTimersByTime(VECTOR_RETRY_MS + 1)
    await loadVectorTile(t)
    expect(asked).toBe(2)
    vi.useRealTimers()
  })
})
