import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
 * EVERYTHING THAT FLOATS OVER THE MAP MUST BE IN THE RESERVED LIST.
 *
 * src/core/labelPlacement.ts slides a readout along its own ray until it is
 * clear, and it works, but it can only avoid obstacles it is told about. The
 * list in MapView is hand maintained, and it had drifted: maplibre's own
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

const FLOATING_CHROME = (() => {
  const start = SOURCE.indexOf('const FLOATING_CHROME = [')
  const end = SOURCE.indexOf("].join(', ')", start)
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return SOURCE.slice(start, end)
})()

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
    '.hud',
    '.mapctl',
    '.sheet',
    '.dock',
    '.card',
    '.confirm',
    '.setup__search',
    '.picker__menu',
    '.overflow__menu',
    '.plat',
    '.newbuild',
    '.tapnote',
    '.locate',
    '.skykey',
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
