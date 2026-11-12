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

/*
 * REAL SHADOWS, THE DRAWING (Batch Polish, Section 5). Under LOW_SUN_DEG the
 * buildings' shadows run so long they have dissolved into the dusk: none
 * drawn (the subject's own line stays). The tint follows the light: warm
 * brown low in the sky, cool grey high (shadowTint). The shapes themselves
 * are shadowMap's, unchanged: they also answer "is this point in shadow".
 */
export const LOW_SUN_DEG = 2
const WARM = [58, 38, 24] as const
const COOL = [28, 34, 48] as const
/** The shadow's colour at this sun height: warm at and under 10°, cool grey at and over 30°, between in between. */
export function shadowTint(altitudeDeg: number): string {
  const t = Math.min(1, Math.max(0, (altitudeDeg - 10) / 20))
  const c = WARM.map((w, i) => Math.round(w + (COOL[i] - w) * t))
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`
}

export function shadowCollection(
  map: ShadowMap | null,
  subject: { at: LatLon; lengthMeters: number; bearing: number } | null,
  sunAltitudeDeg: number | null = null,
  /* Batch Polish 2, Section 3: the map paints the buildings' shadows (shadowPaintFor, src/lib/shadowRaster.ts); false leaves them out of the features. */
  buildings = true,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
  const tint = shadowTint(sunAltitudeDeg ?? 45)
  if (buildings && map !== null && map.status === 'ok' && (sunAltitudeDeg === null || sunAltitudeDeg >= LOW_SUN_DEG)) {
    for (const shadow of map.shadows) {
      if (shadow.hull.length < 3) continue
      features.push({
        type: 'Feature',
        properties: { kind: 'building', id: shadow.id, tint },
        geometry: { type: 'Polygon', coordinates: shadowRings(shadow.hull, shadow.footprint) },
      })
    }
  }
  if (subject !== null) {
    features.push({
      type: 'Feature',
      properties: { kind: 'subject', tint },
      geometry: {
        type: 'LineString',
        coordinates: [toPosition(subject.at), toPosition(destinationPoint(subject.at, subject.bearing, subject.lengthMeters))],
      },
    })
  }
  return { type: 'FeatureCollection', features }
}

/** What the map paints for the buildings (Batch Polish 2, Section 3): nothing under LOW_SUN_DEG, else the shadows in the light's tint. */
export function shadowPaintFor(map: ShadowMap | null, sunAltitudeDeg: number | null): { map: ShadowMap | null; tint: string } {
  const alt = sunAltitudeDeg ?? 45
  return { map: alt < LOW_SUN_DEG ? null : map, tint: shadowTint(alt) }
}
