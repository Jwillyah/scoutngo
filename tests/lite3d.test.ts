import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BUDGET_IOS_BYTES, earnedStepUp, keptStepped, LITE_TILE_CACHE, quality3D, STEP_UP_AFTER_MS } from '../src/core/lite3d.ts'
import { canvasBytes, gpuBytes, memoryLine, overBudget, textureBytes } from '../src/core/gpuBudget.ts'
import { debugMemoryLine } from '../src/lib/quality3d.ts'

/*
 * Batch FIX, Section 0: 3D and Fly crashed the iPhone (16 Nov, 7:01 and 8:00
 * PM) while the Mac's WebKit passed. Lite on iOS, one renderer, a budget we
 * count ourselves. The browser half: scripts/audit-3d-five.mjs (ten opens of
 * 3D and ten of Fly, alternating, in WebKit as an iPhone 13).
 */
describe('lite 3D on an iPhone', () => {
  it('starts at 1024 px, pixel ratio 1.5, no shadows, half the terrain segments, 64 tiles kept', () => {
    const q = quality3D(true, false)
    expect(q).toMatchObject({ level: 'lite', nearPx: 1024, finePx: 1024, maxDpr: 1.5, shadows: false, ringSegments: 16, nearSegments: 64, pictureCache: 64, terrainCache: 64 })
    expect(LITE_TILE_CACHE).toBe(64)
  })
  it('stepped up, only the near picture grows (2048); the rest stays lite', () => {
    expect(quality3D(true, true)).toMatchObject({ level: 'stepped', nearPx: 2048, finePx: 1024, maxDpr: 1.5, shadows: false, pictureCache: 64 })
  })
  it('a desktop or Android keeps the full view', () => {
    expect(quality3D(false, false)).toMatchObject({ level: 'full', nearPx: 4096, maxDpr: 2, shadows: true, ringSegments: 32, nearSegments: 128 })
    expect(quality3D(false, true).level).toBe('full')
  })
  it('only a kept "stepped" steps up; nothing kept or blocked storage is lite', () => {
    expect(keptStepped('stepped')).toBe(true)
    expect(keptStepped('lite')).toBe(false)
    expect(keptStepped(null)).toBe(false)
  })
})

describe('the step up is earned: 20 s at 30 fps with no context loss', () => {
  const quick = Array.from({ length: 300 }, () => 12)
  it('earned after 20 s of quick frames', () => expect(earnedStepUp(STEP_UP_AFTER_MS, quick, false)).toBe(true))
  it('not before 20 s', () => expect(earnedStepUp(STEP_UP_AFTER_MS - 1, quick, false)).toBe(false))
  it('never after a context loss', () => expect(earnedStepUp(60_000, quick, true)).toBe(false))
  it('not on too few frames', () => expect(earnedStepUp(60_000, quick.slice(0, 59), false)).toBe(false))
  it('not when more than one frame in ten is slower than 30 fps (33.3 ms)', () => {
    const slow = [...Array.from({ length: 80 }, () => 12), ...Array.from({ length: 20 }, () => 40)]
    expect(earnedStepUp(30_000, slow, false)).toBe(false)
    const fine = [...Array.from({ length: 95 }, () => 30), ...Array.from({ length: 5 }, () => 80)]
    expect(earnedStepUp(30_000, fine, false)).toBe(true)
  })
})

describe('the GPU budget, by our own count', () => {
  it('a 1024 texture with mipmaps is 5.6 MB; a 2048 one without is 16.8 MB', () => {
    expect(textureBytes({ width: 1024, height: 1024, mipmaps: true })).toBe(5_592_405)
    expect(textureBytes({ width: 2048, height: 2048, mipmaps: false })).toBe(16_777_216)
  })
  it('the canvas: an iPhone 13 screen at 1.5 with 4x antialias is about 27 MB (585 x 1266 px)', () => {
    expect(Math.round(canvasBytes({ width: 390, height: 844, dpr: 1.5, samples: 4 }) / 1e6)).toBe(27)
  })
  it('adds textures, buffers, the shadow map and the canvas', () => {
    const b = gpuBytes({ textures: [{ width: 256, height: 256, mipmaps: false }], buffers: [1000, 2000], shadowPx: 1024, canvas: { width: 100, height: 100, dpr: 1, samples: 1 } })
    expect(b).toBe(262_144 + 3000 + 1024 * 1024 * 4 + 100 * 100 * 8)
  })
  it('says "3D memory 82 MB of 150" on an iPhone, no cap elsewhere', () => {
    expect(memoryLine(82e6, BUDGET_IOS_BYTES)).toBe('3D memory 82 MB of 150')
    expect(memoryLine(82e6, null)).toBe('3D memory 82 MB')
    expect(debugMemoryLine({ bytes: 82e6, cap: BUDGET_IOS_BYTES, level: 'lite', at: 0 })).toBe('3D memory 82 MB of 150 · lite')
    expect(debugMemoryLine(null)).toBe('3D memory: not opened since the app started')
  })
  it('over 150 MB is over; no cap is never over', () => {
    expect(overBudget(150e6 + 1, BUDGET_IOS_BYTES)).toBe(true)
    expect(overBudget(150e6, BUDGET_IOS_BYTES)).toBe(false)
    expect(overBudget(1e12, null)).toBe(false)
  })
})

describe('one renderer, everything freed on leave (the source)', () => {
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  const ALL = ['src/three/world/scene.ts', 'src/three/skyThumb.ts', 'src/three/world/sharedRenderer.ts', 'src/components/ComparePhoto.tsx', 'src/components/Clay3D.tsx']
  it('only sharedRenderer.ts makes a WebGLRenderer', () => {
    for (const f of ALL) {
      const n = (strip(readFileSync(f, 'utf8')).match(/new THREE\.WebGLRenderer\(/g) ?? []).length
      expect([f, n]).toEqual([f, f.endsWith('sharedRenderer.ts') ? 1 : 0])
    }
  })
  it('the scene borrows it, frees its whole tree and the shadow map on leave, and hands it back', () => {
    const scene = strip(readFileSync('src/three/world/scene.ts', 'utf8'))
    expect(scene).toMatch(/borrowRenderer\(/)
    const leave = scene.slice(scene.indexOf('destroyNow = () => {'), scene.indexOf('return {\n    whenShown'))
    for (const step of ['ground.dispose()', 'disposeTree(scene)', 'sun.shadow.map?.dispose()', 'borrowed.release()']) expect(leave).toContain(step)
    expect(leave).not.toContain('renderer.dispose()')
  })
  it('Fly is built from the 2D map: a 3D map up is closed first', () => {
    const plan = readFileSync('src/components/PlanMode.tsx', 'utf8')
    expect(plan).toMatch(/const over3D = threeD\s*if \(over3D\) \{[\s\S]{0,120}setThreeD\(false\)\s*setTimeout\(\(\) => setThreeD\(true\), 0\)/)
  })
})
