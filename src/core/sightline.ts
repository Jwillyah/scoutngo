import { bearingBetween, destinationPoint, distanceMeters, type LatLon } from './geo.ts'
import { blocksOn, leafState, type LeafState } from './leaf.ts'
import { isHazard, markPoints, type SiteMark } from './siteMark.ts'

/**
 * WHAT IS STANDING BETWEEN THE CAMERA AND THE SUBJECT.
 *
 * "Trees blocked a position on yesterday's shoot."
 *
 * PURE GEOMETRY ON MARKS THE SHOOTER MADE. The heights come from item 6's
 * marks, which carry a rough height the shooter set while standing there.
 * Nothing here consults a terrain service: see the DSM note below.
 *
 * WHY THERE IS NO SURFACE MODEL BEHIND THIS. The question asked was whether a
 * keyless US surface-height source exists, so that DSM minus DEM would give
 * object height. The answer, from USGS's own product page:
 *
 *   "IfSAR digital surface model (DSM): These 5 meter rasters, available only
 *    in Alaska, are the initial IfSAR product."
 *
 * There is no DSM for the lower 48. 3DEP's seamless products are all bare
 * earth: "Standard DEMs represent the topographic surface of the earth". The
 * bare-earth point query works and is keyless, verified live against
 * epqs.nationalmap.gov, but bare earth minus bare earth is zero and tells you
 * nothing about a tree. The raw 3DEP lidar point clouds ARE public and keyless
 * on S3, per project, but that is a point-cloud reader and a project index
 * rather than a height query, and every one of these would send the venue
 * coordinate to somebody else, which is the thing this app exists to avoid.
 *
 * So: the shooter's own marks, which are better evidence anyway, because they
 * were standing there and the satellite was not.
 *
 * WHAT THIS NEVER SAYS. There is no "clear" result. A position with no
 * obstruction between it and the subject returns an empty list of blockers,
 * and an empty list means nothing is MARKED in the way. See src/core/siteMark.ts.
 */

/** How far either side of the sightline a mark still counts as being in it. */
export const SIGHTLINE_CORRIDOR_METERS = 12

/** Eye height for a person with a camera, standing. Used for a ground position. */
export const EYE_HEIGHT_METERS = 1.6

export interface Blocker {
  markId: string
  /** How far along the sightline the obstruction sits, in metres from the camera. */
  atMeters: number
  /** How high the sightline is at that point, above the camera's own ground. */
  sightlineHeightMeters: number
  /** The obstruction's own top, above the camera's ground. */
  topMeters: number
  /** How far above the sightline the top reaches. Always positive for a blocker. */
  overMeters: number
  /** Whether the leaves are the reason, and what the date says about them. */
  leaf: LeafState
  seasonal: boolean
}

/**
 * The camera, and how high its lens is above the ground it stands on.
 *
 * A GROUND POSITION SEES FROM EYE HEIGHT. An AIR ONE SEES FROM ITS ALTITUDE.
 * That difference is the whole point of doing this per position: the same oak
 * that kills a tripod shot is irrelevant at 200 feet.
 */
export function cameraHeightMeters(
  platform: 'ground' | 'air',
  altitudeFeet: number,
): number {
  return platform === 'air' ? altitudeFeet * 0.3048 : EYE_HEIGHT_METERS
}

/**
 * The closest approach of a point to a segment, as a distance along the
 * segment and a distance away from it.
 *
 * Local flat-earth projection: metres east and north of the segment start.
 * Over the hundreds of metres a sightline runs this is accurate to well under
 * the corridor width, and it keeps the arithmetic readable.
 */
function approach(
  from: LatLon,
  to: LatLon,
  point: LatLon,
): { alongMeters: number; offsetMeters: number } {
  const totalMeters = distanceMeters(from, to)
  if (totalMeters === 0) return { alongMeters: 0, offsetMeters: distanceMeters(from, point) }

  const lineBearing = bearingBetween(from, to)
  const pointBearing = bearingBetween(from, point)
  const pointRange = distanceMeters(from, point)
  const angle = ((pointBearing - lineBearing) * Math.PI) / 180

  const along = pointRange * Math.cos(angle)
  const offset = Math.abs(pointRange * Math.sin(angle))
  return { alongMeters: along, offsetMeters: offset }
}

