export interface SensorSize {
  /** Sensor width in millimetres. */
  w: number
  /** Sensor height in millimetres. */
  h: number
}

export const SENSORS = {
  fullFrame: { w: 35.9, h: 24.0 },
  apsc: { w: 23.5, h: 15.6 },
} as const satisfies Record<string, SensorSize>

export type SensorName = keyof typeof SENSORS

export interface FOV {
  /** Horizontal field of view in degrees. */
  hFOV: number
  /** Vertical field of view in degrees. Deliverables are vertical cuts, so this is the one that matters. */
  vFOV: number
  /**
   * Diagonal field of view in degrees. Not used for the cone, which is
   * horizontal, but it is how camera makers quote a spec, so it is the number
   * that lets a published figure be checked against this file. DJI quote the
   * Air 3S wide camera at 84 degrees; computeFOV(24, fullFrame) lands on 84.1,
   * which is what proves the 35mm equivalent route in kit.ts is sound.
   */
  dFOV: number
}

function angleOfView(size: number, focalLength: number): number {
  return 2 * Math.atan(size / (2 * focalLength)) * (180 / Math.PI)
}

export function computeFOV(focalLength: number, sensor: SensorSize): FOV {
  return {
    hFOV: angleOfView(sensor.w, focalLength),
    vFOV: angleOfView(sensor.h, focalLength),
    dFOV: angleOfView(Math.hypot(sensor.w, sensor.h), focalLength),
  }
}

const DEG_TO_RAD = Math.PI / 180

/**
 * How wide the frame is, in metres, at a given distance.
 *
 *   frameWidth = 2 * range * tan(hFOV / 2)
 *
 * This is the number that says whether a position is sane. A 28mm lens at 300
 * metres frames 385 metres of riverbank, which is a landscape, not the shot the
 * plan asked for. Range on its own does not say that; frame width does.
 */
export function frameWidthMeters(rangeMeters: number, hFOV: number): number {
  return 2 * rangeMeters * Math.tan((hFOV / 2) * DEG_TO_RAD)
}

/** The inverse: how far back you must stand for the frame to be this wide. */
export function rangeForFrameWidth(frameWidthMeters: number, hFOV: number): number {
  return frameWidthMeters / (2 * Math.tan((hFOV / 2) * DEG_TO_RAD))
}

/**
 * The band of frame widths an event shot actually lives in.
 *
 * Below the minimum you are framing one face; above the maximum you are framing
 * the whole town. Both ends are judgement calls about this kind of shooting, not
 * physics, which is why they are named constants here rather than buried.
 */
export const USABLE_FRAME_WIDTH_METERS = { min: 3, max: 60 } as const

/**
 * However long the lens, there is a distance past which an event shot stops
 * working: haze, heat shimmer, and no separation between subject and
 * background. A 600mm frames 60 metres from a kilometre away, and the arithmetic
 * is happy about it, but the picture is not.
 *
 * Air is held shorter than ground. A drone at 400 metres of standoff is at the
 * edge of keeping visual line of sight on a 724 gram aircraft.
 */
export const PRACTICAL_MAX_STANDOFF_METERS = { ground: 450, air: 400 } as const

export interface StandoffBand {
  minMeters: number
  maxMeters: number
}

/**
 * How far from the subject a given field of view can usefully stand. This is
 * what gets sent to the model as a hard maximum, and what the app checks the
 * returned positions against afterwards.
 */
export function standoffBand(hFOV: number, platform: 'ground' | 'air'): StandoffBand {
  return {
    minMeters: rangeForFrameWidth(USABLE_FRAME_WIDTH_METERS.min, hFOV),
    maxMeters: Math.min(
      rangeForFrameWidth(USABLE_FRAME_WIDTH_METERS.max, hFOV),
      PRACTICAL_MAX_STANDOFF_METERS[platform],
    ),
  }
}

/**
 * What is wrong with this standoff, if anything.
 *
 * Deliberately only two cases, and deliberately NOT "the frame is too tight".
 * This shooter spends about seventy percent of ground time on long glass; a two
 * metre frame width at four hundred metres is the 600mm doing exactly its job.
 * Flagging that would cry wolf on the most common correct position in the plan.
 * The failure being reported is the opposite one: positions landing so far out
 * that the frame swallows the whole venue.
 */
export type FramingWarning = 'frame-too-wide' | 'beyond-standoff'

export function classifyFraming(
  subjectRangeMeters: number,
  hFOV: number,
  platform: 'ground' | 'air',
): FramingWarning[] {
  const warnings: FramingWarning[] = []
  if (subjectRangeMeters <= 0) return warnings

  if (frameWidthMeters(subjectRangeMeters, hFOV) > USABLE_FRAME_WIDTH_METERS.max) {
    warnings.push('frame-too-wide')
  }
  if (subjectRangeMeters > PRACTICAL_MAX_STANDOFF_METERS[platform]) {
    warnings.push('beyond-standoff')
  }
  return warnings
}
