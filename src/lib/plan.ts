import { slantRangeMeters } from '../core/air.ts'
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
  type KitProfile,
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
import { classifyLighting, type LightingRead } from '../core/lighting.ts'
import { cameraBearingOf, drawsCone, type Aim, type ShotType } from '../core/shotType.ts'
import type { SunPosition } from '../core/sun.ts'
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
  /**
   * WHAT KIND OF SHOT THIS IS, which decides what geometry it has.
   *
   * `framed` is the default and is what this app has always done. The other
   * two do not aim the camera at the pin at all, so they have no bearing and
   * get no lighting class. See src/core/shotType.ts.
   */
  shotType: ShotType
  /**
   * Which way the top-down rectangle is turned, in degrees.
   *
   * NOT A CAMERA BEARING. The camera points at the ground whatever this is;
   * the yaw decides which way the frame lies so the shadows can be lined up
   * with it. Zero and ignored for every other shot type.
   */
  yawDegrees: number
  /** Feet above ground, air positions only. */
  altitudeFeet: number
  /** True once the shooter has dragged this position off where it landed. */
  moved: boolean
  /**
   * Who put this here.
   *
   * MANUAL IS THE DEFAULT WAY TO WORK, not the exception. The model's placements
   * have never been good enough to trust without correction, and dragging a
   * position onto a spot you know is both faster and right. A suggested position
   * is a starting point; a manual one is a decision, and the map says which is
   * which so a glance tells you how much of the plan is yours.
   *
   * It changes NOTHING about the arithmetic. Lighting, field of view, framing,
   * siting and tide are computed identically for both, from the coordinates.
   */
  origin: PositionOrigin
}

export type PositionOrigin = 'suggested' | 'manual'

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
  /**
   * WHAT THIS POSITION IS AIMED AT, which is a different shape per shot type.
   *
   * This replaced a pair of bare `cameraBearing` and `positionBearing` numbers
   * that every position carried whether or not it had one. A 360 sees every
   * direction and a top-down sees the ground, so for those two the numbers
   * were meaningless and nothing stopped them being read. See
   * src/core/shotType.ts.
   *
   * Read the bearing with cameraBearingOf(aim), which returns null when the
   * shot type has none.
   */
  aim: Aim
  /**
   * The TRUE distance from the camera to the subject. This is the number shown
   * on the card and the one every framing judgement is made from.
   *
   * FOR AN AIR POSITION THIS IS THE SLANT RANGE, not the distance between two
   * points on the map. A drone at 200ft hovering over the subject is 61m from
   * it, not 0m. See src/core/air.ts for what that was getting wrong.
   */
  subjectRangeMeters: number
  /**
   * The distance ACROSS THE GROUND to the subject, which is what you pace out
   * and what the cone is drawn from. Same as subjectRangeMeters for a ground
   * position; shorter than it for an air one.
   */
  groundRangeMeters: number
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
  /**
   * Whatever is true about the light here. A framed read carries a lighting
   * classification; a top-down carries shadow direction and length; a 360
   * carries where the sun sits on the ring. Narrow on `read.shotType`.
   */
  read: LightingRead
  /**
   * The field of view cone, toward the subject.
   *
   * EMPTY for a top-down and a 360, because neither sees a cone: one sees a
   * rectangle on the ground and the other sees everything. Drawing a cone for
   * them would be drawing a direction that does not exist.
   */
  cone: Position[][]
  /**
   * Problems with the ground itself, from OSM geometry. Reported, never acted
   * on: the position stays exactly where it was put so the shooter can judge it
   * and drag it themselves.
   */
  warnings: SiteWarning[]
}

/*
 * THE KIT IS EDITABLE, so every lookup takes the live profile.
 *
 * It defaults to DEFAULT_KIT so the existing tests and any caller that does not
 * care keep working, but the app always passes the shooter's own profile. A
 * lens they added this morning has to resolve here or its field of view falls
 * back to someone else's glass.
 */
const findLens = (kit: KitProfile, id: string): Lens =>
  kit.lenses.find((l) => l.id === id) ?? kit.lenses[0] ?? DEFAULT_KIT.lenses[0]

const bodiesFrom = (kit: KitProfile, ids: string[] | undefined): Body[] =>
  ids === undefined ? kit.bodies : kit.bodies.filter((b) => ids.includes(b.id))

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
  kit: KitProfile,
): { optic: PlannedPosition['optic']; sensor: SensorName; focalLength: number } {
  if (position.platform === 'air') {
    const camera: DroneCamera | undefined = findDroneCamera(kit, position.lensId)
    if (camera !== undefined) {
      return {
        optic: { id: camera.id, name: camera.name, kind: 'drone' },
        sensor: 'fullFrame',
        focalLength: camera.equiv35,
      }
    }
  }

  const lens = findLens(kit, position.lensId)
  return {
    optic: { id: lens.id, name: lens.name, kind: 'lens' },
    sensor: resolveSensor(lens, bodiesFrom(kit, bodyIds)),
    focalLength: position.focalLength,
  }
}

/** The cone is drawn a little past the subject so it reads as pointing at it. */
const CONE_OVERSHOOT = 1.25
const MIN_CONE_METERS = 60

