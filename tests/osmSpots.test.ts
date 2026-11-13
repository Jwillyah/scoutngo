import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { roundedCentre } from '../src/core/bestSky.ts'
import { distanceMeters } from '../src/core/geo.ts'
import { dedupeSpots, directionOf, osmQuery, osmSpots, osmTiles } from '../src/core/osmSpots.ts'
import { STARTER_SPOTS } from '../src/data/bestSkySpots.ts'

/* Batch NOW, Section 0.4: the map's viewpoints, piers, boat ramps and parks on the water. Measured: measurements/2026-11-13-osm-spots.md. */
const VB = { lat: 36.85, lon: -75.98 }

describe('the map\'s spots', () => {
  it('asked by fixed 0.25° tiles: the question names a tile\'s square, never the spot', () => {
    const tiles = osmTiles(roundedCentre(VB), 24.14)
    expect(tiles.length).toBeGreaterThan(0)
    for (const t of tiles) {
      expect((t.south * 4) % 1).toBeCloseTo(0, 6)
      const q = osmQuery(t)
      expect(q).not.toMatch(/36\.8[45]|75\.9[78]/)
      expect(q).toMatch(/tourism"="viewpoint/)
      expect(q).toMatch(/man_made"="pier"\]\["name"\]/)
      expect(q).toMatch(/leisure"="slipway"\]\["access"!~"\^\(private\|no\)\$"\]/)
      expect(q).toMatch(/leisure"="park"\]\["name"\]\(around\.w:150\)/)
    }
  })
  it('read into spots: a viewpoint faces its direction tag; a pier\'s line says no facing (the map does not say which end is the shore)', () => {
    const spots = osmSpots({
      elements: [
        { type: 'node', id: 1, lat: 36.9, lon: -76.1, tags: { tourism: 'viewpoint', direction: 'WSW', name: 'Lookout' } },
        { type: 'way', id: 2, geometry: [{ lat: 36.85, lon: -75.98 }, { lat: 36.85, lon: -75.97 }], tags: { man_made: 'pier' } },
        { type: 'node', id: 3, lat: 36.8, lon: -76.0, tags: { leisure: 'slipway' } },
        { type: 'node', id: 4, lat: 36.8, lon: -76.0, tags: { amenity: 'cafe' } },
      ],
    })
    expect(spots.map((s) => s.name)).toEqual(['Lookout', 'Pier', 'Boat ramp'])
    expect(spots[0].facing).toBe(247.5)
    expect(spots[1].facing).toBeNull()
    expect(spots[2].facing).toBeNull()
    expect(directionOf('200-280')).toBe(240)
    expect(directionOf('290')).toBe(290)
  })
  it('a map spot on a starter spot is the same place: dropped', () => {
    const near = { ...STARTER_SPOTS[0], id: 'osm-x', at: { lat: STARTER_SPOTS[0].at.lat + 0.001, lon: STARTER_SPOTS[0].at.lon } }
    expect(dedupeSpots(STARTER_SPOTS, [near], 300, distanceMeters)).toEqual([])
  })
  it('the kept answers for 15 mi round Virginia Beach read', () => {
    const dir = 'tests/data/osm-2026-11-13'
    const files = readdirSync(dir).filter((f) => f.endsWith('.json'))
    expect(files.length).toBe(osmTiles(roundedCentre(VB), 15 * 1.609344).length)
    const spots = files.flatMap((f) => osmSpots(JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'))))
    expect(spots.length).toBeGreaterThan(0)
  })
})
