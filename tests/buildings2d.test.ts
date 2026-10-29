import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { shadowRings } from '../src/lib/shadowLayer.ts'

/*
 * BIG BUILDINGS DO NOT HIDE THE PHOTO (29 Oct, Hampton Coliseum at z17). On
 * the glass: scripts/audit-buildings.mjs. Here, the two rules it rests on.
 */
const area = (ring: number[][]) => {
  let a = 0
  for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
  return a / 2
}

describe('2D buildings', () => {
  it('flat, a building top is at most a quarter covered; the boxes only when tilted', () => {
    const map = readFileSync('src/components/MapView.tsx', 'utf8')
    expect(Number(/export const BUILDING_TOP_OPACITY = ([\d.]+)/.exec(map)?.[1])).toBeLessThanOrEqual(0.25)
    expect(Number(/export const BUILDINGS_FLAT_PITCH = (\d+)/.exec(map)?.[1])).toBeGreaterThan(0)
    expect(map).toMatch(/'fill-opacity': BUILDING_TOP_OPACITY/)
    expect(map).toMatch(/show\(BUILDING_LAYER, !flat\)/)
    expect(map).toMatch(/show\(BUILDING_TOP_LAYER, flat\)/)
  })

  it('a shadow has its own roof cut out, wound the other way so it reads as a hole', () => {
    const hull = [[0, 0], [4, 0], [4, 3], [0, 3]]
    for (const footprint of [[[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]], [[1, 1], [1, 2], [2, 2], [2, 1], [1, 1]]]) {
      const [outer, hole] = shadowRings(hull, footprint)
      expect(hole).toHaveLength(5)
      expect(Math.sign(area(outer))).toBe(-Math.sign(area(hole)))
    }
  })
})
