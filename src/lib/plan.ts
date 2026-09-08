import { computeFOV, SENSORS, type FOV, type SensorName } from '../core/fov.ts'
import {
  bearingBetween,
  distanceMeters,
  fovConePolygon,
  type LatLon,
  type Position,
} from '../core/geo.ts'
import { DEFAULT_KIT, effectiveSensor, type Body, type Lens } from '../core/kit.ts'
import { classifyLighting, type LightingResult } from '../core/lighting.ts'
import { checkSite, EMPTY_LANDCOVER, type Landcover, type SiteWarning } from '../core/siting.ts'

/**
 * A camera position. The model proposes where to stand and what to shoot; it
 * never supplies a bearing, a field of view, or a lighting call. Those are
 * computed from this position by src/core/.
 */
export interface CameraPosition {
  id: string
  /** Badge number shown on the map. */
  number: number
  at: LatLon
  bodyId: string
  lensId: string
  focalLength: number
  /** What to capture from here. Model judgement, not geometry. */
  shot: string
  /** What could go wrong here. Also judgement. */
  risk: string
  /** True once the shooter has dragged this position off where it landed. */
  moved: boolean
}

/**
 * Everything drawn on the map for one camera position. Every number in here is
 * computed by src/core/. Nothing is asserted, inferred, or carried over from a
 * model response.
 */
export interface PlannedPosition {
  position: CameraPosition
  body: Body
  lens: Lens
  sensor: SensorName
  fov: FOV
  /** Where the camera points: from the position toward the subject. */
  cameraBearing: number
  /** From the subject toward the position. What classifyLighting wants. */
  positionBearing: number
  rangeMeters: number
  lighting: LightingResult
  cone: Position[][]
  /**
   * Problems with the ground itself, from OSM geometry. Reported, never acted
   * on: the position stays exactly where it was put so the shooter can judge it
   * and drag it themselves.
   */
  warnings: SiteWarning[]
}

const findBody = (id: string): Body =>
  DEFAULT_KIT.bodies.find((b) => b.id === id) ?? DEFAULT_KIT.bodies[0]

const findLens = (id: string): Lens =>
  DEFAULT_KIT.lenses.find((l) => l.id === id) ?? DEFAULT_KIT.lenses[0]

/** The cone is drawn a little past the subject so it reads as pointing at it. */
const CONE_OVERSHOOT = 1.25
const MIN_CONE_METERS = 60

export function planPosition(
  position: CameraPosition,
  subject: LatLon,
  sunAzimuth: number,
  land: Landcover = EMPTY_LANDCOVER,
): PlannedPosition {
  const body = findBody(position.bodyId)
  const lens = findLens(position.lensId)
  const sensor = effectiveSensor(lens, body)
  const fov = computeFOV(position.focalLength, SENSORS[sensor])

  // Both bearings come from turf. The cone points where the camera points.
  const cameraBearing = bearingBetween(position.at, subject)
  const positionBearing = bearingBetween(subject, position.at)

  const rangeMeters = Math.max(
    MIN_CONE_METERS,
    distanceMeters(position.at, subject) * CONE_OVERSHOOT,
  )

  return {
    position,
    body,
    lens,
    sensor,
    fov,
    cameraBearing,
    positionBearing,
    rangeMeters,
    // The single authority on whether this position is backlit.
    lighting: classifyLighting(positionBearing, sunAzimuth),
    cone: fovConePolygon(position.at, cameraBearing, fov.hFOV, rangeMeters),
    warnings: checkSite(position.at, land),
  }
}

export function planPositions(
  positions: CameraPosition[],
  subject: LatLon,
  sunAzimuth: number,
  land: Landcover = EMPTY_LANDCOVER,
): PlannedPosition[] {
  return positions.map((position) => planPosition(position, subject, sunAzimuth, land))
}
