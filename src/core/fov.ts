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
 * The band of frame widths used to BOUND WHAT THE MODEL IS ASKED FOR.
 *
 * WHAT THIS IS NOT, ANY MORE. It used to be the threshold behind an on-screen
 * warning: a frame wider than the max got a red badge reading "the subject will
 * be a speck". That was 60 m standing in for the size of the subject, which
 * this app does not know, and it fired on every position of a drone shoot,
 * where a wide frame is the entire point. See classifyFraming.
 *
 * It survives here because bounding a REQUEST is a different act from making a
 * CLAIM. Telling a model "do not put positions further out than this" shapes a
 * proposal the shooter then reads; telling the shooter "your subject will be a
 * speck" asserts something about a building whose size nobody entered. The
 * first can be a rough judgement call. The second cannot.
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
export function standoffBand(
  hFOV: number,
  platform: 'ground' | 'air',
  /**
   * How wide the subject is, when the shooter has said. Given, it replaces the
   * guess: a 200 m marina and a 12 m food truck are not asked for from the same
   * distance, and the shooter is the only one who knows which it is.
   */
  subjectMeters: number | null = null,
): StandoffBand {
  const widest =
    subjectMeters === null || subjectMeters <= 0
      ? USABLE_FRAME_WIDTH_METERS.max
      : subjectMeters * WIDE_FRAME_RATIO
  return {
    minMeters: rangeForFrameWidth(USABLE_FRAME_WIDTH_METERS.min, hFOV),
    maxMeters: Math.min(
      rangeForFrameWidth(widest, hFOV),
      PRACTICAL_MAX_STANDOFF_METERS[platform],
    ),
  }
}

/**
 * HOW MANY TIMES THE SUBJECT'S OWN WIDTH THE FRAME HAS TO BE BEFORE IT IS
 * WORTH SAYING ANYTHING.
 *
 * A frame has to be wider than the subject or there is no picture, so a factor
 * of 1 would fire on every correct shot. Three was tried and was still too
 * eager: a 400 ft aerial of a 45 m building frames 152 m, which is 3.4 times,
 * and that is a perfectly ordinary aerial with its context in it. At FOUR the
 * subject is a quarter of the frame across and a sixteenth of its area, which
 * is the case the shooter described as the subject being a speck, and the
 * reported 28mm-from-across-the-street shot is about seven.
 *
 * ERRING TOWARDS SILENCE IS THE POINT. "A warning that fires on everything is
 * not a warning, it is wallpaper, and it trains me to ignore the one time it
 * matters." A missed wide frame costs a glance at the frame width, which is
 * printed on every card regardless. A false one costs the flag its meaning.
 *
 * A RATIO, NOT A DISTANCE, which is the answer to "it cannot be the same
 * threshold for a 400 ft aerial and a 28mm from across the street". It is not.
 * A 400 ft aerial framing 300 m of a 200 m marina is 1.5x and says nothing; a
 * 28mm framing 90 m of a 13 m restaurant is 7x and does. The platform never
 * enters it, because the thing that actually differs between those two shots is
 * how big the subject is, and that is now a number rather than an assumption.
 */
export const WIDE_FRAME_RATIO = 4

/**
 * What is worth saying about this standoff, if anything.
 *
 * WHAT WAS REPORTED. Every position of a drone shoot carrying a red WIDE badge.
 * "A warning that fires on everything is not a warning, it is wallpaper, and it
 * trains me to ignore the one time it matters." The card said "At this distance
 * the frame is wider than the event. The subject will be a speck." while Street
 * View showed the building framed exactly as wanted.
 *
 * TWO THINGS WERE WRONG AND BOTH ARE FIXED HERE.
 *
 * First, it stated a verdict it could not support. The old test was frame width
 * against USABLE_FRAME_WIDTH_METERS.max, a flat 60 m standing in for the size
 * of a subject nobody had entered. So the app did not know the subject would be
 * a speck; it knew the frame was wider than 60 m, which is not the same fact and
 * is not interesting on its own. The frame width is still computed and still
 * shown, because it is true: "at 28mm from here you frame 90 m across" is a
 * measurement. The comparison is only made when there is something real to
 * compare against, and `subjectMeters === null` means the shooter has not said,
 * in which case NOTHING is claimed. That is the dash-rather-than-a-zero rule
 * applied to a judgement instead of a number.
 *
 * Second, wide is the normal state of an aerial. Flying is how you get wide, so
 * a threshold in metres fired on every aerial ever planned. The replacement is a
 * ratio against the subject's own size, so the aerial that is framing its
 * subject says nothing and the one that is 500 m out from a food truck still
 * does.
 *
 * WHAT REMAINS A FLAT DISTANCE, deliberately: beyond-standoff. That one is not
 * about the subject at all. It is haze, heat shimmer, and on the air side
 * keeping sight of a 724 g aircraft, and those do not care how big the thing
 * being photographed is.
 */
export type FramingWarning = 'frame-wider-than-subject' | 'beyond-standoff'

/**
 * How many times wider than the subject the frame is, or null when the subject
 * size is unknown. The number the copy quotes, so the screen and the test
 * cannot drift.
 */
export function frameSubjectRatio(
  frameWidth: number,
  subjectMeters: number | null,
): number | null {
  if (subjectMeters === null || subjectMeters <= 0 || frameWidth <= 0) return null
  return frameWidth / subjectMeters
}

export function classifyFraming(
  subjectRangeMeters: number,
  hFOV: number,
  platform: 'ground' | 'air',
  /** How wide the subject is, or null when nobody has said. */
  subjectMeters: number | null = null,
): FramingWarning[] {
  const warnings: FramingWarning[] = []
  if (subjectRangeMeters <= 0) return warnings

  const ratio = frameSubjectRatio(frameWidthMeters(subjectRangeMeters, hFOV), subjectMeters)
  if (ratio !== null && ratio > WIDE_FRAME_RATIO) {
    warnings.push('frame-wider-than-subject')
  }
  if (subjectRangeMeters > PRACTICAL_MAX_STANDOFF_METERS[platform]) {
    warnings.push('beyond-standoff')
  }
  return warnings
}
