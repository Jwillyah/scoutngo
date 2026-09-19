import {
  classifyFraming,
  computeFOV,
  frameWidthMeters,
  SENSORS,
  standoffBand,
  type FOV,
  type FramingWarning,
  type SensorName,
  type StandoffBand,
} from '../core/fov.ts'
import {
  bearingBetween,
  distanceMeters,
  fovConePolygon,
  type LatLon,
  type Position,
} from '../core/geo.ts'
import {
  DEFAULT_KIT,
  findDroneCamera,
  resolveSensor,
  type Body,
  type DroneCamera,
  type Lens,
} from '../core/kit.ts'
import {
  assessCoverage,
  assessRangeVariety,
  MIN_BEARING_RANGE_METERS,
  type Coverage,
  type RangeVariety,
} from '../core/coverage.ts'
import { classifyLighting, type LightingResult } from '../core/lighting.ts'
import { isWithinRadius, metersBeyondRadius } from '../core/radius.ts'
import { checkSite, EMPTY_LANDCOVER, type Landcover, type SiteWarning } from '../core/siting.ts'
import type { Platform } from './parsePlan.ts'

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
  /**
   * A ground lens id, or a drone camera id for an air position.
   *
   * There is no bodyId. Which body the lens goes on is a decision made on the
   * day, and printing "Sony a7III, Sony 200-600" on a card was telling the
   * shooter something they already knew instead of something they needed. The
   * one way a body still changes the arithmetic, the a7IV's forced APS-C crop, is
   * resolved from the kit selection in core/kit.ts rather than pinned per shot.
   */
  lensId: string
  focalLength: number
  /** What to capture from here. Model judgement, not geometry. */
  shot: string
  /** What could go wrong here. Also judgement. */
  risk: string
  /** Why this vantage is worth standing in. Judgement. Never read as geometry. */
  angleRationale: string
  /** Index of the pasted shot this covers, or null. Validated at parse. */
  coversShot: number | null
  /** Ground or air. Air positions get a dashed cone and a flight path check. */
  platform: Platform
  /** Feet above ground, air positions only. */
  altitudeFeet: number
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
  /** What is on the front of the camera: a ground lens or a fixed drone camera. */
  optic: { id: string; name: string; kind: 'lens' | 'drone' }
  sensor: SensorName
  fov: FOV
  /** Where the camera points: from the position toward the subject. */
  cameraBearing: number
  /** From the subject toward the position. What classifyLighting wants. */
  positionBearing: number
  /**
   * The TRUE distance from the camera to the subject. This is the number shown
   * on the card and the one every framing judgement is made from.
   */
  subjectRangeMeters: number
  /**
   * How long the cone is DRAWN, which is not the same thing: it overshoots the
   * subject so the cone reads as pointing at it, and has a floor so a close
   * position still draws something visible. Never use it as a distance.
   */
  coneRangeMeters: number
  /** How wide the frame is at the subject, in metres. 2 * range * tan(hFOV/2). */
  frameWidthMeters: number
  /** The usable standoff band for this field of view. */
  standoff: StandoffBand
  /** Standoff and framing problems. Flagged in magenta, exactly like site ones. */
  framingWarnings: FramingWarning[]
  /**
   * Outside the ring the shooter said they can reach. REPORTED, never moved:
   * they know whether that far bank is walkable and this app does not.
   */
  beyondReach: boolean
  /** How far outside, so the card can say by how much. Zero when inside. */
  beyondReachMeters: number
  lighting: LightingResult
  cone: Position[][]
  /**
   * Problems with the ground itself, from OSM geometry. Reported, never acted
   * on: the position stays exactly where it was put so the shooter can judge it
   * and drag it themselves.
   */
  warnings: SiteWarning[]
}

const findLens = (id: string): Lens =>
  DEFAULT_KIT.lenses.find((l) => l.id === id) ?? DEFAULT_KIT.lenses[0]

const bodiesFrom = (ids: string[] | undefined): Body[] =>
  ids === undefined ? DEFAULT_KIT.bodies : DEFAULT_KIT.bodies.filter((b) => ids.includes(b.id))

/**
 * The optic on the front of the camera, and the sensor its field of view is
 * computed against.
 *
 * A drone camera goes through the SAME computeFOV as a ground lens, using its
 * 35mm equivalent focal length on a full frame sensor. That is what "equivalent"
 * means, and it keeps one piece of arithmetic rather than two that can drift.
 */
