import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { placeClouds, placeCloudsForSky, skyShareSeen } from '../src/core/clouds.ts'

/*
 * THE FLY SCREEN, 29 Oct, cheap fixes. The screen as drawn is checked by
 * scripts/audit-fly.mjs; the clouds are arithmetic, so they are here.
 */
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
const CINEMA = strip(readFileSync('src/three/cinema.ts', 'utf8'))
const FLY = strip(readFileSync('src/components/FlyControls.tsx', 'utf8'))

describe('clouds: the forecast\'s share of the sky, no more', () => {
  it('37% does not fill the sky: the band a flying camera sees is at most 37% covered', () => {
    const seeds = [1, 7, 42, 2026, 99_991]
    for (const seed of seeds) {
      const clouds = placeCloudsForSky({ low: 37, mid: null, high: null }, seed)
      expect(skyShareSeen(clouds, 'low')).toBeLessThanOrEqual(0.37)
      /* And not thinned to nothing: a third of the sky still has cloud in it. */
      expect(skyShareSeen(clouds, 'low')).toBeGreaterThan(0.3)
    }
  })

  it('placed by footprint alone, the same 37% covered more than that: the thinning is doing the work', () => {
    expect(skyShareSeen(placeClouds({ low: 37, mid: null, high: null }, 7), 'low')).toBeGreaterThan(0.4)
  })

  it('more cover, more cloud: the count follows the forecast', () => {
    const n = (low: number) => placeCloudsForSky({ low, mid: null, high: null }, 7).length
    expect(n(0)).toBe(0)
    expect(n(10)).toBeLessThan(n(37))
    expect(n(37)).toBeLessThan(n(80))
  })

  it('the cloud sprite is an SVG image, never a canvas WebKit adds noise to when it is read back', async () => {
    const { cloudSprite } = await import('../src/three/cinema.ts')
    expect(cloudSprite()).toMatch(/^data:image\/svg\+xml/)
    expect(CINEMA).not.toMatch(/createElement\('canvas'\)|getContext\('2d'\)/)
  })

  it('no per-pixel noise: the grain stage is gone, and the clouds are the thinned ones', () => {
    expect(CINEMA).not.toMatch(/GRAIN_GLSL|grain/i)
    expect(CINEMA).toContain('placeCloudsForSky(inputs.cover, inputs.seed)')
  })
})

describe('the fly screen says one thing at a time', () => {
  it('an alert, else the hint, else nothing: one element, never two', () => {
    expect(FLY).toMatch(/\{alert !== null \? \(\s*<p className="fly__alert"[\s\S]*?\) : portrait && !hintGone \? \(\s*<button type="button" className="fly__rotate"/)
    expect(FLY.match(/className="fly__alert"/g)).toHaveLength(1)
  })

  it('the hint goes by itself', () => {
    expect(FLY).toMatch(/export const HINT_MS = 4000/)
    expect(FLY).toMatch(/setTimeout\(\(\) => setHintGone\(true\), HINT_MS\)/)
  })

  it('the compass letters are drawn level, and the wind is not drawn inside the ring', () => {
    expect(FLY).not.toMatch(/fly__cardinal[^>]*transform=/)
    expect(FLY).not.toContain('fly__windtext')
  })
})
