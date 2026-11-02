/*
 * Batch D, Section 5b: the pure parts of the flight-sim look. The pictures
 * themselves are checked in the browser (scripts/audit-3d-network.mjs).
 */
import { describe, expect, it } from 'vitest'
import { blueness, hazeColour, luminance, skyColours } from '../src/core/skyLook.ts'
import { WOODS_HEIGHT_M, WOODS_MAX, woodPoints } from '../src/three/world/woods.ts'
import { readFileSync } from 'node:fs'

const venue = { lat: 36.85, lon: -75.98 }

describe('atmospheric perspective', () => {
  it('by day the haze is bluer than the horizon and no darker', () => {
    const c = skyColours(30)
    const h = hazeColour(c)
    expect(blueness(h)).toBeGreaterThan(blueness(c.horizon))
    expect(luminance(h)).toBeLessThanOrEqual(luminance(c.horizon) + 1e-9)
    expect(luminance(h)).toBeGreaterThan(luminance(c.horizon) * 0.8)
  })
  it('at night the haze is the horizon itself', () => {
    const c = skyColours(-20)
    if (c.lightIntensity <= 0) expect(hazeColour(c)).toEqual([...c.horizon])
  })
})

describe('trees over the woods', () => {
  it('only inside the woodland, deterministic, at a nominal height', () => {
    /* Woodland east of the venue only. */
    const inWood = (_lat: number, lon: number) => lon > venue.lon
    const a = woodPoints(venue, inWood, 300, 9)
    const b = woodPoints(venue, inWood, 300, 9)
    expect(a.length).toBeGreaterThan(100)
    expect(a).toEqual(b)
    expect(a.every((p) => p.lon > venue.lon)).toBe(true)
    expect(a.every((p) => p.h >= WOODS_HEIGHT_M * 0.75 && p.h <= WOODS_HEIGHT_M * 1.25)).toBe(true)
  })
  it('none where the map has no woods, and never more than the cap', () => {
    expect(woodPoints(venue, () => false)).toEqual([])
    expect(woodPoints(venue, () => true).length).toBeLessThanOrEqual(WOODS_MAX)
  })
  it('the 3D view says they are illustrative', () => {
    const src = readFileSync('src/components/Clay3D.tsx', 'utf8')
    expect(src).toContain('Trees in woods illustrative')
    expect(readFileSync('src/three/world/woods.ts', 'utf8')).toContain("WOODS_NOTE = 'Trees in woods illustrative'")
  })
})

describe('water mirrors the clouds', () => {
  it('the water reads the same cloud field as the slabs', () => {
    const water = readFileSync('src/three/world/water.ts', 'utf8')
    expect(water).toContain('CLOUD_NOISE_GLSL')
    expect(water).toMatch(/fbm\(q\) - cloudThresh/)
  })
})

describe('sky arc pills', () => {
  it('are the same size on screen at a narrow and a wide field of view', async () => {
    const { PILL_PX, pillScale } = await import('../src/three/world/arcs.ts')
    for (const fovDeg of [30, 60, 117]) {
      const p11 = 1 / Math.tan((fovDeg * Math.PI) / 360)
      const [, sy] = pillScale(844, p11)
      /* What three.js draws for a sprite with sizeAttenuation false: scale x P[1][1], in clip units of half the view. */
      expect((sy * p11 * 844) / 2).toBeCloseTo(PILL_PX.h, 6)
    }
    /* The old fixed scale, 0.034, at 117 degrees: under 10 px. */
    expect((0.034 * (1 / Math.tan((117 * Math.PI) / 360)) * 844) / 2).toBeLessThan(10)
  })
})
