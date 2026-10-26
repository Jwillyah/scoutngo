import { describe, expect, it } from 'vitest'
import type { Position } from './geo.ts'
import { cleanTerrainRgba, SHORE_BAND_M, terrariumTileOf, tilePointLonLat, type TileAddress } from './seaTile.ts'
import { nearestCoast } from './siting.ts'
import { terrariumMetres } from './terrarium.ts'

/* A tile at zoom 17 off Virginia Beach, and a straight north-running coastline through its middle: land west, sea east. */
const tile: TileAddress = { z: 17, x: 37475, y: 51113 }
const size = 64
const mid = tilePointLonLat(tile, 0.5, 0.5)
const north = tilePointLonLat(tile, 0.5, -1)
const south = tilePointLonLat(tile, 0.5, 2)
/* Walking north, the land is on the left (west): that is how OSM draws it. */
const coast: Position[][] = [[[south.lon, south.lat], [north.lon, north.lat]]]
const box = { south: south.lat, north: north.lat, west: mid.lon - 0.01, east: mid.lon + 0.01 }

const tileOf = (height: (u: number) => number) => {
  const rgba = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1) {
      const v = height((x + 0.5) / size) + 32768
      const i = (y * size + x) * 4
      rgba[i] = Math.floor(v / 256)
      rgba[i + 1] = Math.floor(v) % 256
      rgba[i + 2] = Math.floor((v % 1) * 256)
      rgba[i + 3] = 255
    }
  return rgba
}
const at = (rgba: Uint8ClampedArray, u: number) => {
  const i = (Math.floor(size / 2) * size + Math.floor(u * size)) * 4
  return terrariumMetres(rgba[i], rgba[i + 1], rgba[i + 2])
}

describe('the coastline', () => {
  it('says which side is sea, how far, and that inland is west for a north-running coast', () => {
    const near = nearestCoast({ lat: mid.lat, lon: mid.lon + 0.0001 }, coast)
    expect(near?.sea).toBe(true)
    expect(nearestCoast({ lat: mid.lat, lon: mid.lon - 0.0001 }, coast)?.sea).toBe(false)
    expect(near?.inland).toBeCloseTo(270, 6)
  })
})

describe('cleaning an elevation tile against the coastline', () => {
  it('puts the sea at 0 m, whatever the tile said (the 19 m bump on the water)', () => {
    const rgba = tileOf((u) => (u > 0.5 ? 19 : 2))
    expect(cleanTerrainRgba(rgba, size, tile, coast, box)).toBeGreaterThan(0)
    expect(at(rgba, 0.8)).toBe(0)
    expect(at(rgba, 0.1)).toBe(2)
  })

  it('brings an artefact standing on the waterline down to the sand behind it', () => {
    /* 30 m in a strip just inland of the coast, 2 m beach behind it. */
    const rgba = tileOf((u) => (u > 0.5 ? 0 : u > 0.47 ? 30 : 2))
    cleanTerrainRgba(rgba, size, tile, coast, box)
    expect(at(rgba, 0.485)).toBeLessThanOrEqual(3)
  })

  it('keeps a real cliff: high ground behind the waterline stays high', () => {
    const rgba = tileOf((u) => (u > 0.5 ? 0 : 40))
    cleanTerrainRgba(rgba, size, tile, coast, box)
    expect(at(rgba, 0.485)).toBe(40)
    expect(at(rgba, 0.2)).toBe(40)
  })

  it('leaves a tile untouched with no coastline, or outside the box', () => {
    const rgba = tileOf(() => 19)
    expect(cleanTerrainRgba(rgba, size, tile, [], box)).toBe(0)
    expect(cleanTerrainRgba(rgba, size, tile, coast, { south: 0, north: 1, west: 0, east: 1 })).toBe(0)
    expect(SHORE_BAND_M).toBe(20)
  })

  it('reads a tile address only from a Terrarium URL', () => {
    expect(terrariumTileOf('https://s3.amazonaws.com/elevation-tiles-prod/terrarium/15/9468/12772.png')).toEqual({ z: 15, x: 9468, y: 12772 })
    expect(terrariumTileOf('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/15/1/2')).toBeNull()
  })
})
