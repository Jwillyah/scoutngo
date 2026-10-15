import { describe, expect, it } from 'vitest'
import { GOES_BAND_CHANNEL } from '../core/goes.ts'
import { goesTileUrl, IEM_GOES_WMS } from './goesLayer.ts'

/*
 * VERIFIED AGAINST THE REAL SERVICE before any of this was written: a GetMap
 * for conus_ch13 in EPSG:3857 at 256x256 returns an 8-bit RGBA PNG of 9,834
 * bytes, and the capabilities document lists conus_ch01 through ch16 with both
 * EPSG:4326 and EPSG:3857. These assert the request stays that shape.
 */
describe('the GOES tile URL', () => {
  const url = goesTileUrl('infrared')

  it('is a WMS GetMap against the service that was tested', () => {
    expect(url.startsWith(IEM_GOES_WMS)).toBe(true)
    expect(url).toContain('SERVICE=WMS')
    expect(url).toContain('REQUEST=GetMap')
    expect(url).toContain('VERSION=1.3.0')
  })

  it('asks for the channel the band maps to', () => {
    expect(url).toContain(`LAYERS=${GOES_BAND_CHANNEL.infrared}`)
    expect(goesTileUrl('visible')).toContain(`LAYERS=${GOES_BAND_CHANNEL.visible}`)
  })

  it('asks in web mercator, at tile size, transparent', () => {
    expect(url).toContain('CRS=EPSG%3A3857')
    expect(url).toContain('WIDTH=256')
    expect(url).toContain('HEIGHT=256')
    expect(url).toContain('TRANSPARENT=true')
    expect(url).toContain('FORMAT=image%2Fpng')
  })

  /*
   * THE PLACEHOLDER MUST STAY LITERAL. maplibre looks for the exact string
   * {bbox-epsg-3857}; URLSearchParams would escape the braces to %7B and %7D
   * and every tile request would ask the service for a bounding box called
   * "{bbox-epsg-3857}".
   */
  it('leaves the bbox placeholder unescaped for maplibre to substitute', () => {
    expect(url).toContain('&BBOX={bbox-epsg-3857}')
    expect(url).not.toContain('%7Bbbox')
  })

  it('needs no key, because this is public data', () => {
    expect(url.toLowerCase()).not.toContain('key=')
    expect(url.toLowerCase()).not.toContain('token')
    expect(url.toLowerCase()).not.toContain('apikey')
  })
})
