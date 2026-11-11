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
