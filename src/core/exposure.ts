/*
 * HOW LONG THE SHUTTER CAN STAY OPEN BEFORE THE STARS SMEAR.
 *
 * Pure arithmetic and one lookup table. No React, no fetch, no model.
 *
 * TWO DIFFERENT KINDS OF NUMBER LIVE HERE AND THEY ARE NOT THE SAME KIND.
 *
 *   npfSeconds is COMPUTED. It follows from the pixel pitch, the aperture and
 *   the focal length, and it has a right answer given those three.
 *
 *   STARTING_EXPOSURE is a TABLE OF CONVENTIONS. It is where experienced
 *   night shooters start, it is not derived from anything, and it is not
 *   measured. The UI says "a starting point, not an answer" because that is
 *   the honest description, and this file must never grow a formula that
 *   makes it look computed.
 *
 * Keeping those apart is the whole reason the table is a table.
 */

/**
 * Pixel pitch in microns, from the sensor width and the pixel count across it.
 *
 *   pitch = sensor width in mm * 1000 / pixels across
 *
 * NULL RATHER THAN A GUESS when either input is missing or absurd. A pitch
 * invented from a sensor size alone would be an invented NPF time, and an
 * invented NPF time is a night of trailed stars.
 */
export function pixelPitchMicrons(
  sensorWidthMm: number,
  horizontalPixels: number,
): number | null {
  if (!Number.isFinite(sensorWidthMm) || sensorWidthMm <= 0) return null
  if (!Number.isFinite(horizontalPixels) || horizontalPixels <= 0) return null
  return (sensorWidthMm * 1000) / horizontalPixels
}

/**
 * The NPF rule.
 *
 *   seconds = (35 * aperture + 30 * pitch) / focal length
 *
 * aperture is the f-number, pitch is microns, focal length is millimetres.
 *
 * WHAT IT IS FOR, WHICH IS NARROWER THAN IT LOOKS. NPF answers "how long
 * before a star stops being a point at 100 percent on this sensor". It is a
 * pixel-level criterion, which is why pitch is in it at all and why the same
 * lens gives a different answer on two bodies. See the note returned beside
 * it: meteor work tolerates roughly double, because a meteor is a streak and
 * nobody is pixel-peeping the stars behind it.
 */
export function npfSeconds(
  aperture: number,
  pitchMicrons: number,
  focalLength: number,
): number | null {
  if (!Number.isFinite(aperture) || aperture <= 0) return null
  if (!Number.isFinite(pitchMicrons) || pitchMicrons <= 0) return null
  if (!Number.isFinite(focalLength) || focalLength <= 0) return null
  return (35 * aperture + 30 * pitchMicrons) / focalLength
}

/**
 * What NPF is and is not, carried with every number so it cannot be read bare.
 *
 * A bare "9 s" beside a lens reads as permission. These two sentences are the
 * difference between a number and an instruction, and they travel with it into
 * the UI and into the .ics description.
 */
export const NPF_NOTE =
  'Pinpoint stars at 100 percent. Meteor work tolerates roughly double, because a meteor is a streak and the stars behind it are not the subject.'

/** An answer, or a stated reason there is none. Never a number by default. */
export type NpfAnswer =
  | { kind: 'seconds'; seconds: number; pitchMicrons: number; note: string }
  | { kind: 'reason'; reason: string }

/**
 * NPF for one body and one lens, or the reason it cannot be given.
 *
 * THE REASON NAMES THE THING THAT IS MISSING, and names it by its own name.
 * "No pixel count for the Sony a7III" is actionable: somebody can go and read
 * a spec sheet. "Unavailable" is not. This is the same rule the wind readout
 * follows, and the same rule that keeps a dash in place of a zero.
 */
export function npfForCamera(input: {
  bodyName: string
  sensorWidthMm: number
  /** Null when the body has no recorded pixel count. Never inferred. */
  horizontalPixels: number | null
  lensName: string
  /** Null when the lens has no recorded maximum aperture. Never inferred. */
  aperture: number | null
  focalLength: number
}): NpfAnswer {
  if (input.horizontalPixels === null) {
    return { kind: 'reason', reason: `No pixel count recorded for the ${input.bodyName}` }
  }
  if (input.aperture === null) {
    return { kind: 'reason', reason: `No maximum aperture recorded for the ${input.lensName}` }
  }
  const pitch = pixelPitchMicrons(input.sensorWidthMm, input.horizontalPixels)
  if (pitch === null) {
    return { kind: 'reason', reason: `The ${input.bodyName} sensor size does not give a pixel pitch` }
  }
  const seconds = npfSeconds(input.aperture, pitch, input.focalLength)
  if (seconds === null) {
    return { kind: 'reason', reason: `No focal length to compute against for the ${input.lensName}` }
  }
  return { kind: 'seconds', seconds, pitchMicrons: pitch, note: NPF_NOTE }
}

