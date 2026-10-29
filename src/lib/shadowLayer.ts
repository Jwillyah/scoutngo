/*
 * THE SHADOW MAP AS MAP FEATURES: one ring per building (the hull, see
 * shadowMap.ts), and the subject's own shadow as a line from the pin.
 *
 * THE ROOF IS CUT OUT (29 Oct: Hampton Coliseum at z17 a solid dark slab
 * over the satellite). The swept shadow contains the footprint it was swept
 * from, so the lit roof was drawn as shadow at 0.45. The footprint is a hole
 * in the ring, wound against it as MapLibre needs to read it as a hole. A
 * lower roof inside a taller building's shadow stays dark: that one is in
 * shadow.
 */
const signedArea = (ring: readonly GeoJSON.Position[]): number => {
  let a = 0
  for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
  return a / 2
}

/** The shadow's outer ring and the roof as a hole wound the other way. */
export function shadowRings(hull: readonly GeoJSON.Position[], footprint: readonly GeoJSON.Position[]): GeoJSON.Position[][] {
  const outer = [...hull, hull[0]]
  const hole = Math.sign(signedArea(footprint)) === Math.sign(signedArea(outer)) ? [...footprint].reverse() : [...footprint]
  return footprint.length >= 4 ? [outer, hole] : [outer]
}
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
        geometry: { type: 'Polygon', coordinates: shadowRings(shadow.hull, shadow.footprint) },
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
