/*
 * WHAT A DRONE FRAME COVERS ON THE GROUND, AT ANY TILT.
 *
 * footprint.ts answers the nadir case: camera straight down, a rectangle. A
 * drone shot is usually tilted, and then the frame on the ground is a
 * trapezoid whose far edge runs away fast and, past a certain tilt, never
 * meets the ground at all. This is that shape, worked out from the four corner
 * rays of the frame meeting flat ground. Computed in code; the model is never
 * asked what a camera sees.
 *
 * FLAT GROUND. Terrain is not used: over a hillside the real footprint is
 * shorter uphill and longer downhill. The result says it assumes flat ground.
 *
 * WHEN A RAY REACHES THE HORIZON the footprint has no far edge. Those corners
 * are cut off at FOOTPRINT_MAX_METERS along the ray's own direction and the
 * result says `reachesHorizon`, rather than returning a corner a hundred
 * kilometres away or a shape that pretends to close.
 */
import { destinationPoint, toPosition, type LatLon, type Position } from './geo.ts'

const DEG = Math.PI / 180

/**
 * The diagonal of a 36 x 24 mm frame. A "35 mm equivalent" focal length is
 * defined against this diagonal, which is how DJI publishes the Air 3S
 * cameras: 24 mm equivalent quoted as an 84 degree diagonal.
 */
export const FULL_FRAME_DIAGONAL_MM = Math.hypot(36, 24)

/**
 * The frame's shape, width to height. Air 3S photos are 4:3 by default and
 * its video is 16:9 (DJI Air 3S specifications, dji.com/air-3s/specs). The
 * footprint differs by the shape, so the caller says which.
 */
export const AIR_3S_PHOTO_ASPECT: readonly [number, number] = [4, 3]
export const AIR_3S_VIDEO_ASPECT: readonly [number, number] = [16, 9]

/** How far a corner ray that never meets the ground is drawn, in metres. */
export const FOOTPRINT_MAX_METERS = 2000

export interface FrameAngles {
  /** Degrees, across the frame. */
  hFOV: number
  /** Degrees, top to bottom. */
  vFOV: number
  /** Degrees, corner to corner. */
  dFOV: number
}

/** The frame's angles from a 35 mm equivalent focal length and the frame's shape. */
export function frameAngles(equiv35: number, aspect: readonly [number, number]): FrameAngles {
  const halfDiagonal = Math.atan(FULL_FRAME_DIAGONAL_MM / (2 * equiv35))
  const [w, h] = aspect
  const d = Math.hypot(w, h)
  return {
    hFOV: (2 * Math.atan(Math.tan(halfDiagonal) * (w / d))) / DEG,
    vFOV: (2 * Math.atan(Math.tan(halfDiagonal) * (h / d))) / DEG,
    dFOV: (2 * halfDiagonal) / DEG,
  }
}

export interface FootprintInput {
  /** Where the drone is, on the ground below it. */
  at: LatLon
  altitudeFeet: number
  /** Degrees below the horizon the camera points: 0 is level, 90 is straight down. */
  tiltDegrees: number
  /** Compass bearing the camera faces. */
  headingDegrees: number
  hFOV: number
  vFOV: number
  maxDistanceMeters?: number
}

export interface DroneFootprint {
  /** Closed ring, [lon, lat]: far-left, far-right, near-right, near-left, far-left. */
  ring: Position[]
  /** True when a top-edge ray never meets flat ground and was cut off. */
  reachesHorizon: boolean
  /** Ground distance from the point under the drone to the near and far edge centres, metres. */
  nearMeters: number
  farMeters: number
  /** Always: the ground was taken as flat. */
  assumesFlatGround: true
}

type Vec = [number, number, number]

/** Where a ray from the camera meets flat ground, as metres east and north of the drone. */
function hitGround(dir: Vec, heightMeters: number, max: number): { e: number; n: number; capped: boolean } {
  const [x, y, z] = dir
  const horizontal = Math.hypot(x, y)
  if (z >= 0) {
    /* Level or upward: it never meets the ground. Cut it off along its own heading. */
    const scale = horizontal === 0 ? 0 : max / horizontal
    return { e: x * scale, n: y * scale, capped: true }
  }
  const t = heightMeters / -z
  const e = x * t
  const n = y * t
  const reach = Math.hypot(e, n)
  if (reach > max) return { e: (e / reach) * max, n: (n / reach) * max, capped: true }
  return { e, n, capped: false }
}

export function droneFootprint(input: FootprintInput): DroneFootprint {
  const height = input.altitudeFeet * 0.3048
  const max = input.maxDistanceMeters ?? FOOTPRINT_MAX_METERS
  const psi = input.headingDegrees * DEG
  const theta = Math.min(90, Math.max(-90, input.tiltDegrees)) * DEG

  /* East, north, up. Forward points along the heading, tilted down by theta. */
  const forward: Vec = [Math.sin(psi) * Math.cos(theta), Math.cos(psi) * Math.cos(theta), -Math.sin(theta)]
  const right: Vec = [Math.cos(psi), -Math.sin(psi), 0]
  const up: Vec = [Math.sin(psi) * Math.sin(theta), Math.cos(psi) * Math.sin(theta), Math.cos(theta)]
  const tx = Math.tan((input.hFOV / 2) * DEG)
  const ty = Math.tan((input.vFOV / 2) * DEG)

  const ray = (sx: number, sy: number): Vec => [
    forward[0] + sx * tx * right[0] + sy * ty * up[0],
    forward[1] + sx * tx * right[1] + sy * ty * up[1],
    forward[2] + sx * tx * right[2] + sy * ty * up[2],
  ]

  /* Top of the frame is the far edge on the ground. */
  const corners = [ray(-1, 1), ray(1, 1), ray(1, -1), ray(-1, -1)].map((d) => hitGround(d, height, max))
  const toLatLon = ({ e, n }: { e: number; n: number }): Position => {
    const distance = Math.hypot(e, n)
    if (distance === 0) return toPosition(input.at)
    return toPosition(destinationPoint(input.at, Math.atan2(e, n) / DEG, distance))
  }
  const ring = corners.map(toLatLon)

  const edge = (sy: number) => hitGround(ray(0, sy), height, max)
  const far = edge(1)
  const near = edge(-1)

  return {
    ring: [...ring, ring[0]],
    reachesHorizon: corners.some((c) => c.capped),
    nearMeters: Math.hypot(near.e, near.n),
    farMeters: Math.hypot(far.e, far.n),
    assumesFlatGround: true,
  }
}