/**
 * How dark the sky is, coarsely. Three buckets, because a finer grid would
 * imply the table behind it is finer than it is.
 */
export type SkyDarkness =
  /** Sun below -18 and no moon up. The only state the table is really for. */
  | 'astro-dark'
  /** Sun below -18 but the moon is up and lighting the ground. */
  | 'moonlit'
  /** Not yet astronomically dark. Twilight is still on the sky. */
  | 'twilight'

/** What the exposure is being started for. */
export type ExposureTarget = 'meteors' | 'milkyway' | 'moon'

export interface StartingExposure {
  iso: number
  aperture: number
  seconds: number
}

/*
 * A TABLE OF STARTING POINTS. NOT DERIVED, NOT COMPUTED, NOT A PROMISE.
 *
 * These are the settings a night shooter dials in before taking the first
 * frame and then changes. They come from the common practice of the craft, not
 * from a measurement in this repo, and this comment exists so nobody later
 * attaches a false citation to them or rewrites them as a formula.
 *
 * WHY A TABLE AND NOT A FORMULA. An exposure formula would need the actual sky
 * brightness, which needs a light pollution source this app does not have and
 * is not getting in this pass. A table says plainly that the answer is coarse.
 *
 * THE MOON ROWS IGNORE THE DARKNESS BUCKET, and that is correct rather than
 * lazy: when the moon is the subject it is a sunlit rock, roughly the daylight
 * exposure, and how dark the rest of the sky is does not change it. The rows
 * are repeated rather than collapsed so the table stays one shape.
 */
export const STARTING_EXPOSURE: Record<
  ExposureTarget,
  Record<SkyDarkness, StartingExposure>
> = {
  meteors: {
    'astro-dark': { iso: 3200, aperture: 2.8, seconds: 20 },
    moonlit: { iso: 1600, aperture: 2.8, seconds: 15 },
    twilight: { iso: 800, aperture: 2.8, seconds: 10 },
  },
  milkyway: {
    'astro-dark': { iso: 3200, aperture: 2.8, seconds: 15 },
    moonlit: { iso: 1600, aperture: 2.8, seconds: 13 },
    twilight: { iso: 800, aperture: 2.8, seconds: 8 },
  },
  moon: {
    /* The sunlit-rock exposure. 1/125 at f/11, ISO 100. */
    'astro-dark': { iso: 100, aperture: 11, seconds: 1 / 125 },
    moonlit: { iso: 100, aperture: 11, seconds: 1 / 125 },
    twilight: { iso: 100, aperture: 11, seconds: 1 / 125 },
  },
}

/** The label the UI must put on anything out of STARTING_EXPOSURE. */
export const STARTING_EXPOSURE_LABEL = 'a starting point, not an answer'

/** The starting exposure for a target and a sky, or null for an unknown pair. */
export function startingExposure(
  target: ExposureTarget,
  darkness: SkyDarkness,
): StartingExposure | null {
  return STARTING_EXPOSURE[target]?.[darkness] ?? null
}

/*
 * EXPOSURE VALUE, AND HOW FAR A SETTING IS FROM RIGHT. Computed, unlike the
 * table above: this is the definition of EV and nothing in it is a choice.
 *
 *   EV100 = log2(N^2 / t) - log2(ISO / 100)
 *
 * A scene that needs EV100 15 is exposed right by any settings that come to
 * 15; settings that come to 13 let in two stops more light than it needs.
 * The exposure playground (src/core/playground.ts) reads its brightness and
 * its light meter from these and nowhere else.
 */
export function ev100(seconds: number, aperture: number, iso: number): number {
  return Math.log2((aperture * aperture) / seconds) - Math.log2(iso / 100)
}

/** Stops brighter (positive) or darker (negative) than right, for a scene needing `sceneEv`. */
export function stopsOver(sceneEv: number, seconds: number, aperture: number, iso: number): number {
  return sceneEv - ev100(seconds, aperture, iso)
}

export type MeterReading = 'too dark' | 'right' | 'too bright'

/** Within two thirds of a stop reads as right: about what a camera's own meter tolerates. */
export const METER_RIGHT_STOPS = 2 / 3

export function meterReading(stops: number): MeterReading {
  if (stops < -METER_RIGHT_STOPS) return 'too dark'
  if (stops > METER_RIGHT_STOPS) return 'too bright'
  return 'right'
}

/**
 * The multiplier on an sRGB picture's values that shows `stops` more light.
 * Light adds linearly, 2^stops; the values are gamma encoded at about 2.2, so
 * the factor on them is that to the 1/2.2.
 */
export function brightnessFactor(stops: number): number {
  return Math.pow(2, stops / 2.2)
}