export function planPosition(
  position: CameraPosition,
  subject: LatLon,
  /*
   * THE WHOLE SUN, not just its azimuth.
   *
   * It used to be `sunAzimuth: number`, which was all a framed shot's lighting
   * class needs. A top-down read is about shadow LENGTH, which is a function
   * of altitude, and a 360 read is about how far the sun is above the horizon
   * ring, so both of them need the figure the old signature threw away.
   */
  sun: SunPosition,
  land: Landcover = EMPTY_LANDCOVER,
  /** Bodies in the kit. Only used to resolve a forced sensor crop. */
  bodyIds?: string[],
  /** How far the shooter can get from the venue. Null when unconstrained. */
  reachMeters?: number | null,
  /** The venue itself, which the ring is centred on. */
  venue?: LatLon | null,
  /** The shooter's own kit. Defaults to the shipped profile. */
  kit: KitProfile = DEFAULT_KIT,
): PlannedPosition {
  const { optic, sensor, focalLength } = resolveOptic(position, bodyIds, kit)
  const fov = computeFOV(focalLength, SENSORS[sensor])

  /*
   * THE AIM, which only a framed shot gets a bearing for.
   *
   * The bearings still come from turf, and they are still computed from the
   * coordinates rather than taken from anything a model said. What changed is
   * that they are only computed for a shot type that HAS them: see
   * src/core/shotType.ts for why a made up bearing on a 360 is the same class
   * of bug as a coordinate falling back to Null Island.
   */
  const aim: Aim =
    position.shotType === 'framed'
      ? {
          shotType: 'framed',
          positionBearing: bearingBetween(subject, position.at),
          cameraBearing: bearingBetween(position.at, subject),
        }
      : position.shotType === 'top-down'
        ? { shotType: 'top-down', yawDegrees: position.yawDegrees }
        : { shotType: 'orbit' }

  /*
   * THE RANGE TO THE SUBJECT, WHICH FOR AN AIRCRAFT IS THE HYPOTENUSE.
   *
   * `groundRangeMeters` is the distance between two points on the map. For a
   * ground position that is also the distance from the lens to the subject.
   * For an air position it is not, and the difference is not small: at 200ft a
   * drone hovering over the subject used to report a range of 0m and a frame
   * width of 0.0m with no warning, where the truth is 61m and 91m. See
   * src/core/air.ts.
   */
  const groundRangeMeters = distanceMeters(position.at, subject)
  const subjectRangeMeters =
    position.platform === 'air'
      ? slantRangeMeters(groundRangeMeters, position.altitudeFeet)
      : groundRangeMeters

  /*
   * The cone is drawn on the GROUND, so it is sized from the ground range. The
   * cone is where the camera is looking across the map; the slant range is how
   * far away the subject is through the air, and using one for the other would
   * draw an air cone overshooting the subject by the altitude.
   */
  const coneRangeMeters = Math.max(MIN_CONE_METERS, groundRangeMeters * CONE_OVERSHOOT)

  return {
    position,
    optic,
    sensor,
    fov,
    aim,
    subjectRangeMeters,
    groundRangeMeters,
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
    /*
     * The single authority on the light here, and it REFUSES to classify a
     * shot type with no bearing rather than guessing one.
     */
    read: classifyLighting(aim, sun),
    /*
     * A cone only for a framed shot. The other two are drawn differently, as a
     * ground rectangle and as a horizon ring, and an empty cone here is what
     * keeps a wrong one off the map in the meantime.
     */
    /*
     * drawsCone is the predicate, and the aim check beside it is what narrows
     * the union: only a framed aim has a camera bearing, so only a framed aim
     * can produce a cone. Writing it this way means the type system agrees
     * with the predicate rather than being told to trust it.
     */
    cone:
      drawsCone(position.shotType) && aim.shotType === 'framed'
        ? fovConePolygon(position.at, aim.cameraBearing, fov.hFOV, coneRangeMeters)
        : [],
    warnings: checkSite(position.at, land, { platform: position.platform, subject }),
  }
}

export function planPositions(
  positions: CameraPosition[],
  subject: LatLon,
  sun: SunPosition,
  land: Landcover = EMPTY_LANDCOVER,
  bodyIds?: string[],
  reachMeters?: number | null,
  venue?: LatLon | null,
  kit: KitProfile = DEFAULT_KIT,
): PlannedPosition[] {
  return positions.map((position) =>
    planPosition(position, subject, sun, land, bodyIds, reachMeters, venue, kit),
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
   *
   * A TOP-DOWN AND A 360 JOIN THAT SAME PATH, for the same reason and with the
   * same honesty: neither has a bearing from the subject, so neither can cover
   * a sector, and both are counted as left out rather than dropped. They are
   * not errors. A nadir shot over the middle of a site is a legitimate shot
   * that simply does not contribute a direction, which is word for word what
   * was already true of a position standing on the subject.
   */
  const directional = plan.filter(
    (p) => p.aim.shotType === 'framed' && p.subjectRangeMeters >= MIN_BEARING_RANGE_METERS,
  )
  const withoutBearing = plan.length - directional.length

  return {
    coverage: assessCoverage(
      directional.flatMap((p) => {
        const bearing = cameraBearingOf(p.aim)
        /*
         * flatMap with an empty array rather than a non-null assertion. The
         * filter above already guarantees a framed aim, and writing it this
         * way means a later change to that filter cannot smuggle a null
         * through as a zero.
         */
        return bearing === null ? [] : [(bearing + 180) % 360]
      }),
      withoutBearing,
    ),
    rangeVariety: assessRangeVariety(
      directional.map((p) => ({
        rangeMeters: p.subjectRangeMeters,
        maxStandoffMeters: p.standoff.maxMeters,
      })),
    ),
  }
}
