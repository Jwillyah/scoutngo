import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { asCaller, instrumentMap, readTouchDebug, touchLogLines } from '../src/lib/touchDebug.ts'

/*
 * PINCH ON A REAL IPHONE, 29 Oct: still snapping on f68fe19, with every
 * emulated pinch passing. What only iOS Safari does:
 *
 *   - It fires visualViewport resize while a pinch is under way. The map's
 *     resize() then called MapLibre's stop(), which ends the touch handlers:
 *     the map froze for the rest of the pinch and jumped on the next touch
 *     (0.585 levels behind the fingers, scripts/audit-gestures.mjs). The
 *     resize now waits for the fingers to lift.
 *   - It scales the page from gesturechange and gestureend too, not only
 *     gesturestart; all three are stopped, and the page cannot scale past 1.
 *   - A pinch begun on the pin or a label is Safari's unless the whole map
 *     element says touch-action: none.
 *
 * And two things a phone's network shows: a finer imagery tile popping in
 * with no fade, and a dark smear of shadows at a wide zoom.
 */
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, '')
const MAP = strip(readFileSync('src/components/MapView.tsx', 'utf8'))
const MAIN = strip(readFileSync('src/main.tsx', 'utf8'))
const HTML = readFileSync('index.html', 'utf8')
const CSS = readFileSync('src/styles/app.css', 'utf8')

describe('what only iOS Safari does to a pinch', () => {
  it('a resize waits for the fingers, like every other camera write', () => {
    const effect = MAP.slice(MAP.indexOf('const resize = () => {'), MAP.indexOf('const observer = new ResizeObserver(resize)'))
    expect(effect).toMatch(/if \(fingers\.current > 0\) \{\s*resizeWaiting\.current = true/)
    /* Every .resize() call in the file is the guarded one or the one run when the fingers lift. */
    const calls = MAP.split('\n').filter((line) => /\.resize\(\)/.test(line))
    expect(calls).toHaveLength(2)
    expect(MAP).toMatch(/if \(resizeWaiting\.current && instance !== null\) \{[\s\S]{0,200}instance\.resize\(\)/)
  })

  it('stops all three of Safari\'s gesture events, not passive', () => {
    expect(MAIN).toMatch(/\['gesturestart', 'gesturechange', 'gestureend'\]/)
    expect(MAIN).toMatch(/preventDefault\(\), \{ passive: false \}/)
  })

  it('keeps the page at scale 1, drawn under the bars', () => {
    expect(HTML).toMatch(/name="viewport" content="[^"]*maximum-scale=1\.0[^"]*viewport-fit=cover/)
  })

  it('the whole map element takes the touch, pin and labels included', () => {
    const rule = CSS.slice(CSS.indexOf('.map__canvas {'), CSS.indexOf('}', CSS.indexOf('.map__canvas {')))
    expect(rule).toContain('touch-action: none')
  })

  it('a finer imagery tile fades in over the coarser one, never pops', () => {
    expect(MAP).toMatch(/export const IMAGERY_FADE_MS = 300/)
    expect(MAP).toMatch(/\{ id: 'esri', type: 'raster', source: 'esri', paint: \{ 'raster-fade-duration': IMAGERY_FADE_MS \} \}/)
  })

  it('2D shadows start at zoom 14', () => {
    expect(MAP).toMatch(/export const SHADOWS_MIN_ZOOM = 14/)
    for (const id of ['shadow-fill', 'shadow-subject']) {
      const at = MAP.indexOf(`id: '${id}'`)
      expect(MAP.slice(at, at + 160)).toContain('minzoom: SHADOWS_MIN_ZOOM')
    }
  })
})

/*
 * DEBUG TOUCH: off unless asked, and every camera write logged with who made
 * it. A write that skips the app's guard says "untagged", which is the finding.
 */
describe('debug touch', () => {
  it('is off by default', () => {
    expect(readTouchDebug()).toBe(false)
  })

  it('logs each camera write with its caller, and the untagged ones as untagged', () => {
    let zoom = 15
    const listeners: Record<string, (e: { originalEvent?: unknown }) => void> = {}
    const map = {
      getZoom: () => zoom,
      easeTo(o: { zoom: number }) {
        zoom = o.zoom
      },
      resize() {},
      on(type: string, fn: (e: { originalEvent?: unknown }) => void) {
        listeners[type] = fn
      },
      off() {},
    }
    const element = { addEventListener() {}, removeEventListener() {} } as unknown as HTMLElement
    const undo = instrumentMap(map, element)
    asCaller('venue', () => map.easeTo({ zoom: 16 }))
    map.resize()
    listeners.move?.({ originalEvent: {} })
    undo()
    map.easeTo({ zoom: 17 })
    const lines = touchLogLines()
    expect(lines.some((l) => /easeTo by venue · zoom 15\.000 → 16\.000/.test(l))).toBe(true)
    expect(lines.some((l) => /resize by untagged/.test(l))).toBe(true)
    expect(lines.some((l) => /zoom 16\.000 · user/.test(l))).toBe(true)
    /* Undone: the write after it is not logged. */
    expect(lines.some((l) => /zoom 16\.000 → 17\.000/.test(l))).toBe(false)
  })

  it('the overlay is only drawn when it is on', () => {
    expect(MAP).toMatch(/\{debugTouch \? <TouchDebug \/> : null\}/)
    expect(MAP).toMatch(/if \(!debugTouch \|\| !ready \|\| instance === null\) return/)
  })
})

