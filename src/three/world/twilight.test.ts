import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { ambientSky, warmLobe, hueDeg, skyAt, skyColours, skyToward, twilightShare } from '../../core/skyLook.ts'
import { createSky } from './sky.ts'

/*
 * THE TWILIGHT SKY AND THE SUN SHAFTS (Batch F, Section 2), from the 2 Nov
 * photo comparison at the VB pier: the photo's pre-sunrise sky looking north
 * was peach and pink, the 3D sky mauve. measurements/2026-11-02-twilight-walls.md
 * has the screenshots' numbers.
 */
describe('the twilight sky', () => {
  it('a degree before sunrise, looking 110 degrees off the sun, a few degrees up: peach, not mauve', () => {
    const c = skyColours(-1)
    const now = hueDeg(skyToward(c, -1, 4, Math.cos((110 * Math.PI) / 180)))
    expect(now).toBeGreaterThan(10)
    expect(now).toBeLessThan(40)
    /* What it was: the old blend, toward magenta. */
    expect(hueDeg(skyAt(c, 4))).toBeLessThan(10)
  })

  it('warmest toward the sun, never under half of that away from it', () => {
    const c = skyColours(0)
    const toward = skyToward(c, 0, 2, 1)
    const away = skyToward(c, 0, 2, -1)
    expect(toward[0]).toBeGreaterThan(away[0])
    expect(warmLobe(-1) / warmLobe(1)).toBeCloseTo(0.45, 9)
    expect(warmLobe(0)).toBeGreaterThan(0.55)
  })

  it('no twilight band at noon or in the night', () => {
    expect(twilightShare(40)).toBe(0)
    expect(twilightShare(-15)).toBe(0)
    const c = skyColours(40)
    expect(skyToward(c, 40, 3, 1)).toEqual(skyToward(c, 40, 3, -1))
  })

  it('a wall in twilight sees the warm band, not the blue zenith; by day the old light', () => {
    const dawn = ambientSky(skyColours(-1), -1)
    expect(dawn[0]).toBeGreaterThan(dawn[2])
    const day = ambientSky(skyColours(20), 20)
    const z = skyColours(20).zenith
    expect(day).toEqual([z[0] * 3 + 0.1, z[1] * 3 + 0.1, z[2] * 3 + 0.1])
    /* 8 AM at the pier (sun about 6 degrees up): no extra wall light, so the walls stay under the sky. */
    const six = skyColours(6).zenith
    expect(ambientSky(skyColours(6), 6)).toEqual([six[0] * 3 + 0.1, six[1] * 3 + 0.1, six[2] * 3 + 0.1])
  })
})

describe('sun shafts', () => {
  const cam = new THREE.Vector3(0, 100, 0)
  const layer = { base: 1500, thresh: 0.5, scale: 2000, stretch: 1, drift: new THREE.Vector2(), colour: new THREE.Color(1, 1, 1) }
  it('on with a cloud layer on High, off with none (Battery passes null)', () => {
    const sky = createSky()
    sky.setShafts(layer, cam)
    expect(sky.shaftsOn()).toBe(true)
    sky.setShafts(null, cam)
    expect(sky.shaftsOn()).toBe(false)
  })
  it('the shader looks along the arc to the sun through the clouds, only near the sun', () => {
    const sky = createSky()
    const src = (sky.mesh.material as THREE.ShaderMaterial).fragmentShader
    expect(src).toContain('coverToward')
    expect(src).toMatch(/shaftsOn > 0\.5/)
    expect(src).toMatch(/for \(int i = 0; i < 12; i\+\+\)/)
  })
})