function resolveOptic(
  position: CameraPosition,
  bodyIds: string[] | undefined,
): { optic: PlannedPosition['optic']; sensor: SensorName; focalLength: number } {
  if (position.platform === 'air') {
    const camera: DroneCamera | undefined = findDroneCamera(DEFAULT_KIT, position.lensId)
    if (camera !== undefined) {
      return {
        optic: { id: camera.id, name: camera.name, kind: 'drone' },
        sensor: 'fullFrame',
        focalLength: camera.equiv35,
      }
    }
  }

  const lens = findLens(position.lensId)
  return {
    optic: { id: lens.id, name: lens.name, kind: 'lens' },
    sensor: resolveSensor(lens, bodiesFrom(bodyIds)),
    focalLength: position.focalLength,
  }
}

/** The cone is drawn a little past the subject so it reads as pointing at it. */
const CONE_OVERSHOOT = 1.25
const MIN_CONE_METERS = 60

export function planPosition(
  position: CameraPosition,
  subject: LatLon,
  sunAzimuth: number,
  land: Landcover = EMPTY_LANDCOVER,
  /** Bodies in the kit. Only used to resolve a forced sensor crop. */
  bodyIds?: string[],
  /** How far the shooter can get from the venue. Null when unconstrained. */
  reachMeters?: number | null,
  /** The venue itself, which the ring is centred on. */
  venue?: LatLon | null,
): PlannedPosition {
  const { optic, sensor, focalLength } = resolveOptic(position, bodyIds)
  const fov = computeFOV(focalLength, SENSORS[sensor])

  // Both bearings come from turf. The cone points where the camera points.
  const cameraBearing = bearingBetween(position.at, subject)
  const positionBearing = bearingBetween(subject, position.at)

  const subjectRangeMeters = distanceMeters(position.at, subject)
  const coneRangeMeters = Math.max(MIN_CONE_METERS, subjectRangeMeters * CONE_OVERSHOOT)

  return {
    position,
    optic,
    sensor,
    fov,
    cameraBearing,
    positionBearing,
    subjectRangeMeters,
    coneRangeMeters,
    frameWidthMeters: frameWidthMeters(subjectRangeMeters, fov.hFOV),
    standoff: standoffBand(fov.hFOV, position.platform),
    framingWarnings: classifyFraming(subjectRangeMeters, fov.hFOV, position.platform),
    beyondReach:
      reachMeters == null || venue == null
        ? false
        : !isWithinRadius(venue, position.at, reachMeters),
    beyondReachMeters:
      reachMeters == null || venue == null
        ? 0
        : metersBeyondRadius(venue, position.at, reachMeters),
    // The single authority on whether this position is backlit.
    lighting: classifyLighting(positionBearing, sunAzimuth),
    cone: fovConePolygon(position.at, cameraBearing, fov.hFOV, coneRangeMeters),
    warnings: checkSite(position.at, land, { platform: position.platform, subject }),
  }
}

export function planPositions(
  positions: CameraPosition[],
  subject: LatLon,
  sunAzimuth: number,
  land: Landcover = EMPTY_LANDCOVER,
  bodyIds?: string[],
  reachMeters?: number | null,
  venue?: LatLon | null,
): PlannedPosition[] {
  return positions.map((position) =>
    planPosition(position, subject, sunAzimuth, land, bodyIds, reachMeters, venue),
  )
}


export interface PlanCoverage {
  coverage: Coverage
  rangeVariety: RangeVariety
}

/**
 * How well the plan as a whole covers the subject.
 *
 * Computed from the PLANNED positions, so it is live: drag a position across the
 * river and this updates with it. That matters, because the answer to a clustered
 * plan is often the shooter moving one position rather than generating again, and
 * the readout has to reward that rather than stay stale on what the model said.
 */
export function assessPlan(plan: PlannedPosition[]): PlanCoverage {
  /*
   * A position sitting on the subject has no direction from it, so it cannot
   * count toward covering a sector. Splitting rather than filtering, so the count
   * of what was left out can be reported instead of quietly vanishing.
   */
  const directional = plan.filter((p) => p.subjectRangeMeters >= MIN_BEARING_RANGE_METERS)
  const onSubject = plan.length - directional.length

  return {
    coverage: assessCoverage(
      directional.map((p) => p.positionBearing),
      onSubject,
    ),
    rangeVariety: assessRangeVariety(
      directional.map((p) => ({
        rangeMeters: p.subjectRangeMeters,
        maxStandoffMeters: p.standoff.maxMeters,
      })),
    ),
  }
}
