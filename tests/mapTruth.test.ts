import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { canPaintOffThread } from '../src/lib/shadowPainter.ts'
import { TIME_MATTERS } from '../src/lib/sheetCard.ts'

/* Batch TRUTH, Section 5: the map, from the 12 Nov screenshots. */
const MAP = readFileSync('src/components/MapView.tsx', 'utf8')

describe('the time slider never leaves the sheet under the map\'s own layers', () => {
  it('the airspace card (the airspace layer and the LAANC grid open it) keeps it; the layers list still has none', () => {
    expect(TIME_MATTERS.airspace).toBe(true)
    expect(TIME_MATTERS.layers).toBe(false)
  })
})

describe('airspace zoomed out', () => {
  it('thin lines, about 15% fill, the dashed circles faded out below z9', () => {
    expect(MAP).toMatch(/'fill-opacity': 0\.15/)
    expect(MAP).toMatch(/'line-opacity': \['interpolate', \['linear'\], \['zoom'\], 8, 0, 9\.5, 1\]/)
    expect(MAP).toMatch(/'line-width': \['interpolate', \['linear'\], \['zoom'\], 7, 1, 12, 3\]/)
  })
  it('nothing under the status bar; the grid\'s numbers drawn inside the screen\'s edge; the pin out from under the control column', () => {
    expect(readFileSync('src/styles/look-d.css', 'utf8')).toMatch(/\.mode-plan::before \{[^}]*height: var\(--safe-top, 0px\)/)
    expect(MAP).toMatch(/if \(dx !== 0\) tag\.setOffset\(\[dx, 0\]\)/)
    expect(MAP).toMatch(/moveCamera\('pinClear'/)
  })
})

describe('the scrub\'s work (shadow speed)', () => {
  it('the plan hears the time at most every 250 ms while the ruler moves; the shadows every frame', () => {
    const bar = readFileSync('src/components/TimeBar.tsx', 'utf8')
    expect(bar).toMatch(/export const SCRUB_COMMIT_MS = 250\b/)
    expect(bar).toMatch(/if \(busy\.current && performance\.now\(\) - committed\.current < SCRUB_COMMIT_MS\)/)
    expect(bar).toMatch(/publishLiveTime\(t\)/)
  })
  it('the raster is painted in a worker where OffscreenCanvas can blur; elsewhere (and here, in node) on the page', () => {
    expect(canPaintOffThread()).toBe(false)
    expect(MAP).toMatch(/const w = paint === null \? null : shadowWorker\(\)/)
    expect(MAP).toMatch(/paintShadows\(paint\.map, paint\.tint, shadowCanvas, maxPx, within\)/)
  })
})
