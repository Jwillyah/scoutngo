import { describe, expect, it } from 'vitest'
import { areaFor, areaM2, CELL, mercator, unmercator } from './grid.ts'
import { estimateBytes, nodesFor, pickDepth, type EptMeta } from './ept.ts'

describe('the lidar patch', () => {
  it('is a fixed 3 x 3 block of cells: two pins a few metres apart share it', () => {
    const a = areaFor(36.8435575, -75.9713104)
    const b = areaFor(36.84357, -75.97132)
    expect(a.id).toBe(b.id)
    expect(a.maxx - a.minx).toBe(3 * CELL)
    const m = mercator(36.8435575, -75.9713104)
    expect(m.x).toBeGreaterThan(a.minx + CELL)
    expect(m.x).toBeLessThan(a.maxx - CELL)
    expect(unmercator(m.x, m.y).lat).toBeCloseTo(36.8435575, 9)
    /* 1536 units at cos(36.84) = 0.8004: about 1.23 km square. */
    expect(Math.sqrt(areaM2(a, a.metresPerUnit))).toBeCloseTo(1536 * Math.cos((36.8435575 * Math.PI) / 180), 6)
  })
})

describe('reading the tile index before downloading', () => {
  /* A synthetic project 4096 units across: the root holds 1000 points, each child 1000, each grandchild 1000. */
  const meta: EptMeta = { bounds: [0, 0, 0, 4096, 4096, 4096], points: 0 }
  const hierarchy = async () => {
    const h: Record<string, number> = { '0-0-0-0': 1000 }
    for (let x = 0; x < 2; x += 1) for (let y = 0; y < 2; y += 1) h[`1-${x}-${y}-0`] = 1000
    for (let x = 0; x < 4; x += 1) for (let y = 0; y < 4; y += 1) h[`2-${x}-${y}-0`] = 1000
    return h
  }
  const area = { minx: 0, miny: 0, maxx: 1024, maxy: 1024, id: 't', metresPerUnit: 1 }

  it('counts each tile by the share of it inside the patch', async () => {
    const nodes = await nodesFor(meta, area, hierarchy)
    expect(nodes.map((n) => n.key)).toEqual(['0-0-0-0', '1-0-0-0', '2-0-0-0'])
    /* Root: 1/16 of it inside; depth 1: 1/4; depth 2: all. 62.5 + 250 + 1000. */
    expect(nodes.map((n) => n.inside)).toEqual([62.5, 250, 1000])
  })

  it('stops at the shallowest depth that reaches the density asked for, and sizes the download', async () => {
    const nodes = await nodesFor(meta, area, hierarchy)
    const m2 = 1024 * 1024
    const shallow = pickDepth(nodes, area, 300 / m2)
    expect(shallow.depth).toBe(1)
    expect(shallow.points).toBeCloseTo(312.5, 6)
    expect(pickDepth(nodes, area, 1e9).depth).toBe(2)
    expect(estimateBytes(shallow.nodes, 6)).toBe(12_000)
  })
})
