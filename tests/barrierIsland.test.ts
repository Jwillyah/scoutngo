import { describe, expect, it } from 'vitest'
import { facingByCircle, oceanSide, opensOnSea } from '../src/core/coastFacing.ts'
import type { LatLon } from '../src/core/geo.ts'

/*
 * A BARRIER ISLAND, DRAWN (Batch Beach, Section 1; Rodanthe, 10 Nov). The
 * Atlantic east of -75.462, the island from there to -75.472, Pamlico Sound
 * west of it out to the mainland at -76.05. The map's ocean polygons hold
 * the sound and the Atlantic alike: both are "sea" here.
 */
const sea = (p: LatLon) => p.lon > -75.462 || (p.lon < -75.472 && p.lon > -76.05)
const SOUND_SIDE: LatLon = { lat: 35.59, lon: -75.4705 }

describe('the ocean side of a barrier island', () => {
  it('the pin by the sound reads west by the circle, and west does not open on the sea', () => {
    const f = facingByCircle(SOUND_SIDE, sea) as number
    expect(Math.abs(f - 270)).toBeLessThan(40)
    expect(opensOnSea(SOUND_SIDE, f, sea)).toBe(false)
    expect(opensOnSea(SOUND_SIDE, 90, sea)).toBe(true)
  })
  it('across the island, the ocean beach: east of the pin, on land, at the water', () => {
    const across = oceanSide(SOUND_SIDE, 270, sea, sea)
    expect(across).not.toBeNull()
    expect(across?.bearing).toBe(90)
    expect(sea(across!.beachAt)).toBe(false)
    expect(across!.beachAt.lon).toBeGreaterThan(SOUND_SIDE.lon)
    expect(across!.beachAt.lon).toBeGreaterThan(-75.4625)
  })
  it('a pin in the sound itself walks onto the island first, then to the ocean', () => {
    const inSound = { lat: 35.59, lon: -75.474 }
    const across = oceanSide(inSound, 270, sea, sea)
    expect(across?.bearing).toBe(90)
    expect(sea(across!.beachAt)).toBe(false)
  })
  it('a sound with no ocean within reach stays a sound: none', () => {
    const wideIsland = (p: LatLon) => p.lon > -75.2 || (p.lon < -75.472 && p.lon > -76.05)
    expect(oceanSide(SOUND_SIDE, 270, wideIsland, wideIsland)).toBeNull()
  })
})

describe('the 10 Nov Rodanthe pin, on the recorded coastline (scripts/gate/tiles)', () => {
  it('reads the island, the ocean beach east of it, and a facing to the open Atlantic', async () => {
    const { readFileSync, existsSync } = await import('node:fs')
    const { setVectorLoader } = await import('../src/lib/vectorTiles.ts')
    const { coastFacing } = await import('../src/lib/coast.ts')
    setVectorLoader(async (url) => {
      const m = /\/(\d+)\/(\d+)\/(\d+)\.pbf/.exec(url)
      const f = m === null ? '' : `scripts/gate/tiles/openfreemap/${m[1]}/${m[2]}/${m[3]}.pbf`
      return existsSync(f) ? (new Uint8Array(readFileSync(f)).buffer as ArrayBuffer) : null
    })
    try {
      const f = await coastFacing({ lat: 35.5935, lon: -75.4679 })
      expect(typeof f).toBe('object')
      if (typeof f !== 'object') return
      expect(f.side).toBe('island')
      expect(f.beachAt!.lon).toBeGreaterThan(-75.4679)
      expect(Math.abs(f.facing - 85)).toBeLessThan(25)
    } finally {
      setVectorLoader(null)
    }
  })
})
