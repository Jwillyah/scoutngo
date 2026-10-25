import { describe, expect, it } from 'vitest'
import { isInWater } from '../core/siting.ts'
import { buildQuery, parseOverpass, stitchRings } from './overpass.ts'

/*
 * A RIVER MAPPED AS A RELATION IS WATER. Before this the parser read water
 * ways only, and the Wicomico at Brew River -- three multipolygon relations --
 * came back as no water at all.
 */
const g = (pairs: [number, number][]) => pairs.map(([lon, lat]) => ({ lat, lon }))

/* A square river, its outline split across two member ways, one of them drawn backwards. */
const river = {
  type: 'relation',
  id: 1,
  tags: { type: 'multipolygon', natural: 'water', water: 'river' },
  members: [
    { type: 'way', role: 'outer', geometry: g([[0, 0], [1, 0], [1, 1]]) },
    { type: 'way', role: 'outer', geometry: g([[0, 0], [0, 1], [1, 1]]) },
    { type: 'way', role: 'inner', geometry: g([[0.4, 0.4], [0.6, 0.4], [0.6, 0.6], [0.4, 0.6], [0.4, 0.4]]) },
  ],
}

describe('rivers mapped as relations', () => {
  it('asks Overpass for water relations', () => {
    const q = buildQuery({ south: 0, west: 0, north: 1, east: 1 })
    expect(q).toContain('relation["natural"="water"]')
    expect(q).toContain('relation["waterway"="riverbank"]')
  })

  it('joins split member ways into one closed ring, whichever way each is drawn', () => {
    const rings = stitchRings([
      [[0, 0], [1, 0], [1, 1]],
      [[0, 0], [0, 1], [1, 1]],
    ])
    expect(rings).toHaveLength(1)
    expect(rings[0][0]).toEqual(rings[0][rings[0].length - 1])
  })

  it('drops a chain that never closes rather than inventing an edge', () => {
    expect(stitchRings([[[0, 0], [1, 0], [1, 1]]])).toEqual([])
  })

  it('makes the river water, with its island not', () => {
    const site = parseOverpass({ elements: [river] })
    expect(site.land.water).toHaveLength(1)
    expect(isInWater({ lat: 0.2, lon: 0.2 }, site.land.water)).toBe(true)
    expect(isInWater({ lat: 0.5, lon: 0.5 }, site.land.water)).toBe(false)
    expect(isInWater({ lat: 2, lon: 2 }, site.land.water)).toBe(false)
  })
})
