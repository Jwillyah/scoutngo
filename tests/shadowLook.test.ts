import { describe, expect, it } from 'vitest'
import { shadowMap } from '../src/core/shadowMap.ts'
import { LOW_SUN_DEG, shadowCollection, shadowTint } from '../src/lib/shadowLayer.ts'

/* Batch Polish, Section 5: the shadows follow the light. A fixture building, not a real one. */
const box = { id: 'b', ring: [[-75.97, 36.84], [-75.9698, 36.84], [-75.9698, 36.8402], [-75.97, 36.8402]] as [number, number][], heightMeters: 20 }
const at = { lat: 36.84, lon: -75.97 }

describe('shadows that follow the light', () => {
  it('the tint: warm low in the sky, cool grey high, between in between', () => {
    expect(shadowTint(5)).toBe('rgb(58, 38, 24)')
    expect(shadowTint(10)).toBe('rgb(58, 38, 24)')
    expect(shadowTint(60)).toBe('rgb(28, 34, 48)')
    expect(shadowTint(20)).toBe('rgb(43, 36, 36)')
  })
  it('under 2° of sun no building shadows are drawn; the subject’s own line stays', () => {
    const low = shadowMap([box], { azimuth: 250, altitude: LOW_SUN_DEG - 0.5 })
    const c = shadowCollection(low, { at, lengthMeters: 30, bearing: 70 }, LOW_SUN_DEG - 0.5)
    expect(c.features.filter((f) => f.properties?.kind === 'building')).toHaveLength(0)
    expect(c.features.filter((f) => f.properties?.kind === 'subject')).toHaveLength(1)
  })
  it('over it, each building’s shadow carries the tint of its sun', () => {
    const high = shadowMap([box], { azimuth: 200, altitude: 40 })
    const c = shadowCollection(high, null, 40)
    expect(c.features).toHaveLength(1)
    expect(c.features[0].properties?.tint).toBe(shadowTint(40))
  })
})

describe('real shadows, painted (Batch Polish 2, Section 3)', () => {
  it('a shadow fades with distance from its building, gone at 6x its height', async () => {
    const { drawnLength, fadeLength, fadeAt, FADE_HEIGHTS } = await import('../src/core/shadowFade.ts')
    expect(FADE_HEIGHTS).toBe(6)
    expect(fadeLength(20)).toBe(120)
    /* Sun at 40°: a 20 m building's shadow is 24 m, drawn all the way, its end still dark (0.94 of it). */
    expect(drawnLength(24, 20)).toBe(24)
    expect(fadeAt(24, fadeLength(20))).toBeCloseTo(0.94, 2)
    /* Sun at 3°: 382 m long, drawn to 120 m. */
    expect(drawnLength(382, 20)).toBe(120)
    expect(fadeAt(0, 120)).toBe(1)
    expect(fadeAt(60, 120)).toBeCloseTo(0.85, 2)
    expect(fadeAt(90, 120)).toBeCloseTo(0.425, 2)
    expect(fadeAt(130, 120)).toBe(0)
  })
  it('the raster: a quarter metre a pixel or coarser, never over its pixels across', async () => {
    const { rasterScale } = await import('../src/core/shadowFade.ts')
    expect(rasterScale(200)).toBe(0.25)
    expect(rasterScale(1000, 2048)).toBeCloseTo(0.488, 3)
    expect(rasterScale(2048)).toBe(2)
  })
  it('the buildings are painted, not features: under 2° nothing, over it the shadows in the light’s tint', async () => {
    const { shadowPaintFor } = await import('../src/lib/shadowLayer.ts')
    const high = shadowMap([box], { azimuth: 200, altitude: 40 })
    expect(shadowPaintFor(high, 40)).toEqual({ map: high, tint: shadowTint(40) })
    expect(shadowPaintFor(high, LOW_SUN_DEG - 0.5).map).toBeNull()
    expect(shadowCollection(high, { at, lengthMeters: 30, bearing: 70 }, 40, false).features.map((f) => f.properties?.kind)).toEqual(['subject'])
  })
  it('the shadow carries its building’s height', () => {
    const high = shadowMap([box], { azimuth: 200, altitude: 40 })
    expect(high.status === 'ok' && high.shadows[0].heightMeters).toBe(20)
  })
})

describe('a scrub sweeps each minute once (Batch Polish 2, Section 3, part 2)', () => {
  it('the same footprints and the same sun give the same answer, not a second sweep; another sun, a new one', () => {
    const list = [box]
    const a = shadowMap(list, { azimuth: 200, altitude: 30 })
    expect(shadowMap(list, { azimuth: 200, altitude: 30 })).toBe(a)
    const b = shadowMap(list, { azimuth: 201, altitude: 30 })
    expect(b).not.toBe(a)
  })
  it('the footprint moved by one offset lands where the geodesic puts each corner, to the millimetre', async () => {
    const { destinationPoint, distanceMeters } = await import('../src/core/geo.ts')
    const m = shadowMap([{ ...box }], { azimuth: 250, altitude: 5 })
    if (m.status !== 'ok') throw new Error('no shadow')
    const s = m.shadows[0]
    const ring = box.ring
    for (let i = 0; i < ring.length; i += 1) {
      const want = destinationPoint({ lat: ring[i][1], lon: ring[i][0] }, s.bearing, s.lengthMeters)
      const got = s.parts[1][i]
      expect(distanceMeters(want, { lat: got[1], lon: got[0] })).toBeLessThan(0.001)
    }
  })
})
