/*
 * THE EXPOSURE PLAYGROUND'S ARITHMETIC. A demo of how settings change a
 * photograph, on one real photograph, with every effect computed here and
 * nothing guessed in the page.
 *
 * THE REFERENCE IS THE PHOTO AS SHOT. The surfer frame was taken on a Sony
 * a7 IV with the FE 70-300 G at 281 mm, 1/1600 s, f/7.1, ISO 200, exposure
 * compensation -1 (from its own EXIF). The picture as delivered is "right",
 * so the scene's exposure value is the EV of those settings, and any other
 * settings are that many stops brighter or darker than the picture.
 *
 *   EV100 = log2(N^2 / t) - log2(ISO / 100)     (src/core/exposure.ts)
 *
 * WHAT IS ASSUMED, written down once, because a demo that hides its
 * assumptions is a measurement pretending (the page says it is not one):
 *
 *   the board is 1.8 m long        a shortboard; it spans 770 px of the frame
 *   the frame is the sensor's short side across
 *                                  a 4:5 portrait from the full height
 *   the crowd is 8 m behind him    the wall of the pool
 *   he moves at 8 m/s, leftward    the top of an air, mostly sideways
 *
 * From the first two, the subject distance follows for any lens and body,
 * holding the framing: the playground keeps the picture the same size and
 * asks what the settings do to it, which is the question a beginner has.
 *
 * WHAT IT CANNOT DO. It cannot make the photo sharper or cleaner than it was
 * taken. Motion blur, background blur and grain are ADDED beyond the
 * original's own, and settings that would need less than the original had
 * show the original.
 */
import { brightnessFactor, ev100, meterReading, stopsOver, type MeterReading } from './exposure.ts'
import { SENSORS, type SensorName } from './fov.ts'

export const REFERENCE = {
  seconds: 1 / 1600,
  aperture: 7.1,
  iso: 200,
  focalMm: 281,
  sensor: 'fullFrame' as SensorName,
  /** The delivered photo's width in pixels, the frame every pixel figure is in. */
  imageWidthPx: 1946,
} as const

export const SCENE = {
  boardMeters: 1.8,
  boardPx: 770,
  backgroundBehindMeters: 8,
  subjectSpeedMps: 8,
} as const

export const SCENE_EV = ev100(REFERENCE.seconds, REFERENCE.aperture, REFERENCE.iso)

export interface Settings {
  seconds: number
  aperture: number
  iso: number
}

/*
 * THE LIGHT. Midday is the photo's own, from its EXIF. The other two are the
 * usual exposure values for those conditions, a convention like the starting
 * exposure table in exposure.ts and labelled "typical" on the page: they are
 * what lets a preset for a dim scene be dialled correctly, and the picture
 * then shows what those settings cost in blur and grain.
 */
export type Light = 'midday' | 'golden' | 'night'
export const LIGHTS: readonly { id: Light; label: string; ev: number }[] = [
  { id: 'midday', label: 'Bright sun, as shot', ev: SCENE_EV },
  { id: 'golden', label: 'Golden hour, typical', ev: 12 },
  { id: 'night', label: 'Floodlit pool at night, typical', ev: 8 },
]
export const lightEv = (light: Light) => LIGHTS.find((l) => l.id === light)?.ev ?? SCENE_EV

/** Stops brighter (positive) or darker (negative) than right, for the settings in this light. */
export function stopsFromScene(s: Settings, light: Light = 'midday'): number {
  return stopsOver(lightEv(light), s.seconds, s.aperture, s.iso)
}

/** The frame's width on the sensor in mm: a 4:5 portrait across the sensor's short side. */
export function frameWidthMm(sensor: SensorName): number {
  return SENSORS[sensor].h
}

/** Pixels in the delivered frame per mm on the sensor. */
export function pxPerSensorMm(sensor: SensorName): number {
  return REFERENCE.imageWidthPx / frameWidthMm(sensor)
}

/** Pixels per metre at the subject, from the board. Holds for any lens: the framing is kept. */
export const PX_PER_SUBJECT_METER = SCENE.boardPx / SCENE.boardMeters

/** How far away the surfer is, for this focal length and sensor, to frame him as the photo does. */
export function subjectDistanceMeters(focalMm: number, sensor: SensorName): number {
  /* board on sensor (mm) = f * L / s, and board on sensor = boardPx / pxPerSensorMm. */
  const boardOnSensorMm = SCENE.boardPx / pxPerSensorMm(sensor)
  return (focalMm * SCENE.boardMeters) / boardOnSensorMm
}

/**
 * The blur disc of the background on the sensor, in mm, focused on the
 * subject: the thin-lens circle of confusion for a point at distance D with
 * focus at s,  c = f^2 / (N (s - f)) * (D - s) / D.
 */
export function backgroundDiscMm(focalMm: number, aperture: number, subjectM: number, backgroundM: number): number {
  const f = focalMm / 1000
  const s = subjectM
  if (s <= f) return 0
  return ((f * f) / (aperture * (s - f))) * ((backgroundM - s) / backgroundM) * 1000
}

/** The background blur disc in the delivered frame's pixels. */
export function backgroundDiscPx(focalMm: number, aperture: number, sensor: SensorName): number {
  const s = subjectDistanceMeters(focalMm, sensor)
  return backgroundDiscMm(focalMm, aperture, s, s + SCENE.backgroundBehindMeters) * pxPerSensorMm(sensor)
}

export const REFERENCE_DISC_PX = backgroundDiscPx(REFERENCE.focalMm, REFERENCE.aperture, REFERENCE.sensor)

