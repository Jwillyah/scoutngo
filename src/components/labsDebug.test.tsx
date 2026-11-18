import { beforeEach, describe, expect, it, vi } from 'vitest'
import { labs3DOn } from '../core/lite3d.ts'
import { errorReport } from '../core/errorReport.ts'
import PLAN_SRC from './PlanMode.tsx?raw'
import SETTINGS_SRC from './SettingsPage.tsx?raw'

/*
 * BATCH 3D, SECTION 0 (Jwilly's iPhone 13 Pro Max, iOS 18.7.8, 17 Nov on
 * 62899a6): 3D failed and reloaded the app, Fly never opened, and Settings'
 * "Last errors 20 ›" did nothing when tapped. 3D and Fly go behind Labs (off
 * by default on iOS until Batch SIMPLE-1, Section 4; on everywhere since), Debug is a plain row under About, and Last errors can be
 * copied as one paste. The taps themselves are checked in WebKit as an iPhone
 * (scripts/audit-menu.mjs, "labs and debug").
 */
const store = () => {
  let s: Record<string, string> = {}
  return { getItem: (k: string) => s[k] ?? null, setItem: (k: string, v: string) => void (s[k] = v), removeItem: (k: string) => void delete s[k], clear: () => void (s = {}) }
}

describe('Labs › 3D and Fly (testing)', () => {
  /* Batch SIMPLE-1, Section 4 (Jwilly, 18 Nov): on by default everywhere, iOS included, while 3D and Fly are tested. */
  it('on by default on iOS and elsewhere; a choice made on the phone wins', () => {
    expect(labs3DOn(true, null)).toBe(true)
    expect(labs3DOn(false, null)).toBe(true)
    expect(labs3DOn(true, 'on')).toBe(true)
    expect(labs3DOn(false, 'off')).toBe(false)
    expect(labs3DOn(true, 'off')).toBe(false)
    expect(labs3DOn(true, 'garbage')).toBe(true)
  })

  it('every way into 3D on the map asks the switch first', () => {
    /* Each place that turned 3D on now goes through no3D(), which says the Labs note when off. */
    expect(PLAN_SRC).not.toMatch(/if \(!hasWebGL2\(\)\) \{\s*setThreeDNote\('3D needs WebGL 2[^']*'\)\s*return\s*\}/)
    expect(PLAN_SRC.match(/if \(no3D\(\)\) return/g)?.length).toBeGreaterThanOrEqual(4)
    /* The rail's button, Stand here, Map style's 3D and the drone card's Play and Fly are not offered when off. */
    expect(PLAN_SRC).toContain('onThreeD={labs3D || threeD ? toggleThreeD : undefined}')
    expect(PLAN_SRC).toContain('venue === null || !labs3D')
    expect(PLAN_SRC).toContain('with3D={labs3D || threeD}')
    expect(PLAN_SRC).toContain('with3D={labs3D}')
    /* "Plan the flight" from the Drone page: the drone card on the 2D map, no Fly. */
    expect(PLAN_SRC).toMatch(/setPendingFly\(false\)[\s\S]{0,200}if \(labs3D\) startFly\(false\)/)
  })
})

describe('Settings: a plain way into Debug', () => {
  it('a Debug row right under About; Last errors and the long press open the Debug page, and a long press does not open About', () => {
    const about = SETTINGS_SRC.indexOf('<Row label="About"')
    const debug = SETTINGS_SRC.indexOf('<Row label="Debug" onClick={() => setDebug(true)} />')
    expect(about).toBeGreaterThan(-1)
    expect(debug).toBeGreaterThan(about)
    expect(SETTINGS_SRC.slice(about, debug).match(/<Row /g)?.length).toBe(1)
    expect(SETTINGS_SRC).toContain('<Row label="Last errors" value={String(errorCount)} onClick={() => setDebug(true)} />')
    expect(SETTINGS_SRC).toContain('if (debug) return <DebugPage')
    expect(SETTINGS_SRC).toMatch(/if \(longPressed\.current\) longPressed\.current = false\s*else props\.onAbout\(\)/)
  })
})

describe('Last errors: the stack kept, and Copy all', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', store())
    vi.stubGlobal('sessionStorage', store())
    vi.resetModules()
  })

  it('an error with a stack keeps it (cut at 1500); one without has none', async () => {
    const { recordError, readErrors } = await import('../lib/errorLog.ts')
    recordError('3D', 'Error: shader', new Date('2026-11-17T17:27:00Z'), `Error: shader\n${'    at f (x.js:1:1)\n'.repeat(200)}`)
    recordError('Fly', 'not open in 3 s')
    const [a, b] = readErrors()
    expect(a.stack?.startsWith('Error: shader\n    at f')).toBe(true)
    expect(a.stack?.length).toBe(1500)
    expect(b.stack).toBeUndefined()
  })

  it('the paste: build, browser, GPU renderer, WebGL version, max texture, then each error with time, screen, message and stack', () => {
    const text = errorReport({
      build: '62899a6',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X)',
      gpu: { renderer: 'Apple GPU', version: 'WebGL 2.0', maxTexture: 16384 },
      errors: [
        { at: '2026-11-17T17:27:00.000Z', where: '3D', message: 'Error: x', build: '62899a6', stack: 'Error: x\n    at a (b.js:1:2)' },
        { at: '2026-11-17T17:28:00.000Z', where: 'Fly', message: 'not open in 3 s', build: '62899a6' },
      ],
      at: new Date('2026-11-17T22:38:00Z'),
    })
    for (const want of ['Build: 62899a6', 'Browser: Mozilla/5.0 (iPhone', 'GPU renderer: Apple GPU', 'WebGL: WebGL 2.0', 'Max texture size: 16384', 'Errors: 2', '#1 2026-11-17T17:27:00.000Z · 3D · build 62899a6', '    at a (b.js:1:2)', '#2 2026-11-17T17:28:00.000Z · Fly', 'not open in 3 s']) expect(text).toContain(want)
    expect(text.indexOf('#1')).toBeLessThan(text.indexOf('#2'))
  })

  it('no context at all is said, not left blank', () => {
    const text = errorReport({ build: 'b', userAgent: 'u', gpu: null, errors: [], at: new Date(0) })
    expect(text).toContain('GPU: no WebGL context opened')
    expect(text).toContain('Errors: 0')
  })
})
