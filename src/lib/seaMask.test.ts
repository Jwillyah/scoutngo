import { afterEach, describe, expect, it } from 'vitest'
import { encodeTestTile, square } from './mvtTestTile.ts'
import { cleanHeights, cleanTerrainBytes, parseCoastlines, SEA_GATE_M } from './seaMask.ts'
import { setVectorLoader } from './vectorTiles.ts'

const payload = { elements: [{ type: 'way', tags: { natural: 'coastline' }, geometry: [{ lat: 36.84, lon: -75.97 }, { lat: 36.85, lon: -75.973 }] }, { type: 'way', tags: { natural: 'water' }, geometry: [] }] }

/* A zoom 15 elevation tile at the pier, 32 px: the west half sand at 2 m, the east half Terrarium's invented 24.6 m. */
const tile = { z: 15, x: 9469, y: 12773 }
const size = 32
const raw = () => new Float32Array(size * size).map((_, i) => (i % size >= 16 ? 24.6 : 2))
/* Its vector tile (zoom 14, x 4734, y 6386) has the elevation tile in its east half, top row: x 2048 to 4096, y 0 to 2048. Ocean from x 3072, the elevation tile's middle. */
const withOcean = () => encodeTestTile({ water: [{ rings: [square(3072, -64, 4160, 4160)], properties: { class: 'ocean' } }] })

describe('the elevation, cleaned against the map tiles\' ocean', () => {
  afterEach(() => setVectorLoader(null))

  it('puts the sea at 0 when the map tile is there', async () => {
    setVectorLoader(async () => withOcean())
    const heights = raw()
    const out = await cleanHeights(tile, heights, size)
    expect(out.path).toBe('ocean')
    expect(heights[10 * size + 24]).toBe(0)
    expect(heights[10 * size + 4]).toBe(2)
  })

  it('leaves a tile the map says has no sea as it came', async () => {
    setVectorLoader(async () => encodeTestTile({ water: [{ rings: [square(0, 0, 100, 100)], properties: { class: 'lake' } }] }))
    const heights = raw()
    expect(await cleanHeights(tile, heights, size)).toEqual({ path: 'ocean', changed: 0 })
    expect(heights[10 * size + 24]).toBeCloseTo(24.6, 4)
  })

  it('falls back to the elevation\'s own shape when the map tile cannot be had', async () => {
    setVectorLoader(async () => null)
    const out = await cleanHeights(tile, raw(), size)
    expect(out.path).toBe('shape')
  })

  it('asks for no map tile where the ground is all well above the sea', async () => {
    let asked = 0
    setVectorLoader(async () => {
      asked += 1
      return withOcean()
    })
    const out = await cleanHeights(tile, new Float32Array(size * size).fill(SEA_GATE_M + 1), size)
    expect(out.path).toBe('none')
    expect(asked).toBe(0)
  })

  it('leaves anything that is not an elevation tile alone', async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer
    expect(await cleanTerrainBytes('https://server.arcgisonline.com/x/1/2/3', bytes)).toBe(bytes)
  })

  it('still reads coastline ways for the measuring scripts, in their own order', () => {
    expect(parseCoastlines(payload)).toEqual([[[-75.97, 36.84], [-75.973, 36.85]]])
  })
})