/** How far the surfer moves across the frame while the shutter is open, in pixels. */
export function motionStreakPx(seconds: number): number {
  return SCENE.subjectSpeedMps * seconds * PX_PER_SUBJECT_METER
}

export const REFERENCE_STREAK_PX = motionStreakPx(REFERENCE.seconds)

/**
 * The added amount, in px of the delivered frame, beyond what the photo
 * already has. Blurs add in quadrature, so a disc already of r0 grows to r by
 * sqrt(r^2 - r0^2) more, and never less than nothing.
 */
export function addedBlur(px: number, referencePx: number): number {
  return px <= referencePx ? 0 : Math.sqrt(px * px - referencePx * referencePx)
}

/**
 * GRAIN, as a share of full scale. Shot noise rises with the square root of
 * the gain, so the noise at ISO n against the photo's own is sqrt(n / 200);
 * what is ADDED is the part above the original's, in quadrature again. The
 * base level is a convention for a modern full frame sensor at ISO 200, about
 * one percent of full scale, and it is the one number here that is a choice
 * rather than a consequence.
 */
export const BASE_GRAIN = 0.01

export function addedGrain(iso: number): number {
  const ratio = iso / REFERENCE.iso
  return ratio <= 1 ? 0 : BASE_GRAIN * Math.sqrt(ratio - 1)
}

/** A standard deviation for a uniform streak of length L: L / sqrt(12). */
export const streakSigma = (lengthPx: number) => lengthPx / Math.sqrt(12)

/** A disc of diameter d has the same variance as a Gaussian of sigma d / 4. */
export const discSigma = (diameterPx: number) => diameterPx / 4

export interface PlaygroundFrame {
  stops: number
  reading: MeterReading
  brightness: number
  /** Gaussian sigmas and grain, in px of the delivered frame. */
  motionSigmaPx: number
  backgroundSigmaPx: number
  grain: number
  subjectMeters: number
  backgroundDiscPx: number
  streakPx: number
}

export function playgroundFrame(s: Settings, focalMm: number, sensor: SensorName, light: Light = 'midday'): PlaygroundFrame {
  const stops = stopsFromScene(s, light)
  const disc = backgroundDiscPx(focalMm, s.aperture, sensor)
  const streak = motionStreakPx(s.seconds)
  return {
    stops,
    reading: meterReading(stops),
    brightness: brightnessFactor(stops),
    motionSigmaPx: streakSigma(addedBlur(streak, REFERENCE_STREAK_PX)),
    backgroundSigmaPx: discSigma(addedBlur(disc, REFERENCE_DISC_PX)),
    grain: addedGrain(s.iso),
    subjectMeters: subjectDistanceMeters(focalMm, sensor),
    backgroundDiscPx: disc,
    streakPx: streak,
  }
}

/* The slider stops, in third stops where a camera has them. */
export const SHUTTER_STOPS = [
  1 / 8000, 1 / 4000, 1 / 2000, 1 / 1600, 1 / 1000, 1 / 500, 1 / 250, 1 / 125, 1 / 60, 1 / 30, 1 / 15, 1 / 8, 1 / 4, 1 / 2, 1,
] as const
export const APERTURE_STOPS = [1.4, 2, 2.8, 4, 5.6, 6.3, 7.1, 8, 11, 16, 22] as const
export const ISO_STOPS = [100, 200, 400, 800, 1600, 3200, 6400, 12800, 25600] as const

export interface Preset {
  id: string
  label: string
  light: Light
  settings: Settings
}

/*
 * EACH PRESET IS SETTINGS FOR A LIGHT, and exposes it right: the meter reads
 * "right" for all four (presets test in playground.test.ts). What differs is
 * what each one costs. Show the spray is the slowest shutter the sun allows at
 * f/22 and ISO 100 with no ND filter; slower would need one.
 */
export const PRESETS: readonly Preset[] = [
  { id: 'freeze', label: 'Freeze the air', light: 'midday', settings: { seconds: 1 / 2000, aperture: 6.3, iso: 200 } },
  { id: 'golden', label: 'Golden hour', light: 'golden', settings: { seconds: 1 / 1000, aperture: 4, iso: 400 } },
  { id: 'spray', label: 'Show the spray', light: 'midday', settings: { seconds: 1 / 125, aperture: 22, iso: 100 } },
  { id: 'night', label: 'Night pool', light: 'night', settings: { seconds: 1 / 500, aperture: 2.8, iso: 1600 } },
]

/** "1/2000", "1/2", "1 s". */
export function shutterWords(seconds: number): string {
  return seconds >= 1 ? `${Math.round(seconds)} s` : `1/${Math.round(1 / seconds)}`
}

/*
 * THE PHOTOGRAPHS AS SHIPPED. Both are 1200 x 1500, scaled together from the
 * 1946 x 2433 originals so the cutout still lies on the background pixel for
 * pixel; the cutout is cropped to its own box, which sits at `surfer` in the
 * shipped frame. Every figure above is in the ORIGINAL frame's pixels, and
 * the page draws in those units, so nothing here needs converting twice.
 */
export const PHOTO = {
  original: { width: REFERENCE.imageWidthPx, height: 2433 },
  shipped: { width: 1200, height: 1500 },
  surfer: { x: 337, y: 359, width: 483, height: 634 },
} as const

/** The cutout's box in original-frame pixels. */
export function surferBox() {
  const k = PHOTO.original.width / PHOTO.shipped.width
  const { x, y, width, height } = PHOTO.surfer
  return { x: x * k, y: y * k, width: width * k, height: height * k }
}
