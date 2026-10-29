/*
 * WHERE A DIRECTION IN THE SKY LANDS ON THE CAMERA PICTURE.
 *
 * The phone reports how it is turned as three angles (W3C DeviceOrientation:
 * alpha about the vertical, beta about the phone's left-right axis, gamma
 * about its long axis, applied Z then X then Y). Those make a rotation from
 * the phone's own axes to east-north-up. The back camera looks out along the
 * phone's -Z. A direction in the world -- the sun at an azimuth and an
 * altitude -- is turned into the phone's axes and projected through a simple
 * pinhole of the camera's field of view.
 *
 * WHAT IS NOT KNOWN AND IS SAID SO. A web page cannot read the camera's field
 * of view, and a compass is often off by several degrees near metal or a car.
 * So the field of view is an assumption the viewfinder states on screen, and
 * the heading carries an offset the shooter sets by tapping a known thing --
 * the sun -- where it really is (calibrationFromTap). Everything else is
 * arithmetic.
 */

const DEG = Math.PI / 180

/** Phone orientation, degrees, as DeviceOrientationEvent gives it with alpha made absolute (0 = top of phone north). */
export interface Orientation {
  alpha: number
  beta: number
  gamma: number
}

/** The camera's field of view, degrees, across and up, in the orientation the picture is shown. */
export interface CameraFov {
  h: number
  v: number
}

/*
 * THE ASSUMED PHONE CAMERA, said on the viewfinder. A phone's main (1x)
 * camera is about a 26 mm equivalent lens: on a 4:3 picture that is about 65
 * degrees across the long side and 50 across the short. Held upright the
 * long side is vertical.
 */
export const ASSUMED_PHONE_FOV_PORTRAIT: CameraFov = { h: 50, v: 65 }

type Mat = [number, number, number, number, number, number, number, number, number]

/** Rotation from the phone's axes to east-north-up, per the W3C spec's Z-X'-Y'' order. */
export function phoneToWorld({ alpha, beta, gamma }: Orientation): Mat {
  const cA = Math.cos(alpha * DEG)
  const sA = Math.sin(alpha * DEG)
  const cB = Math.cos(beta * DEG)
  const sB = Math.sin(beta * DEG)
  const cG = Math.cos(gamma * DEG)
  const sG = Math.sin(gamma * DEG)
  /*
   * R = Rz(alpha) Rx(beta) Ry(gamma), with x east, y north, z up. alpha is
   * counter-clockwise seen from above, which is why a compass heading h gives
   * alpha = 360 - h (see alphaFromHeading).
   */
  return [
    cA * cG - sA * sB * sG, -sA * cB, cA * sG + sA * sB * cG,
    sA * cG + cA * sB * sG, cA * cB, sA * sG - cA * sB * cG,
    -cB * sG, sB, cB * cG,
  ]
}

/** A compass heading of the phone's top edge, clockwise from north, as the spec's alpha. */
export function alphaFromHeading(heading: number): number {
  return (360 - heading) % 360
}

/** A world direction, east-north-up, from a compass azimuth and an altitude. */
export function enu(azimuth: number, altitude: number): [number, number, number] {
  const ca = Math.cos(altitude * DEG)
  return [ca * Math.sin(azimuth * DEG), ca * Math.cos(azimuth * DEG), Math.sin(altitude * DEG)]
}

/**
 * Where a direction lands on the picture, as a fraction of its width and
 * height from the top-left (0.5, 0.5 is the centre), or null when it is behind
 * the camera. `headingOffset` is the calibration: degrees added to every
 * azimuth before projecting.
 */
export function project(
  azimuth: number,
  altitude: number,
  orientation: Orientation,
  fov: CameraFov,
  headingOffset = 0,
): { x: number; y: number } | null {
  const m = phoneToWorld(orientation)
  const [e, n, u] = enu(azimuth - headingOffset, altitude)
  /* World to phone is the transpose. */
  const px = m[0] * e + m[3] * n + m[6] * u
  const py = m[1] * e + m[4] * n + m[7] * u
  const pz = m[2] * e + m[5] * n + m[8] * u
  /* The back camera looks along -Z. */
  const depth = -pz
  if (depth <= 1e-6) return null
  const x = px / depth / Math.tan((fov.h / 2) * DEG)
  const y = py / depth / Math.tan((fov.v / 2) * DEG)
  return { x: 0.5 + x / 2, y: 0.5 - y / 2 }
}

