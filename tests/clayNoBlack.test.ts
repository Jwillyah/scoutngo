import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
 * THE 3D VIEW NEVER GOES BLACK (Batch I, Section 4). The browser half is
 * scripts/audit-3d-context.mjs (a forced context loss and a throwing frame
 * in WebKit); this holds the source.
 */
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
const SCENE = strip(readFileSync('src/three/world/scene.ts', 'utf8'))
const CLAY = strip(readFileSync('src/components/Clay3D.tsx', 'utf8'))

describe('no black frame from the pixel ratio', () => {
  it('sets the pixel ratio only at the start and at the top of a frame, before it is drawn, never after', () => {
    const calls = SCENE.split('\n').filter((l) => /setPixelRatio\(/.test(l))
    expect(calls).toHaveLength(2)
    const draw = SCENE.slice(SCENE.indexOf('const draw = () => {'), SCENE.indexOf('renderer.render(scene, camera)'))
    expect(draw).toMatch(/if \(wantScale !== scale\) \{[\s\S]*renderer\.setPixelRatio\(scale\)/)
    const after = SCENE.slice(SCENE.indexOf('renderer.render(scene, camera)'), SCENE.indexOf('let lost = false'))
    expect(after).not.toMatch(/setPixelRatio/)
  })

  it('never more than 2', () => {
    expect(SCENE).toMatch(/const maxScale = Math\.min\(2, window\.devicePixelRatio \|\| 1\)/)
  })
})

describe('context lost, and a frame that throws', () => {
  it('handles webglcontextlost (prevents the default) and webglcontextrestored', () => {
    expect(SCENE).toMatch(/addEventListener\('webglcontextlost', onLost/)
    expect(SCENE).toMatch(/addEventListener\('webglcontextrestored', onRestored/)
    expect(SCENE).toMatch(/const onLost = \(e: Event\) => \{\s*e\.preventDefault\(\)/)
  })

  it('a throw in the frame loop is caught and said', () => {
    expect(SCENE).toMatch(/try \{\s*draw\(\)\s*\} catch \(error\) \{[\s\S]{0,200}trouble\.error\?\./)
  })

  it('Clay3D rebuilds on restore, or after REBUILD_AFTER_MS, and has an error boundary with Copy error and Try again', () => {
    expect(CLAY).toMatch(/restored: \(\) => \{[\s\S]{0,200}setBuild\(\(n\) => n \+ 1\)/)
    expect(CLAY).toMatch(/setTimeout\(\(\) => setBuild\(\(n\) => n \+ 1\), REBUILD_AFTER_MS\)/)
    expect(CLAY).toMatch(/class Clay3DBoundary extends Component/)
    expect(CLAY).toContain("{copied ? 'Copied' : 'Copy error'}")
    expect(CLAY).toContain('Try again')
  })
})
