/*
 * THE FREE AERIAL IMAGERY THE 3D VIEW CAN DRAW, ONE ENTRY PER SOURCE.
 *
 * The 3D view picks the sharpest source whose coverage holds the venue
 * (pickImagery below); Esri's World Imagery is the worldwide fallback, for
 * everywhere no source covers and for any tile a source does not have.
 *
 * Every source here was tested from a browser before it was added (the
 * dates below): no key, no account, CORS open to any page, a picture
 * returned for a place inside it, and terms that allow this use. How to add
 * one is in docs/imagery.md: one entry here, its host in src/lib/hosts.ts
 * and the 3D network audit, and a test.
 *
 * TWO KINDS OF ADDRESS:
 *
 *   xyz      a tile cache in Web Mercator, {z}/{y}/{x}
 *   export   an ArcGIS image or map service drawing the tile on request,
 *            {bbox} in Web Mercator metres at 256 x 256; "jpgpng" answers a
 *            JPEG where the tile is all picture and a transparent PNG where
 *            some of it is not, and the 3D view lays a PNG over Esri's tile
 */
import { STATE_OUTLINES } from './imageryCoverage.ts'

export interface ImagerySource {
  id: string
  /** As the "i" says it. */
  name: string
  /** The years flown, as the service states them. */
  year: string
  /** Metres of ground a pixel at its best: the sharper wins. */
  gsdM: number
  /** The deepest zoom it answers with a picture. */
  maxZoom: number
  kind: 'xyz' | 'export'
  template: string
  host: string
  licence: string
  attribution: string
  /** Where it has pictures: outer rings of [lon, lat], or 'world'. */
  coverage: readonly (readonly (readonly [number, number])[])[] | 'world'
  /** When it was last tried from a browser. */
  tested: string
}

const EXPORT_QUERY = 'bbox={bbox}&bboxSR=3857&imageSR=3857&size=256,256&format=jpgpng&transparent=true&f=image'

/*
 * THE LOWER 48, coarsely, for NAIP: generous on every side (a tile NAIP has
 * no picture for comes back transparent and Esri's shows through), so it
 * only has to keep NAIP off the ocean and out of other countries.
 */
const CONUS: readonly (readonly [number, number])[] = [
  [-124.9, 48.6], [-123.0, 49.1], [-95.2, 49.1], [-89.5, 48.1], [-83.4, 46.2], [-82.4, 45.0], [-82.5, 42.0], [-79.0, 42.9], [-76.0, 43.7], [-74.7, 45.1], [-71.5, 45.1], [-69.2, 47.5], [-67.7, 47.1], [-66.8, 44.8], [-69.8, 43.6], [-70.4, 41.4], [-73.8, 40.4], [-75.9, 36.2], [-75.4, 35.1], [-77.9, 33.7], [-80.9, 32.0], [-81.3, 30.6], [-80.0, 26.7], [-80.4, 25.0], [-81.9, 24.5], [-82.9, 27.9], [-84.3, 29.8], [-89.4, 30.0], [-89.6, 28.9], [-93.9, 29.6], [-97.2, 25.8], [-99.6, 27.6], [-101.4, 29.8], [-104.5, 29.6], [-106.6, 31.8], [-111.1, 31.3], [-114.8, 32.5], [-117.2, 32.5], [-120.7, 34.4], [-124.5, 40.2], [-124.9, 48.6],
]

