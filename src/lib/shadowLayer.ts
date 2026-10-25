/*
 * THE SHADOW MAP AS MAP FEATURES: one ring per building (the hull, see
 * shadowMap.ts), and the subject's own shadow as a line from the pin.
 */
import { destinationPoint, toPosition, type LatLon } from '../core/geo.ts'
import type { ShadowMap } from '../core/shadowMap.ts'

export function shadowCollection(
  map: ShadowMap | null,
  subject: { at: LatLon; lengthMeters: number; bearing: number } | null,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
  if (map !== null && map.status === 'ok') {
    for (const shadow of map.shadows) {
      if (shadow.hull.length < 3) continue
      features.push({
        type: 'Feature',
        properties: { kind: 'building', id: shadow.id },
        geometry: { type: 'Polygon', coordinates: [[...shadow.hull, shadow.hull[0]]] },
      })
    }
  }
  if (subject !== null) {
    features.push({
      type: 'Feature',
      properties: { kind: 'subject' },
      geometry: {
        type: 'LineString',
        coordinates: [toPosition(subject.at), toPosition(destinationPoint(subject.at, subject.bearing, subject.lengthMeters))],
      },
    })
  }
  return { type: 'FeatureCollection', features }
}
