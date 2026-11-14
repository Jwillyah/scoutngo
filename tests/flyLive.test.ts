import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { coverThreshold, coveredShare, hash2 } from '../src/core/cloudField.ts'

/*
 * THE FLY SCREEN (Batch LIVE, Section 6; phone, 14 Nov). The checks a unit
 * test can make; the contact sheet shows the rest.
 */
const controls = readFileSync('src/components/FlyControls.tsx', 'utf8')
const css = readFileSync('src/styles/fly-live.css', 'utf8')

describe('the HUD row', () => {
  it('Land · Keep flying, one row: the question is the group\'s label, not a line that wraps', () => {
    const confirm = controls.slice(controls.indexOf('className="fly__confirm"'), controls.indexOf('Keep flying'))
    expect(confirm).not.toMatch(/<span>Land and keep this flight\?<\/span>/)
    expect(css).toMatch(/\.fly__confirm \{[^}]*flex-wrap: nowrap/)
  })
  it('the battery\'s minutes on one line', () => {
    expect(css).toMatch(/\.fly__batt \{[^}]*white-space: nowrap/)
  })
  it('the airspace line under the HUD row, then an amber chip after 5 s, a tap opens it again', () => {
    expect(controls).toMatch(/export const AIR_CHIP_MS = 5000/)
    expect(controls).toMatch(/setTimeout\(\(\) => setWarningOpen\(false\), AIR_CHIP_MS\)/)
    expect(controls).toMatch(/className="fly__airchip"[^>]*onClick=\{\(\) => setWarningOpen\(true\)\}/)
    expect(css).toMatch(/\.fly__airchip \{[^}]*background: var\(--caution\)/)
  })
})

describe('the animated world', () => {
  it('the ground: soft class weights and a sharper read, no if/else cut', () => {
    const look = readFileSync('src/three/world/look.ts', 'utf8')
    expect(look).toMatch(/texture2D\(map, vUv, 0\.5\)/)
    expect(look).toMatch(/float wVeg = smoothstep/)
    expect(look).not.toMatch(/if \(lum < 0\.16\) tone =/)
  })
  it('Real while there is signal: Animated by itself only offline', () => {
    expect(readFileSync('src/components/Clay3D.tsx', 'utf8')).toMatch(/chosenLook \?\? \(low && !online \? 'animated' : 'real'\)/)
  })
  it('no sine in the cloud and sky hashes (Apple GPUs band it); the cover still makes its share of cloud', () => {
    for (const f of ['src/three/world/clouds.ts', 'src/three/world/sky.ts']) expect(readFileSync(f, 'utf8')).not.toMatch(/return fract\(sin\(/)
    const xs = Array.from({ length: 2000 }, (_, i) => hash2(i * 1.37, i * 0.71))
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...xs)).toBeLessThan(1)
    for (const c of [0.2, 0.5, 0.8]) expect(Math.abs(coveredShare(coverThreshold(c)) - c)).toBeLessThan(0.12)
  })
})
