import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
 * NOTHING IN THE APP MOVES THE MAP'S CAMERA WHILE A FINGER IS DOWN.
 *
 * 29 Oct, from the phone: "Pinch zoom snaps in and out instead of following
 * the fingers." MapView counts fingers on the map and every camera move the
 * app makes goes through moveCamera, which holds it until they lift
 * (scripts/measure-pinch.mjs counts app camera moves under a finger in the
 * browser: none). This pins the wiring, because the thing that breaks it is
 * an ADDITION: one more easeTo written straight onto the map.
 *
 * The four jumpTo calls are the screenshot capture, which moves the camera
 * and puts it back within one synchronous call, from a button press.
 */
const SOURCE = readFileSync(new URL('../src/components/MapView.tsx', import.meta.url), 'utf8')
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, '')
const lines = CODE.split('\n')

const CAMERA = /\.(easeTo|flyTo|fitBounds|setPadding|setBearing|zoomTo|panTo|setZoom|setCenter|jumpTo|rotateTo|resetNorth)\(/

describe('camera moves wait for the fingers', () => {
  const calls = lines.map((line, i) => ({ line, i })).filter(({ line }) => CAMERA.test(line))

  it('found the camera calls, so a pass means something', () => {
    expect(calls.length).toBeGreaterThan(8)
  })

  it('every one is inside moveCamera, or is the screenshot capture', () => {
    const loose = calls.filter(({ i, line }) => {
      const before = lines.slice(Math.max(0, i - 4), i + 1).join('\n')
      if (before.includes('moveCamera(')) return false
      if (/instance\.jumpTo\((capture\.camera|restore)\)/.test(line)) return false
      return true
    })
    expect(loose.map(({ i, line }) => `${i + 1}: ${line.trim()}`)).toEqual([])
  })

  it('the pinch goes round the fingers, with a small dead zone, and no tilt by hand in 2D', () => {
    expect(CODE).toMatch(/touchZoomRotate\.enable\(\)/)
    expect(CODE).not.toMatch(/around:\s*'center'/)
    expect(CODE).toMatch(/touchZoomRotate\.setZoomThreshold\(0\.0\d\)/)
    expect(CODE).toMatch(/touchPitch\.disable\(\)/)
  })

  it('the coarse underlay is always under the imagery', () => {
    expect(CODE).toMatch(/\{ id: UNDERLAY_LAYER, type: 'raster', source: UNDERLAY_LAYER \},\s*\n\s*\{ id: 'esri'/)
  })

  /* The check has to be able to fail. */
  it('would catch a bare easeTo', () => {
    const planted = ['    instance.easeTo({ zoom: 3 })']
    expect(planted.filter((line) => CAMERA.test(line) && !line.includes('moveCamera('))).toHaveLength(1)
  })
})