export const IMAGERY_SOURCES: readonly ImagerySource[] = [
  {
    id: 'vbmp',
    name: 'Virginia Base Mapping Program (VBMP)',
    year: '2022, 2023 and 2025, the most recent for each area',
    gsdM: 0.3,
    maxZoom: 19,
    kind: 'xyz',
    template: 'https://vginmaps.vdem.virginia.gov/arcgis/rest/services/VBMP_Imagery/MostRecentImagery_WGS/MapServer/tile/{z}/{y}/{x}',
    host: 'vginmaps.vdem.virginia.gov',
    licence: 'Public domain, as VGIN approved for OpenStreetMap',
    attribution: 'Imagery: Virginia Geographic Information Network (VGIN)',
    coverage: [STATE_OUTLINES.VA],
    tested: '2026-10-28',
  },
  {
    id: 'nc-onemap',
    name: 'NC OneMap Orthoimagery, latest',
    year: 'the most recent flight for each area',
    gsdM: 0.15,
    maxZoom: 20,
    kind: 'export',
    template: `https://services.nconemap.gov/secure/rest/services/Imagery/Orthoimagery_Latest/ImageServer/exportImage?${EXPORT_QUERY}`,
    host: 'services.nconemap.gov',
    licence: 'Free and unrestricted use (NC OneMap terms)',
    attribution: 'Imagery: NC OneMap, NC Center for Geographic Information and Analysis, NC 911 Board',
    coverage: [STATE_OUTLINES.NC],
    tested: '2026-10-28',
  },
  {
    id: 'md-sixinch',
    name: 'Maryland Six Inch Imagery (MD iMAP)',
    year: '2023, 2024 (Eastern Shore) and 2025',
    gsdM: 0.15,
    maxZoom: 20,
    kind: 'export',
    template: `https://mdgeodata.md.gov/imagery/rest/services/SixInch/SixInchImagery/MapServer/export?${EXPORT_QUERY}`,
    host: 'mdgeodata.md.gov',
    licence: 'Freely distributed, crediting the State of Maryland',
    attribution: 'Imagery: State of Maryland, MD iMAP, DoIT',
    coverage: [STATE_OUTLINES.MD],
    tested: '2026-10-28',
  },
  {
    id: 'de-2024',
    name: 'Delaware Imagery 2024 (FirstMap)',
    year: '2024',
    gsdM: 0.15,
    maxZoom: 20,
    kind: 'xyz',
    template: 'https://enterprise.firstmap.delaware.gov/imagery/rest/services/DE_Imagery/DE_Imagery_2024/ImageServer/tile/{z}/{y}/{x}',
    host: 'enterprise.firstmap.delaware.gov',
    licence: 'No use constraints (the service metadata)',
    attribution: 'Imagery: State of Delaware, FirstMap; Sanborn Map Company',
    coverage: [STATE_OUTLINES.DE],
    tested: '2026-10-28',
  },
  {
    id: 'sc-2023',
    name: 'South Carolina Aerial Imagery 2023',
    year: '2023',
    gsdM: 0.15,
    maxZoom: 20,
    kind: 'xyz',
    template: 'https://tiles.arcgis.com/tiles/RvqSyw3diI7dTKo5/arcgis/rest/services/SC_2023_RGB/MapServer/tile/{z}/{y}/{x}',
    host: 'tiles.arcgis.com',
    licence: 'Public information, no use restriction stated (SC Revenue and Fiscal Affairs Office)',
    attribution: 'Imagery: South Carolina RFA, State GIS Coordinator; Kucera International',
    coverage: [STATE_OUTLINES.SC],
    tested: '2026-10-28',
  },
  {
    id: 'naip',
    name: 'USDA NAIP (USGS The National Map)',
    year: 'the newest flight for each state (2022 or 2023 where tested)',
    gsdM: 0.6,
    maxZoom: 18,
    kind: 'export',
    template: `https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage?${EXPORT_QUERY}`,
    host: 'imagery.nationalmap.gov',
    licence: 'Public domain (USDA Farm Service Agency, USGS)',
    attribution: 'Imagery: USDA NAIP, from USGS The National Map',
    coverage: [CONUS],
    tested: '2026-10-28',
  },
]

/** Whether [lon, lat] is inside a ring (even-odd). */
export function inRing(ring: readonly (readonly [number, number])[], lon: number, lat: number): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export function covers(source: ImagerySource, at: { lat: number; lon: number }): boolean {
  return source.coverage === 'world' || source.coverage.some((ring) => inRing(ring, at.lon, at.lat))
}

/** The sharpest source covering a place, or null: Esri's then. Ties go to the deeper zoom. */
export function pickImagery(at: { lat: number; lon: number }, sources: readonly ImagerySource[] = IMAGERY_SOURCES): ImagerySource | null {
  const here = sources.filter((s) => covers(s, at))
  here.sort((a, b) => a.gsdM - b.gsdM || b.maxZoom - a.maxZoom)
  return here[0] ?? null
}

/** A tile's address from a source, for Web Mercator tile x, y at zoom z. */
export function sourceTileUrl(source: ImagerySource, x: number, y: number, z: number): string {
  if (source.kind === 'xyz') return source.template.replace('{z}', String(z)).replace('{y}', String(y)).replace('{x}', String(x))
  const HALF = 20037508.342789244
  const size = (2 * HALF) / 2 ** z
  const bbox = [x * size - HALF, HALF - (y + 1) * size, (x + 1) * size - HALF, HALF - y * size].map((v) => v.toFixed(2)).join(',')
  return source.template.replace('{bbox}', bbox)
}


/** The "i"'s line about the ground's pictures: the source and its year, or Esri's. */
export function imageryLine(venue: { lat: number; lon: number }): string {
  const src = pickImagery(venue)
  return src === null
    ? 'Ground imagery: Esri World Imagery. The sea offshore is drawn, not photographed.'
    : `Ground imagery: ${src.name}, ${src.year}; Esri's where it has none. The sea offshore is drawn, not photographed.`
}
