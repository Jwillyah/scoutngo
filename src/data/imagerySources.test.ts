import { describe, expect, it } from 'vitest'
import { IMAGERY_SOURCES, covers, pickImagery, sourceTileUrl } from './imagerySources.ts'

/* The four places the brief named, and one inland. */
const PLACES = {
  'Virginia Beach pier': { lat: 36.8435575, lon: -75.9713104, want: 'vbmp' },
  'Ocean City MD': { lat: 38.3365, lon: -75.0849, want: 'md-sixinch' },
  'Nags Head, Outer Banks NC': { lat: 35.9557, lon: -75.6177, want: 'nc-onemap' },
  'Rehoboth Beach DE': { lat: 38.7209, lon: -75.0763, want: 'de-2024' },
  'Myrtle Beach SC': { lat: 33.6891, lon: -78.8867, want: 'sc-2023' },
  'Charlottesville VA, inland': { lat: 38.0293, lon: -78.4767, want: 'vbmp' },
  'Denver CO, no state source': { lat: 39.7392, lon: -104.9903, want: 'naip' },
} as const

describe('the sharpest free imagery for a place', () => {
  for (const [name, p] of Object.entries(PLACES)) {
    it(`${name}: ${p.want}`, () => {
      expect(pickImagery(p)?.id).toBe(p.want)
    })
  }
  it('nowhere covered: none, so Esri', () => {
    expect(pickImagery({ lat: 51.5, lon: -0.12 })).toBeNull()
    /* Out to sea off Virginia Beach, past the state's waters. */
    expect(pickImagery({ lat: 36.8, lon: -74.5 })).toBeNull()
  })
  it('the state outlines keep to their states: Virginia Beach is not North Carolina', () => {
    const nc = IMAGERY_SOURCES.find((s) => s.id === 'nc-onemap')
    const va = IMAGERY_SOURCES.find((s) => s.id === 'vbmp')
    expect(nc !== undefined && covers(nc, PLACES['Virginia Beach pier'])).toBe(false)
    expect(va !== undefined && covers(va, PLACES['Nags Head, Outer Banks NC'])).toBe(false)
  })
})

describe('every source is complete', () => {
  for (const s of IMAGERY_SOURCES) {
    it(`${s.id} names itself, its year, licence, attribution and host`, () => {
      for (const v of [s.name, s.year, s.licence, s.attribution, s.host, s.tested]) expect(v.length).toBeGreaterThan(0)
      expect(new URL(s.template.replace(/[{}]/g, '')).host).toBe(s.host)
      expect(s.template.startsWith('https://')).toBe(true)
      expect(s.gsdM).toBeGreaterThan(0)
      /* No key, no token: nothing in the address that carries one. */
      expect(s.template).not.toMatch(/token|key=|apikey/i)
    })
  }
})

describe('tile addresses', () => {
  it('an xyz source is {z}/{y}/{x}', () => {
    const de = IMAGERY_SOURCES.find((s) => s.id === 'de-2024')
    expect(de && sourceTileUrl(de, 152806, 200893, 19)).toMatch(/\/tile\/19\/200893\/152806$/)
  })
  it('an export source asks for the tile its bounding box in Web Mercator metres', () => {
    const naip = IMAGERY_SOURCES.find((s) => s.id === 'naip')
    const url = naip === undefined ? '' : sourceTileUrl(naip, 0, 0, 1)
    /* Zoom 1, tile 0,0: the north-west quarter of the world. */
    expect(url).toContain('bbox=-20037508.34,0.00,0.00,20037508.34')
    expect(url).toContain('format=jpgpng')
  })
})
