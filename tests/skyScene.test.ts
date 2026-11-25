import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { overWater, sceneGround, sceneLayerLabel, skyScene, sceneTone, type SkySceneIn } from '../src/core/skyScene.ts'

/*
 * BATCH SIMPLE-3, SECTION 3.2: THE SKY SCENE (mockups Sky_Sunrise2,
 * Sky_Sunset2), from the computed state only. Atlantic Park Surf faces about
 * ESE (100°); the 21 Nov sunrise is at about 115°, the sunset at about 242°.
 */
const base: SkySceneIn = {
  kind: 'sunrise',
  sunAzDeg: 115,
  sunAltDeg: -0.8,
  call: 'Go',
  layers: [
    { layer: 'high', baseFt: 8000 * 3.28084, cover: 40, lit: true, measured: false, by: null },
    { layer: 'mid', baseFt: 8000, cover: 30, lit: true, measured: true, by: 'KNTU' },
  ],
  gap: 'open',
  fog: { level: 'high', kind: 'sea' },
  facingDeg: 100,
  miles: true,
}

describe('each layer at its height, named from it', () => {
  it('a deck at 8,000 ft is "mid", never "high cirrus 8 km"; the models\' high layer is "~26,000 ft high"', () => {
    const s = skyScene(base)!
    expect(s.layers.map((l) => l.label)).toEqual(['~26,000 ft high', '8,000 ft mid'])
    expect(s.layers.map((l) => l.name)).toEqual(['high', 'mid'])
    expect(s.layers.every((l) => !/cirrus|km/.test(l.label))).toBe(true)
    /* Higher is higher on the picture. */
    expect(s.layers[0].y).toBeLessThan(s.layers[1].y)
  })
  it('named from the height, not the band: a "high" model layer measured at 8,000 ft is mid', () => {
    expect(sceneLayerLabel({ baseFt: 8000, measured: true }, true)).toBe('8,000 ft mid')
    expect(sceneLayerLabel({ baseFt: 4000, measured: false }, true)).toBe('~4,000 ft low')
    expect(sceneLayerLabel({ baseFt: 8000, measured: true }, false)).toBe('2.4 km mid')
  })
  it('a layer with under 10% cover is not drawn; lit undersides only where the call lights it', () => {
    const s = skyScene({ ...base, layers: [{ layer: 'low', baseFt: 3000, cover: 5, lit: false, measured: false, by: null }, { layer: 'mid', baseFt: 12000, cover: 60, lit: false, measured: false, by: null }] })!
    expect(s.layers).toHaveLength(1)
    expect(s.layers[0].lit).toBe(false)
    expect(s.layers[0].puffs).toHaveLength(3)
  })
})

describe('fog, sun, water and land', () => {
  it('a fog band only when the fog risk at the event is high', () => {
    expect(skyScene(base)!.fog?.label).toBe('fog')
    expect(skyScene({ ...base, fog: { level: 'moderate', kind: 'radiation' } })!.fog).toBeNull()
    expect(skyScene({ ...base, fog: null })!.fog).toBeNull()
  })
  it('water where the beach faces, land behind it; inland all land', () => {
    expect(overWater(115, 100)).toBe(true)
    expect(overWater(242, 100)).toBe(false)
    const sunrise = skyScene(base)!
    expect(sunrise.ground.every((g) => g.kind === 'water')).toBe(true)
    expect(sunrise.glint).toBe(true)
    const sunset = skyScene({ ...base, kind: 'sunset', sunAzDeg: 242 })!
    /* Behind the beach: land under the sun, the water's edge only at the far left (S, within 90° of ESE). */
    const land = sunset.ground.filter((g) => g.kind === 'land').reduce((a, g) => a + g.x1 - g.x0, 0)
    expect(land).toBeGreaterThan(0.85)
    expect(sunset.ground.find((g) => g.x0 <= 0.5 && g.x1 > 0.5)?.kind).toBe('land')
    expect(sunset.glint).toBe(false)
    /* A sunrise looking along the coast: some of each, in runs that tile the width. */
    const along = sceneGround(115 + 90 - 67.5, 100)
    expect(new Set(along.map((g) => g.kind))).toEqual(new Set(['water', 'land']))
    expect(along[0].x0).toBe(0)
    expect(along[along.length - 1].x1).toBe(1)
    expect(skyScene({ ...base, facingDeg: null })!.ground.every((g) => g.kind === 'land')).toBe(true)
  })
  it('the sun at its real azimuth: centre of the picture, its compass point under it', () => {
    const s = skyScene(base)!
    expect(s.sun.x).toBe(0.5)
    expect(s.sun.label).toBe('ESE')
    expect(s.ticks.map((t) => t.label)).toContain('ESE')
  })
  it('no azimuth, no picture', () => {
    expect(skyScene({ ...base, sunAzDeg: null })).toBeNull()
  })
})

describe('the tone and the one sentence', () => {
  it('the tone is the call\'s', () => {
    expect([sceneTone('Go'), sceneTone('Maybe'), sceneTone('Skip'), sceneTone(null)]).toEqual(['warm', 'soft', 'grey', 'grey'])
  })
  it('says which layers light, in order, the gap, the fog', () => {
    expect(skyScene(base)!.sentence).toBe('The high cloud and the mid deck are lit from under through a gap toward the sun; fog sits low on the water, so the sun comes up soft.')
    expect(skyScene({ ...base, kind: 'sunset', sunAzDeg: 242, fog: null, gap: null })!.sentence).toBe('The mid deck and the high cloud are lit from under.')
  })
  it('nothing lit, nothing known: says so, never a promise', () => {
    expect(skyScene({ ...base, call: 'Skip', fog: null, gap: 'closed', layers: [{ layer: 'low', baseFt: 2500, cover: 95, lit: false, measured: true, by: 'KNTU' }] })!.sentence).toBe('The low deck is there, but the call does not see it lit: no gap toward the sun.')
    expect(skyScene({ ...base, call: null, fog: null, layers: [] })!.sentence).toBe('The forecast did not say.')
    expect(skyScene({ ...base, call: 'Skip', fog: null, layers: [] })!.sentence).toBe('No cloud to light.')
  })
})

/* Batch SIMPLE-3, Section 2b.3: the Night tab's moon (src/components/MoonDrawing.tsx), moon-coloured. */
describe('the moon drawing\'s colours', () => {
  it('its colours are the moon tokens, not the night violet', () => {
    const css = readFileSync('src/styles/sky.css', 'utf8')
    expect(css).toMatch(/\.calm\.mdraw \.mdraw__lit \{\s*fill: var\(--moon-face\)/)
    expect(css).toMatch(/\.calm\.mdraw \.mdraw__mare \{\s*fill: var\(--moon-mare\)/)
    expect(readFileSync('src/styles/tokens.css', 'utf8')).toMatch(/--moon-face: #[0-9a-f]{6}/)
  })
})
