import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FLY_LOAD_MS, FLY_NO_GRAPHICS, flyGate } from '../src/lib/clayStatus.ts'

/*
 * FLY DOES NOT WAIT ON THE WHOLE 3D VIEW (Batch 3D, Section 1.3; 17 Nov, an
 * iPhone 13 Pro Max: "Not open in 3 s · Keep waiting / Back"). Fly opened
 * only once the 3D view was `shown`, every near ground picture in, up to
 * 30 s, against a 3 s limit; with no graphics at all it was the same 3 s
 * card. Here: Fly's own start, and graphics refused said at once.
 */
afterEach(() => {
  vi.doUnmock('three')
  vi.unstubAllGlobals()
  vi.resetModules()
})

const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

describe("Fly's own start", () => {
  /* Batch SIMPLE-1, Section 4: the first USEFUL frame (`shown`: the near square and its first ring), not a first frame of nothing. */
  it('opens once the first useful frame is shown and the take-off ground is read, not on the whole view', () => {
    expect(flyGate({ failed: null, lost: false, shown: true, groundRead: true })).toEqual({ kind: 'open' })
    expect(flyGate({ failed: null, lost: false, shown: false, groundRead: true })).toEqual({ kind: 'waiting' })
    expect(flyGate({ failed: null, lost: false, shown: true, groundRead: false })).toEqual({ kind: 'waiting' })
  })

  it('graphics refused or taken back: no-graphics straight away, whatever else is so', () => {
    expect(flyGate({ failed: 'This phone did not allow 3D graphics: Error creating WebGL context.', lost: false, shown: false, groundRead: false })).toEqual({ kind: 'no-graphics', why: 'This phone did not allow 3D graphics: Error creating WebGL context.' })
    expect(flyGate({ failed: null, lost: true, shown: true, groundRead: true }).kind).toBe('no-graphics')
    expect(FLY_NO_GRAPHICS).toBe("Needs 3D graphics this phone didn't allow")
  })

  it('a context the phone will not give: borrowRenderer throws GraphicsRefused, logs it, and Fly says so at once', async () => {
    vi.useFakeTimers()
    const kept = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v), removeItem: (k: string) => void kept.delete(k) })
    vi.doMock('three', async (original) => ({
      ...(await original<typeof import('three')>()),
      WebGLRenderer: class {
        constructor() {
          throw new Error('THREE.WebGLRenderer: Error creating WebGL context.')
        }
      },
    }))
    const { borrowRenderer, rendererCount } = await import('../src/three/world/sharedRenderer.ts')
    let caught: unknown = null
    try {
      borrowRenderer(() => {})
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).name).toBe('GraphicsRefused')
    expect(rendererCount()).toBe(0)
    /* Clay3D's catch puts the message in `failed`; the gate answers on it with no time passed. */
    const gate = flyGate({ failed: (caught as Error).message, lost: false, shown: false, groundRead: false })
    expect(gate).toEqual({ kind: 'no-graphics', why: 'This phone did not allow 3D graphics: THREE.WebGLRenderer: Error creating WebGL context.' })
    expect(vi.getTimerCount()).toBe(0)
    /* And the phone's error log has the browser's words. */
    const log = JSON.parse(kept.get('scoutngo.errors.v1') ?? '[]') as { where: string; message: string }[]
    expect(log.at(-1)).toMatchObject({ where: '3D', message: 'WebGL context refused: THREE.WebGLRenderer: Error creating WebGL context.' })
    vi.useRealTimers()
  })

  it('Clay3D: the no-graphics card comes from the gate, ahead of the timer, with only Back; flying is the gate, not `shown`', () => {
    const CLAY = strip(readFileSync('src/components/Clay3D.tsx', 'utf8'))
    expect(CLAY).toMatch(/const gate = flyGate\(\{ failed, lost: trouble\?\.kind === 'lost' \|\| trouble\?\.kind === 'gave-up', shown, groundRead: /)
    expect(CLAY).toMatch(/const flying = fly !== null && gate\.kind === 'open'/)
    expect(CLAY).not.toMatch(/const flying = fly !== null && shown/)
    const card = CLAY.slice(CLAY.indexOf("gate.kind === 'no-graphics' ? ("), CLAY.indexOf("flyLate === 'late'"))
    expect(card).toMatch(/<ScreenFailCard title=\{"Fly didn't open"\} message=\{`\$\{FLY_NO_GRAPHICS\}\. \$\{gate\.why\}`\} onBack=/)
    expect(card).not.toMatch(/onWait|FLY_LOAD_MS|setTimeout/)
    expect(FLY_LOAD_MS).toBe(3000)
    /* While flying, the canvas shows even before every near picture is in. */
    expect(CLAY).toMatch(/\$\{shown \|\| flying \? 'clay clay--shown' : 'clay clay--waiting'\}/)
  })

  it('the scene says when its first frame is drawn, after a frame that did not throw', () => {
    const SCENE = strip(readFileSync('src/three/world/scene.ts', 'utf8'))
    expect(SCENE).toMatch(/draw\(\)\n\s*firstDrawn\(\)\n\s*\} catch/)
    expect(SCENE).toMatch(/whenDrawn: \(\) => drawnOnce/)
  })
})

describe('hasWebGL2 asks once and gives its context back (Batch 3D, Section 1.2)', () => {
  it('one context, lost on purpose at once, and the answer kept', async () => {
    const lose = vi.fn()
    const made = vi.fn(() => ({ getContext: () => ({ getExtension: (n: string) => (n === 'WEBGL_lose_context' ? { loseContext: lose } : null) }) }))
    vi.stubGlobal('document', { createElement: made })
    const { hasWebGL2, forgetWebGL2 } = await import('../src/lib/webgl.ts')
    forgetWebGL2()
    expect(hasWebGL2()).toBe(true)
    expect(hasWebGL2()).toBe(true)
    expect(hasWebGL2()).toBe(true)
    expect(made).toHaveBeenCalledTimes(1)
    expect(lose).toHaveBeenCalledTimes(1)
  })

  it('no WebGL 2: false, and still asked only once', async () => {
    const made = vi.fn(() => ({ getContext: () => null }))
    vi.stubGlobal('document', { createElement: made })
    const { hasWebGL2, forgetWebGL2 } = await import('../src/lib/webgl.ts')
    forgetWebGL2()
    expect(hasWebGL2()).toBe(false)
    expect(hasWebGL2()).toBe(false)
    expect(made).toHaveBeenCalledTimes(1)
  })
})