/**
 * Where a LINE mark crosses the sightline corridor, as the nearest approach of
 * any of its vertices or of the segments between them.
 *
 * SAMPLED ALONG EACH SEGMENT rather than tested at the vertices only. A span
 * of wire between two poles 80 m apart has its vertices at the poles and its
 * middle, which is the part the aircraft hits, nowhere near either.
 */
function nearestApproach(
  from: LatLon,
  to: LatLon,
  mark: SiteMark,
): { alongMeters: number; offsetMeters: number } | null {
  const points = markPoints(mark)
  if (points.length === 0) return null

  const samples: LatLon[] = []
  if (mark.shape.kind === 'point') {
    samples.push(mark.shape.at)
  } else {
    for (let i = 0; i < points.length; i++) {
      samples.push(points[i])
      const next = points[i + 1]
      if (next === undefined) continue
      /* One sample every 5 m along the span, so the middle is not missed. */
      const span = distanceMeters(points[i], next)
      const steps = Math.min(200, Math.max(1, Math.round(span / 5)))
      const bearing = bearingBetween(points[i], next)
      for (let s = 1; s < steps; s++) {
        samples.push(destinationPoint(points[i], bearing, (span * s) / steps))
      }
    }
  }

  let best: { alongMeters: number; offsetMeters: number } | null = null
  for (const sample of samples) {
    const result = approach(from, to, sample)
    if (best === null || result.offsetMeters < best.offsetMeters) best = result
  }
  return best
}

export interface SightlineInput {
  camera: LatLon
  cameraHeightMeters: number
  subject: LatLon
  /** How high up the subject the shot is aimed. Ground level unless told otherwise. */
  subjectHeightMeters: number
  marks: readonly SiteMark[]
  /** yyyy-mm-dd, for the leaf question. */
  date: string
}

/**
 * Which marked obstructions stand above the line from camera to subject.
 *
 * The sightline is a straight line in a vertical plane: it starts at the
 * camera's lens height and ends at the aimed height on the subject, and at any
 * distance along it the height is a linear interpolation between the two. An
 * obstruction blocks when its top is above that line where it crosses it.
 *
 * Marks with NO height do not block, because a mark with no height is not a
 * measurement and inventing one would decide a position on a number nobody
 * gave. They are still drawn on the map; they simply take no part in this.
 */
export function blockers(input: SightlineInput): Blocker[] {
  const total = distanceMeters(input.camera, input.subject)
  if (total <= 0) return []

  const found: Blocker[] = []
  for (const mark of input.marks) {
    if (!isHazard(mark.kind)) continue
    if (mark.heightMeters === null) continue

    const near = nearestApproach(input.camera, input.subject, mark)
    if (near === null) continue
    /* Behind the camera, past the subject, or off to one side: not in the way. */
    if (near.alongMeters <= 0 || near.alongMeters >= total) continue
    if (near.offsetMeters > SIGHTLINE_CORRIDOR_METERS) continue

    const leaf = leafState(input.date, input.camera.lat)
    if (!blocksOn(mark.foliage, leaf)) continue

    const share = near.alongMeters / total
    const sightlineHeight =
      input.cameraHeightMeters + (input.subjectHeightMeters - input.cameraHeightMeters) * share
    const top = mark.heightMeters

    if (top <= sightlineHeight) continue

    found.push({
      markId: mark.id,
      atMeters: near.alongMeters,
      sightlineHeightMeters: sightlineHeight,
      topMeters: top,
      overMeters: top - sightlineHeight,
      leaf,
      seasonal: mark.foliage === 'deciduous',
    })
  }

  return found.sort((a, b) => b.overMeters - a.overMeters)
}
