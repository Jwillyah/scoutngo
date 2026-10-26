import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { reviveAreas } from '../lib/offlineCache.ts'
import { OVERVIEW_IMAGERY_ZOOMS, OVERVIEW_TERRAIN_ZOOMS } from '../lib/offline3d.ts'
import { parseTrees, SPARSE_TREES } from '../lib/trees.ts'
import { installAssets, isLazy3d, routeOf } from '../sw/shellRoutes.ts'
import { Clay3D, CLAY_NOTE } from './Clay3D.tsx'
import { MapRail } from './MapRail.tsx'

const ORIGIN = 'https://scoutngo.vercel.app'
const get = (path: string) => ({ url: ORIGIN + path, method: 'GET', mode: 'cors' })

describe('the 3D view in the service worker', () => {
  it('leaves Cesium out of the install, and caches it and its files on first use', () => {
    expect(isLazy3d('/assets/cesium-j9LeNs8l.js')).toBe(true)
    expect(isLazy3d('/assets/index-gLcqEpxQ.js')).toBe(false)
    expect(installAssets(['/assets/index-a.js', '/assets/cesium-b.js', '/assets/cesium-c.css'])).toEqual(['/assets/index-a.js'])
    expect(routeOf(get('/assets/cesium-b.js'), ORIGIN)).toBe('asset')
    expect(routeOf(get('/cesium/26.4.0/Workers/createVerticesFromHeightmap.js'), ORIGIN)).toBe('asset')
  })
})

describe('offline 3D', () => {
  it('keeps a saved 3D overview when the list is read back', () => {
    const area = { id: 'x', kind: '3d', label: '3D overview around Brew River', box: { south: 1, west: 1, north: 2, east: 2 }, imageryZooms: [0, 13], terrainZooms: [0, 15], tiles: 40, bytes: 1, savedAt: '2026-10-26T00:00:00Z' }
    expect(reviveAreas([area])).toHaveLength(1)
    expect(reviveAreas([{ ...area, kind: 'other' }])).toHaveLength(0)
  })

  it('saves the coarse pyramid the ring does not: imagery to 13, elevation to the source deepest', () => {
    expect(OVERVIEW_IMAGERY_ZOOMS).toEqual([0, 13])
    expect(OVERVIEW_TERRAIN_ZOOMS).toEqual([0, 15])
  })
})

describe('mapped trees', () => {
  it('reads single trees only, with a height when OSM gives one', () => {
    const trees = parseTrees({
      elements: [
        { type: 'node', lat: 1, lon: 2, tags: { natural: 'tree', height: '12' } },
        { type: 'node', lat: 1, lon: 2, tags: { natural: 'tree' } },
        { type: 'way', center: { lat: 1, lon: 2 }, tags: { natural: 'wood' } },
      ],
    })
    expect(trees).toEqual([
      { at: { lat: 1, lon: 2 }, height: 12 },
      { at: { lat: 1, lon: 2 }, height: null },
    ])
    expect(SPARSE_TREES).toBeGreaterThan(1)
  })
})

describe('the 3D button', () => {
  const rail = (note: string | null, threeD = false) =>
    renderToStaticMarkup(
      <MapRail threeD={threeD} onThreeD={() => {}} threeDNote={note} bearing={0} heading={false} onCompass={() => {}} measuring={false} onMeasure={() => {}} />,
    )
  it('opens the clay model, and says 2D when it is open', () => {
    expect(rail(null)).toContain('aria-label="Open the 3D clay model"')
    expect(rail(null, true)).toContain('aria-label="Back to the 2D map"')
  })
  it('without WebGL 2 says so in one line, and nothing else changes', () => {
    const html = rail('3D needs WebGL 2, which this browser does not have. The 2D map works as before.')
    expect(html.match(/class="rail2__note"/g)).toHaveLength(1)
  })
})

describe('the clay model says what it is', () => {
  it('on screen, from the first frame', () => {
    const html = renderToStaticMarkup(
      <Clay3D venue={{ lat: 38.36, lon: -75.6 }} venueLabel="Brew River" at={new Date()} timeZone="America/New_York" pins={[]} />,
    )
    expect(CLAY_NOTE).toBe('Clay model from map data. Real buildings may differ; unknown heights shown lighter.')
    expect(html).toContain(CLAY_NOTE)
  })
})
