import type { Feature, FeatureCollection, LineString, Point } from 'geojson'
import { isHazard, markPoints, MARK_LABEL, type SiteMark } from '../core/siteMark.ts'

/**
 * The marked hazards and notes as GeoJSON for the map.
 *
 * Pure, so what gets drawn can be asserted without a WebGL context.
 *
 * EVERY FEATURE CARRIES ITS SOURCE AND ITS CONFIRMATION, because the map has
 * to show the difference between "OpenStreetMap has this mapped", "I stood
 * here and saw it", and later "something proposed this and nobody has agreed
 * yet". Those are three different strengths of claim about a wire that could
 * take an aircraft down, and drawing them identically would flatten the
 * difference exactly where it matters most.
 */
export function markCollection(marks: readonly SiteMark[]): FeatureCollection {
  const features: Feature[] = []

  for (const mark of marks) {
    const properties = {
      id: mark.id,
      kind: mark.kind,
      label: MARK_LABEL[mark.kind],
      hazard: isHazard(mark.kind),
      source: mark.source,
      confirmed: mark.confirmed,
      /* -1 rather than null, so a maplibre filter expression can compare it. */
      height: mark.heightMeters ?? -1,
      seasonal: mark.foliage === 'deciduous',
    }

    if (mark.shape.kind === 'line') {
      const line: Feature<LineString> = {
        type: 'Feature',
        properties,
        geometry: {
          type: 'LineString',
          coordinates: mark.shape.path.map((p) => [p.lon, p.lat]),
        },
      }
      features.push(line)
      /*
       * AND A POINT AT EACH END. A line two pixels wide is hard to find with a
       * thumb, and the ends are where the poles are.
       */
      for (const at of markPoints(mark)) {
        features.push(endpoint(at, properties))
      }
      continue
    }

    features.push(endpoint(mark.shape.at, properties))
  }

  return { type: 'FeatureCollection', features }
}

function endpoint(
  at: { lat: number; lon: number },
  properties: Record<string, unknown>,
): Feature<Point> {
  return {
    type: 'Feature',
    properties: { ...properties, node: true },
    geometry: { type: 'Point', coordinates: [at.lon, at.lat] },
  }
}

/**
 * The line being drawn right now, before it is finished.
 *
 * Separate from the collection above because an unfinished line is not a mark
 * yet: it has no id, no kind and no height, and nothing should be able to
 * compute a sightline from it.
 */
export function draftCollection(path: readonly { lat: number; lon: number }[]): FeatureCollection {
  if (path.length === 0) return { type: 'FeatureCollection', features: [] }

  const features: Feature[] = path.map((at) => ({
    type: 'Feature',
    properties: { draft: true, node: true },
    geometry: { type: 'Point', coordinates: [at.lon, at.lat] },
  }))

  if (path.length >= 2) {
    features.push({
      type: 'Feature',
      properties: { draft: true },
      geometry: { type: 'LineString', coordinates: path.map((p) => [p.lon, p.lat]) },
    })
  }

  return { type: 'FeatureCollection', features }
}
