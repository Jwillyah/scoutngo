import { GOES_BAND_CHANNEL, type GoesBand } from '../core/goes.ts'

/**
 * The GOES tile source, as a WMS request maplibre can treat as a tile template.
 *
 * VERIFIED AGAINST THE REAL SERVICE before any of this was written: a GetMap
 * for conus_ch13 in EPSG:3857 at 256x256 returns an 8-bit RGBA PNG of 9.8KB.
 * The capabilities document lists conus_ch01 through ch16 and advertises both
 * EPSG:4326 and EPSG:3857.
 *
 * WMS RATHER THAN A TILE SCHEME because that is what the service speaks.
 * maplibre substitutes {bbox-epsg-3857} into the URL, which is exactly the
 * BBOX a WMS GetMap wants, so a raster source needs no adapter.
 *
 * NO KEY, and no account. This is public data on a public service, which is
 * why it can be in an app that is given away.
 */
export const IEM_GOES_WMS = 'https://mesonet.agron.iastate.edu/cgi-bin/wms/goes_east.cgi'

export function goesTileUrl(band: GoesBand): string {
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.3.0',
    REQUEST: 'GetMap',
    LAYERS: GOES_BAND_CHANNEL[band],
    CRS: 'EPSG:3857',
    WIDTH: '256',
    HEIGHT: '256',
    FORMAT: 'image/png',
    TRANSPARENT: 'true',
  })
  /*
   * The BBOX placeholder is left unencoded on purpose: maplibre looks for the
   * literal string, and URLSearchParams would escape the braces.
   */
  return `${IEM_GOES_WMS}?${params.toString()}&BBOX={bbox-epsg-3857}`
}
