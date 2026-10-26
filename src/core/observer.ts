/*
 * STANDING AT A POSITION, IN THE 3D VIEW: where the eye is, which way it
 * looks, and what the lens frames.
 *
 * Eye height is 1.6 m above the ground on foot, or the planned height for a
 * drone spot. The camera faces the aim: the same bearing every cone uses
 * (src/core/geo.ts), and for a drone, tilted down to the subject.
 *
 * THE FRAME BOX. The 3D camera shows more than the lens does, so there is
 * something to look around in; the lens's own frame is a box drawn on the
 * screen, sized by the ratio of tangents. Its angle comes from the body's
 * sensor and the focal length (src/core/fov.ts), zoomable between the lens's
 * two ends.
 */
import { computeFOV, type SensorSize } from './fov.ts'
import { bearingBetween, distanceMeters, type LatLon } from './geo.ts'

export const EYE_HEIGHT_M = 1.6
const FEET = 0.3048
const DEG = Math.PI / 180

export interface ObserverInput {
  standAt: LatLon
  aimAt: LatLon
  /** Feet above the ground for a drone spot; null on foot. */
  droneFeet: number | null
}

export interface ObserverPose {
  heightAboveGround: number
  /** Compass degrees. */
  heading: number
  /** Degrees, negative down. */
  pitch: number
}

export function observerPose({ standAt, aimAt, droneFeet }: ObserverInput): ObserverPose {
  const height = droneFeet === null ? EYE_HEIGHT_M : droneFeet * FEET
  const range = distanceMeters(standAt, aimAt)
  return {
    heightAboveGround: height,
    heading: range < 0.5 ? 0 : bearingBetween(standAt, aimAt),
    /* On foot, level: the subject is about eye height. From the air, down at it. */
    pitch: droneFeet === null || range < 0.5 ? 0 : -Math.atan2(height, range) / DEG,
  }
}

/** Clamp a focal length to a lens's two ends. */
export const zoomWithin = (focal: number, min: number, max: number): number => Math.min(max, Math.max(min, focal))

/**
 * How wide the 3D camera should look for a lens: half again the lens's
 * width, so there is room around the frame, between 30 and 100 degrees.
 */
export function viewWidthDegrees(lensHorizontalDeg: number): number {
  return Math.min(100, Math.max(30, lensHorizontalDeg * 1.5))
}

export interface FrameBox {
  /** Pixels, centred on the screen. */
  width: number
  height: number
  lensHorizontal: number
  lensVertical: number
}

/**
 * The lens's frame on a screen whose camera spans `viewHorizontalDeg` across
 * its width: tan(lens/2) over tan(view/2) of the width, and the same scale
 * vertically. Landscape, as the cones are drawn.
 */
export function frameBox(focal: number, sensor: SensorSize, viewHorizontalDeg: number, screenWidth: number): FrameBox {
  const fov = computeFOV(focal, sensor)
  const perTan = screenWidth / 2 / Math.tan((viewHorizontalDeg / 2) * DEG)
  return {
    width: 2 * perTan * Math.tan((fov.hFOV / 2) * DEG),
    height: 2 * perTan * Math.tan((fov.vFOV / 2) * DEG),
    lensHorizontal: fov.hFOV,
    lensVertical: fov.vFOV,
  }
}

/**
 * The vertical angle for a screen of this shape, given the horizontal one:
 * the 3D engine is told the larger of the two.
 */
export function verticalFromHorizontal(horizontalDeg: number, width: number, height: number): number {
  return (2 * Math.atan(Math.tan((horizontalDeg / 2) * DEG) * (height / width))) / DEG
}
