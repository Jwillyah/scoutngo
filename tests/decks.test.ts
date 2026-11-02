import { readFileSync } from 'node:fs'
import { VectorTile } from '@mapbox/vector-tile'
import { PbfReader } from 'pbf'
import { describe, expect, it } from 'vitest'
import { DECK_WIDTH_M, isDeck, LAYER_M, PIER_DECK_M, pilings, segmentsOf, type DeckLine } from '../src/core/decks.ts'
import { tilePointLonLat } from '../src/core/seaTile.ts'
import { distanceMeters } from '../src/core/geo.ts'

/*
 * BRIDGES AND PIERS AS DECKS (Batch I, Section 6), from OpenFreeMap's own
 * tiles as served on 2 Nov 2026 (tests/data/openfreemap-2026-11-02): the
 * Lesner Bridge (14/4729/6382) and the Virginia Beach Fishing Pier
 * (14/4734/6386, the same tile the gate serves).
 */
const tile = (name: string) => new VectorTile(new PbfReader(readFileSync(`tests/data/openfreemap-2026-11-02/${name}.pbf`)))
function decksIn(name: string, z: number, x: number, y: number) {
  const t = tile(name)
  const layer = t.layers.transportation
  const out: { kind: string; cls: string; layer: number; type: number; at: { lat: number; lon: number }[] }[] = []
  for (let i = 0; i < layer.length; i += 1) {
    const f = layer.feature(i)
    const tag = isDeck(f.properties as Record<string, unknown>)
    if (tag === null) continue
    for (const ring of f.loadGeometry()) out.push({ ...tag, type: f.type, at: ring.map((p) => tilePointLonLat({ z, x, y }, p.x / layer.extent, p.y / layer.extent)) })
  }
  return out
}
const LESNER = { lat: 36.9095, lon: -76.0905 }
const PIER = { lat: 36.8436, lon: -75.9695 }

describe('the decks in the map', () => {
  it('the Lesner Bridge: a trunk road on a bridge, within 300 m of its middle', () => {
    const near = decksIn('14-4729-6382', 14, 4729, 6382).filter((d) => d.kind === 'bridge' && d.cls === 'trunk' && d.at.some((p) => distanceMeters(p, LESNER) < 300))
    expect(near.length).toBeGreaterThan(0)
    expect(near[0].layer).toBeGreaterThanOrEqual(1)
  })

  it('the Virginia Beach Fishing Pier: a pier deck reaching out from the beach', () => {
    const piers = decksIn('14-4734-6386', 14, 4734, 6386).filter((d) => d.kind === 'pier' && d.at.some((p) => distanceMeters(p, PIER) < 300))
    expect(piers.length).toBeGreaterThan(0)
  })
})

describe('deck arithmetic', () => {
  const bridge: DeckLine = { kind: 'bridge', cls: 'trunk', layer: 1, points: [{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 200, z: 0 }] }
  it('a bridge stands one layer over the higher end; a pier over the sea', () => {
    const segs = segmentsOf(bridge, 3, 2)
    expect(segs).toHaveLength(2)
    expect(segs[0].width).toBe(DECK_WIDTH_M.trunk)
    expect(segs[0].topA).toBeCloseTo(3 + 1.5 + LAYER_M)
    expect(segmentsOf({ ...bridge, kind: 'pier', cls: 'pier' }, 3, 3)[0].topA).toBe(PIER_DECK_M)
  })
  it('pilings every 20 m where the deck stands 2 m or more over the ground, none on the land at the ends', () => {
    const segs = segmentsOf(bridge, 3, 3)
    const piles = pilings(segs, (x) => (x < 20 || x > 180 ? 7.5 : -1.5))
    expect(piles.length).toBeGreaterThanOrEqual(7)
    expect(piles.every((p) => p.x >= 20 && p.x <= 180)).toBe(true)
  })
})

describe('the beach slopes to the water (Batch I, Section 6)', () => {
  it('eases the land to the waterline over BEACH_M, never raises it', async () => {
    const { beachHeight, BEACH_M, WATERLINE_M } = await import('../src/three/world/ground.ts')
    expect(beachHeight(4, 0)).toBeCloseTo(WATERLINE_M)
    expect(beachHeight(4, BEACH_M)).toBe(4)
    expect(beachHeight(4, BEACH_M / 2)).toBeGreaterThan(WATERLINE_M)
    expect(beachHeight(4, BEACH_M / 2)).toBeLessThan(4)
    expect(beachHeight(0.1, 5)).toBe(0.1)
  })
})
