import { describe, expect, it } from 'vitest'
import { blueness, luminance, skyAt, skyColours } from '../src/core/skyLook.ts'

/*
 * THE SKY AT THREE SUN HEIGHTS (Batch D, Section 1): the 3D sky was black at
 * 8 AM with the sun up (1 Nov). Linear colours, before tone mapping.
 */
describe('the sky from the sun', () => {
  it('at 30° up: a blue day sky, bright, bluer at the zenith than at the horizon', () => {
    const c = skyColours(30)
    expect(luminance(skyAt(c, 60))).toBeGreaterThan(0.15)
    expect(blueness(c.zenith)).toBeGreaterThan(4)
    expect(blueness(skyAt(c, 10))).toBeGreaterThan(1)
    expect(c.stars).toBe(0)
  })

  it('at 2° up: a warm horizon under a blue zenith', () => {
    const c = skyColours(2)
    expect(c.horizon[0]).toBeGreaterThan(c.horizon[2])
    expect(blueness(c.zenith)).toBeGreaterThan(2)
    expect(luminance(c.horizon)).toBeGreaterThan(0.2)
    expect(c.lightIntensity).toBeGreaterThan(0.5)
  })

  it('at -6°: deep blue twilight, the stars starting, the sun no light', () => {
    const c = skyColours(-6)
    expect(luminance(c.zenith)).toBeGreaterThan(0.005)
    expect(luminance(c.zenith)).toBeLessThan(0.08)
    expect(c.stars).toBeGreaterThan(0)
    expect(c.lightIntensity).toBe(0)
  })

  it('never black while the sun is above -4°', () => {
    for (let h = -4; h <= 90; h += 0.5) {
      const c = skyColours(h)
      expect(luminance(skyAt(c, 45)), `at ${h}°`).toBeGreaterThan(0.03)
    }
  })

  it('8 AM at Wrightsville (the sun about 13° up) is a day sky', () => {
    const c = skyColours(13)
    expect(luminance(skyAt(c, 45))).toBeGreaterThan(0.15)
    expect(blueness(skyAt(c, 45))).toBeGreaterThan(2)
  })
})
