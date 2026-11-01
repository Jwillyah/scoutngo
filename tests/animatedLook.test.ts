import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
 * THE ANIMATED LOOK IS DRAWN, NOT FILTERED (Batch D, Section 6). On 1 Nov
 * "Animated" was the photo posterised and blurred. No pass in the 3D scene
 * works on the finished picture: the look is the materials' own.
 */
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
const files = readdirSync('src/three/world').filter((f) => f.endsWith('.ts')).map((f) => strip(readFileSync(`src/three/world/${f}`, 'utf8')))

describe('the Animated look', () => {
  it('has no post-processing pass, no posterise, no blur', () => {
    for (const f of files) {
      expect(f).not.toMatch(/EffectComposer|RenderPass|ShaderPass|posteri[sz]e|PostProcess|GaussianBlur/i)
    }
  })
  it('is the materials: flat-shaded ground, painted water, outlined flat buildings', () => {
    const look = strip(readFileSync('src/three/world/look.ts', 'utf8'))
    expect(look).toMatch(/dFdx\(vWorld\)/)
    expect(strip(readFileSync('src/three/world/water.ts', 'utf8'))).toMatch(/toon > 0\.5/)
    const b = strip(readFileSync('src/three/world/buildings.ts', 'utf8'))
    expect(b).toMatch(/EdgesGeometry/)
    expect(b).toMatch(/flatShading: true/)
  })
})
