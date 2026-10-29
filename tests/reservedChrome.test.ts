import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FLOATING_CHROME_SELECTORS, floatingChromeNodes } from '../src/lib/floatingChrome.ts'

/*
 * EVERYTHING THAT FLOATS OVER THE MAP MUST BE IN THE RESERVED LIST.
 *
 * src/core/labelPlacement.ts slides a readout along its own ray until it is
 * clear, and it works, but it can only avoid obstacles it is told about. The
 * list in src/lib/floatingChrome.ts is hand maintained, and it had drifted: maplibre's own
 * control corners were never in it, so the bottom-left corner, which holds the
 * scale bar and the attribution (i), was the one corner nothing was reserving
 * and the one corner the readouts were reported stacking in.
 *
 * scripts/audit-labels.mjs catches a collision by measuring a real browser,
 * which is the real check. This is the fast one: it catches a NEW floating
 * surface that nobody added to the list, in a unit test run, before anyone
 * waits for a browser. Both exist because the list is the kind of thing that
 * drifts silently.
 */
const SOURCE = readFileSync('src/components/MapView.tsx', 'utf8')

/* The list itself, imported: one source, read by the placer and the label audit. */
const FLOATING_CHROME = FLOATING_CHROME_SELECTORS.map((s) => `'${s}'`).join(', ')

/* And MapView reads that list rather than keeping a copy that could drift. */
it('MapView places labels against the shared list', () => {
  expect(SOURCE).toContain('FLOATING_CHROME_SELECTORS.join(')
  expect(SOURCE).not.toContain('const FLOATING_CHROME = [')
})

describe('the reserved list', () => {
  /*
   * MAPLIBRE'S FOUR CONTROL CORNERS. All four rather than just the one that
   * has controls in it today, because a control moved to another corner later
   * would otherwise reintroduce exactly the reported bug.
   */
  it('reserves every maplibre control corner', () => {
    for (const corner of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
      expect(FLOATING_CHROME, corner).toContain(`.maplibregl-ctrl-${corner}`)
    }
  })

  /**
   * Every class this app renders as a floating surface over the map.
   *
   * ADD TO THIS WHEN YOU ADD A SURFACE. The point of the test is that adding
   * one and forgetting the reserved list is a failing test rather than a
   * screenshot three weeks later.
   */
  const SURFACES = [
    '.topbar',
    '.chips2',
    '.rail2',
    '.tooldock',
    '.hud',
    '.mapctl',
    '.sheet',
    '.dock',
    '.card',
    '.confirm',
    '.picker__menu',
    '.overflow__menu',
    '.plat',
    '.newbuild',
    '.tapnote',
    '.skykey',
    '.shadowkey',
  ]

  it('reserves every floating surface this app renders', () => {
    for (const surface of SURFACES) {
      expect(FLOATING_CHROME, surface).toContain(`'${surface}'`)
    }
  })

  /*
   * AND THE CLASSES REALLY EXIST. A reserved selector that matches nothing is
   * a list entry doing no work, which is how a renamed surface stops being
   * reserved without anything failing.
   */
  it('names classes the app actually renders', () => {
    const css = readFileSync('src/styles/app.css', 'utf8')
    for (const surface of SURFACES) {
      expect(css, `${surface} is not styled anywhere`).toContain(surface)
    }
  })

  /* The venue pin is reserved too: a readout over it hides the venue. */
  it('reserves the venue pin', () => {
    const effect = SOURCE.slice(SOURCE.indexOf('const obstacles: Rect[]'))
    expect(effect.slice(0, 400)).toContain('.pin')
  })
})

/*
 * A CONTROL CORNER COUNTS AS WHAT IS IN IT. The bottom-left corner is 102 x
 * 577 and holds two small controls (measurements/2026-10-25-ray-label-corner.md);
 * reserving the container kept ray labels out of an empty strip. Every place
 * that reserves chrome goes through floatingChromeNodes.
 */
describe('control corners are measured by their children', () => {
  const el = (className: string, children: object[] = []) => ({ className, children })
  const scale = el('maplibregl-ctrl maplibregl-ctrl-scale')
  const credit = el('maplibregl-ctrl maplibregl-ctrl-attrib')
  const corner = el('maplibregl-ctrl-bottom-left ', [scale, credit])
  const topbar = el('topbar')
  const root = { querySelectorAll: () => [corner, topbar] } as unknown as ParentNode

  it('expands a corner into its controls and keeps everything else whole', () => {
    expect(floatingChromeNodes(root, FLOATING_CHROME_SELECTORS)).toEqual([scale, credit, topbar])
  })

  it('is what the ray labels, the grid tags, the time pills and the label audit all use', () => {
    /* The time pills joined on 29 Oct: the moonrise pill sat under the 3D button. */
    expect(SOURCE.match(/floatingChromeNodes\(document/g)?.length).toBe(3)
    expect(SOURCE).not.toContain("includes('maplibregl-ctrl-')")
    expect(readFileSync('scripts/audit-labels.mjs', 'utf8')).toContain('floatingChromeNodes.toString()')
  })
})
