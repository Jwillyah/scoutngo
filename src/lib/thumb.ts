/*
 * A still satellite image of the venue.
 *
 * Esri's World Imagery export endpoint, the same imagery the live map streams,
 * keyless and account-free like the tiles. Requesting it discloses the venue
 * bounding box to Esri, which is the disclosure the map tiles already make and
 * which README.md already describes.
 */

import type { LatLon } from '../core/geo.ts'

export const ESRI_EXPORT =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export'

/** Roughly 500m across at mid latitudes, which frames a venue and its approach. */
export const HALF_SPAN_DEG = 0.0045

export function thumbUrl(at: LatLon, width = 760, height = 420): string {
  const aspect = width / height
  const bbox = [
    at.lon - HALF_SPAN_DEG * aspect,
    at.lat - HALF_SPAN_DEG,
    at.lon + HALF_SPAN_DEG * aspect,
    at.lat + HALF_SPAN_DEG,
  ].join(',')
  const params = new URLSearchParams({
    bbox,
    bboxSR: '4326',
    imageSR: '3857',
    size: `${width},${height}`,
    format: 'jpg',
    f: 'image',
  })
  return `${ESRI_EXPORT}?${params.toString()}`
}

/**
 * A square picture of the ground round a point, `halfM` metres each way, north
 * up (Batch Flow, Section 6: the Wind page's dial over the real coastline).
 * The longitude span is widened by the latitude so the square is square on
 * the ground, and the beach line drawn from the facing lies along the shore.
 * Rounded to 3 decimals: Esri learns a map area, as for any map tile.
 */
export function squareThumbUrl(at: LatLon, px = 512, halfM = 900): string {
  const lat = Math.round(at.lat * 1000) / 1000
  const lon = Math.round(at.lon * 1000) / 1000
  const dLat = halfM / 111_320
  const dLon = halfM / (111_320 * Math.cos((lat * Math.PI) / 180))
  const params = new URLSearchParams({
    bbox: [lon - dLon, lat - dLat, lon + dLon, lat + dLat].map((v) => v.toFixed(5)).join(','),
    bboxSR: '4326',
    imageSR: '3857',
    size: `${px},${px}`,
    format: 'jpg',
    f: 'image',
  })
  return `${ESRI_EXPORT}?${params.toString()}`
}
