/*
 * THE SUN, WHERE IT ACTUALLY IS, IN THE SKY ABOVE THE MAP.
 *
 * WHY THIS EXISTS. The app has always drawn the sun's AZIMUTH as a ray on the
 * ground, which is the half of the answer a flat map has room for. The other
 * half is the altitude, and an altitude has nowhere to live on a flat map: 8
 * degrees and 48 degrees produce the same ray. Tilted over real elevation
 * there is a sky in frame, and the sun can be put in it at both angles at
 * once, which is the entire reason for the terrain.
 *
 * THE CAMERA MODEL. A standard pinhole projection, built from the four numbers
 * MapLibre makes public: bearing, pitch, the vertical field of view, and the
 * canvas size. Nothing here reaches into map.transform, which is not public
 * and has changed shape between versions.
 *
 *   east-north-up vectors throughout, because that is the frame the sun's
 *   azimuth and altitude are already in and converting once is cheaper than
 *   converting at every call site
 *
 *   PITCH 0 IS NADIR in MapLibre, so the optical axis sits at an elevation of
 *   (pitch - 90) degrees: straight down at 0, horizontal at 90. Getting that
 *   backwards puts the sun underground at noon, which is the kind of thing
 *   that looks like a sign error and is one.
 *
 *   RIGHT IS DERIVED FROM THE BEARING, not from a cross product with world
 *   up. At pitch 0 the optical axis IS world up, so cross(up, forward) is the
 *   zero vector and the whole basis collapses. (cos B, -sin B, 0) is
 *   well-defined at every pitch.
 *
 * VERIFIED AGAINST MAPLIBRE ITSELF rather than against my own arithmetic: for
 * a point on the ground, this model and map.project agree to within a pixel
 * across pitches and bearings. See the projection audit's sky section. A sky
 * direction is the same projection with a positive elevation, so agreeing on
 * the ground is the evidence that matters.
 */

import { normalizeBearing } from './sun.ts'

export interface SkyCamera {
  /** Degrees, compass. */
  bearing: number
  /** Degrees. 0 is straight down, 90 is horizontal. */
  pitch: number
  /** Vertical field of view in degrees, from map.getVerticalFieldOfView(). */
  fovDegrees: number
  /** CSS pixels. */
  width: number
  height: number
  /**
   * THE MAP'S PADDING, WHICH MOVES THE OPTICAL AXIS OFF THE CANVAS CENTRE.
   *
   * This app pads the map at the bottom so the sheet does not cover the pin,
   * and MapLibre honours that by centring the map inside the PADDED box. So
   * the principal point is the centre of that box, not of the canvas.
   *
   * MISSING THIS COST AN HOUR. The model agreed with MapLibre to 0.00px in a
   * bare page and disagreed by 39 to 71 pixels inside the app, which looked
   * exactly like a broken camera model and was a padded viewport. It was the
   * projection audit that caught it, because the audit runs in PLAN where the
   * sheet is open; every standalone check had run with no padding at all.
   */
  padding?: { top: number; bottom: number; left: number; right: number }
}

export interface SkyPoint {
  x: number
  y: number
  /** In front of the camera. False means the direction is behind you. */
  inFront: boolean
  /** Inside the canvas as well as in front of it. */
  onScreen: boolean
}

const RAD = Math.PI / 180

/** East, north, up for a compass azimuth and an elevation above the horizon. */
export function directionVector(
  azimuth: number,
  altitude: number,
): [number, number, number] {
  const az = normalizeBearing(azimuth) * RAD
  const alt = altitude * RAD
  const horizontal = Math.cos(alt)
  return [horizontal * Math.sin(az), horizontal * Math.cos(az), Math.sin(alt)]
}

const dot = (a: readonly number[], b: readonly number[]) =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

const cross = (a: readonly number[], b: readonly number[]): [number, number, number] => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]

/**
 * Where a direction in the sky lands on the canvas.
 *
 * Returns a point even when it is off screen or behind the camera, with flags
 * saying which, because the caller needs to distinguish "the sun is up and to
 * the left, off frame" from "the sun is behind you" and those want different
 * things on screen.
 */
export function projectSky(azimuth: number, altitude: number, camera: SkyCamera): SkyPoint {
  const s = directionVector(azimuth, altitude)

  /* The optical axis: same azimuth as the bearing, elevation pitch - 90. */
  const f = directionVector(camera.bearing, camera.pitch - 90)
  /* Horizontal, to the right of the bearing. Well-defined at every pitch. */
  const b = normalizeBearing(camera.bearing) * RAD
  const r: [number, number, number] = [Math.cos(b), -Math.sin(b), 0]
  /* Image up. r x f, which is world up when looking at the horizon. */
  const u = cross(r, f)

  const depth = dot(s, f)

  /*
   * MAPLIBRE'S ACTUAL CONVENTION, ESTABLISHED RATHER THAN GUESSED.
   *
   * The principal point is the centre of the PADDED box, and the focal length
   * comes from the FULL canvas height. That pairing is not the obvious one and
   * I had it wrong twice:
   *
   *   padded focal + padded centre    out by 12.16 px
   *   FULL focal + padded centre      0.00 px
   *   full focal + canvas centre      out by 88 px
   *
   * Which is to say padding MOVES the camera's axis without NARROWING its
   * field of view. Obvious once stated, and the difference between a sun in
   * the right place and one 88 pixels up the sky.
   */
  const pad = camera.padding ?? { top: 0, bottom: 0, left: 0, right: 0 }
  const centreX = (pad.left + (camera.width - pad.right)) / 2
  const centreY = (pad.top + (camera.height - pad.bottom)) / 2
  const focal = camera.height / 2 / Math.tan((camera.fovDegrees / 2) * RAD)

  const inFront = depth > 1e-6
  if (!inFront) {
    return { x: centreX, y: centreY, inFront: false, onScreen: false }
  }

  const x = centreX + (focal * dot(s, r)) / depth
  const y = centreY - (focal * dot(s, u)) / depth

  return {
    x,
    y,
    inFront: true,
    onScreen: x >= 0 && x <= camera.width && y >= 0 && y <= camera.height,
  }
}

/**
 * WHETHER THERE IS ANY SKY IN FRAME AT ALL.
 *
 * At low pitch the camera is looking down and the horizon is behind the top
 * edge, so there is nowhere for a sun to be. Drawing it anyway would put a sun
 * on a patch of ground, which is worse than not drawing it: a flat map at
 * least makes no claim about altitude.
 *
 * The horizon sits at image elevation (90 - pitch) above the optical axis, and
 * half the vertical field of view is how far above the axis the frame reaches.
 */
export function horizonInFrame(camera: SkyCamera): boolean {
  return 90 - camera.pitch < camera.fovDegrees / 2
}
