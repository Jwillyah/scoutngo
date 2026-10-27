/* The move on the 2D map: its line, its hidden stretches (amber), its points. */
import type { PathPoint } from '../../core/flight.ts'
import type { LatLon } from '../../core/geo.ts'

export function flightFeatures(path: readonly PathPoint[], hidden: readonly [number, number][], points: readonly LatLon[]): GeoJSON.FeatureCollection {
  const line = (ps: readonly PathPoint[]): GeoJSON.Feature => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: ps.map((p) => [p.at.lon, p.at.lat]) } })
  const features: GeoJSON.Feature[] = []
  if (path.length > 1) features.push({ ...line(path), properties: { kind: 'line' } })
  for (const [from, to] of hidden) {
    const run = path.filter((p) => p.t >= from && p.t <= to)
    if (run.length > 1) features.push({ ...line(run), properties: { kind: 'hidden' } })
  }
  for (const p of points) features.push({ type: 'Feature', properties: { kind: 'vertex' }, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } })
  return { type: 'FeatureCollection', features }
}