/** The direction the centre of a picture point looks at: the inverse of project, for a tap. */
export function unproject(
  point: { x: number; y: number },
  orientation: Orientation,
  fov: CameraFov,
): { azimuth: number; altitude: number } {
  const m = phoneToWorld(orientation)
  const px = (point.x - 0.5) * 2 * Math.tan((fov.h / 2) * DEG)
  const py = (0.5 - point.y) * 2 * Math.tan((fov.v / 2) * DEG)
  const pz = -1
  const e = m[0] * px + m[1] * py + m[2] * pz
  const n = m[3] * px + m[4] * py + m[5] * pz
  const u = m[6] * px + m[7] * py + m[8] * pz
  const len = Math.hypot(e, n, u)
  return {
    azimuth: ((Math.atan2(e, n) / DEG) + 360) % 360,
    altitude: Math.asin(u / len) / DEG,
  }
}

/**
 * TAP CALIBRATION. The shooter taps where the sun really is; the offset is how
 * far the compass is off, in degrees of azimuth, wrapped to -180..180. Only
 * the azimuth is corrected: the phone's tilt sensors are far better than its
 * compass, and an altitude offset would hide a bad tap rather than fix one.
 */
export function calibrationFromTap(
  tap: { x: number; y: number },
  truth: { azimuth: number },
  orientation: Orientation,
  fov: CameraFov,
): number {
  const seen = unproject(tap, orientation, fov)
  return ((((seen.azimuth - truth.azimuth) % 360) + 540) % 360) - 180
}

/** The share of the picture a camera frame fills, from its field of view and the phone's. */
export function frameBox(frame: CameraFov, phone: CameraFov): { w: number; h: number } {
  return {
    w: Math.tan((frame.h / 2) * DEG) / Math.tan((phone.h / 2) * DEG),
    h: Math.tan((frame.v / 2) * DEG) / Math.tan((phone.v / 2) * DEG),
  }
}

/*
 * THE FIELD OF THE PICTURE AS SHOWN. The video fills the screen and is cropped
 * to do it, so the field across a tall phone screen is narrower than the
 * camera's own. The long side keeps the camera's long-side angle; the short
 * side is cut to the screen's shape. With 50 x 65 assumed, a 70 mm
 * full-frame box drew nearly square on a 390 x 844 screen, because it was
 * sized against 50 degrees across when about 33 were visible.
 */
/*
 * THE PHONE'S MAIN CAMERA, about a 26 mm equivalent: 2·atan(18/26) = 69.4
 * degrees along the long side. Settable in the viewfinder's "i"
 * (src/lib/phoneCamera.ts), because a web page cannot read it.
 */
export const PHONE_MAIN_LONG_SIDE_DEG = 69
/** The 0.5× ultra-wide, about a 13 mm equivalent: 2·atan(18/13) = 108 degrees. */
export const PHONE_ULTRA_LONG_SIDE_DEG = 108
export const ASSUMED_PHONE_LONG_SIDE_DEG = PHONE_MAIN_LONG_SIDE_DEG

/**
 * Whether a lens sees wider than the phone's camera, long side against long
 * side. Not against the screen: the screen crops the camera, and a frame
 * that only runs past the screen's edge is drawn running past it, not called
 * wider.
 */
export function lensWiderThanPhone(lensLongSideDeg: number, phoneLongSideDeg: number): boolean {
  return lensLongSideDeg > phoneLongSideDeg
}

/**
 * What a tap can calibrate the compass on: the sun when it is up, the moon
 * when the sun is down and the moon is up, nothing when both are down.
 * Altitudes in degrees.
 */
export function calibrationTarget(sunAltitude: number, moonAltitude: number): 'sun' | 'moon' | null {
  if (sunAltitude > 0) return 'sun'
  if (moonAltitude > 0) return 'moon'
  return null
}

export function visibleFov(widthPx: number, heightPx: number, longSideDeg: number = ASSUMED_PHONE_LONG_SIDE_DEG): CameraFov {
  const t = Math.tan((longSideDeg / 2) * DEG)
  if (heightPx >= widthPx) {
    return { h: (2 * Math.atan((t * widthPx) / heightPx)) / DEG, v: longSideDeg }
  }
  return { h: longSideDeg, v: (2 * Math.atan((t * heightPx) / widthPx)) / DEG }
}
