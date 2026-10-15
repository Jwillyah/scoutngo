/*
 * WHERE THE SUN IS, AS A BAND, INCLUDING BELOW THE HORIZON.
 *
 * WHAT THIS REPLACES, AND WHY IT WAS WRONG. The app had one note derived from
 * `altitude < 15`, and a window line that read "Sun is below the horizon for
 * part of this window. There is nothing to light a position with." Measured at
 * Lesner Bridge for a 06:00 to 07:45 sunrise window on 20 October 2026, with
 * sunrise at 07:15 local:
 *
 *   06:00  -15.5deg   "low sun, long shadows, flare risk"  + nothing to light
 *   06:30   -9.6deg   "low sun, long shadows, flare risk"  + nothing to light
 *   07:00   -3.6deg   "low sun, long shadows, flare risk"  + nothing to light
 *   07:15   -0.7deg   "low sun, long shadows, flare risk"  + nothing to light
 *
 * Two false statements. There are no long shadows and no flare risk fifteen
 * degrees below the horizon, and the entire pre-sunrise stretch, which is
 * afterglow and blue hour and nautical twilight, was described as having
 * nothing to light with. For a backlit cloud shot that is exactly backwards:
 * that stretch IS the shot, and it is the reason the alarm went off.
 *
 * So the altitude is banded instead, and every band says what it is rather
 * than whether it is any good. Whether a band is usable depends on what is
 * being shot, which this file does not know and does not guess.
 */

/**
 * Contiguous and exhaustive, from overhead down to full dark. Ordered highest
 * first, which is the order the boundaries are tested in.
 */
export type SunBand =
  | 'flat-overhead'
  | 'open'
  | 'late-golden'
  | 'horizon'
  | 'afterglow'
  | 'blue-hour'
  | 'nautical'
  | 'night'

/**
 * Upper bound of each band, in degrees of altitude, highest first.
 *
 * The boundaries from +6 down to -12 are the ones that matter for this work
 * and are the ones that were asked for. Above +6 keeps the distinction the old
 * note already drew between open sun and flat overhead light; below -12 is
 * astronomical twilight and then night, which is one band because nothing in
 * this app distinguishes them.
 *
 * HORIZON IS A BAND, NOT A POINT. Half a degree either side of zero, which is
 * roughly the sun's own diameter and two to four minutes of clock at these
 * latitudes. A single altitude of exactly 0.0 would never be sampled.
 */
export const BAND_UPPER_BOUND: readonly { band: SunBand; above: number }[] = [
  { band: 'flat-overhead', above: 60 },
  { band: 'open', above: 6 },
  { band: 'late-golden', above: 0.5 },
  { band: 'horizon', above: -0.5 },
  { band: 'afterglow', above: -4 },
  { band: 'blue-hour', above: -6 },
  { band: 'nautical', above: -12 },
  // Anything at or below -12 falls through to night.
] as const

export function sunBand(altitudeDegrees: number): SunBand {
  for (const { band, above } of BAND_UPPER_BOUND) {
    if (altitudeDegrees > above) return band
  }
  return 'night'
}

/** Short, for a table cell. */
export const SUN_BAND_LABEL: Record<SunBand, string> = {
  'flat-overhead': 'flat overhead',
  open: 'open sun',
  'late-golden': 'late golden',
  horizon: 'sunrise / sunset',
  afterglow: 'afterglow',
  'blue-hour': 'blue hour peak',
  nautical: 'nautical',
  night: 'night',
}

/**
 * One line each, saying WHAT IT IS and not whether it is any good.
 *
 * None of these calls a band a problem. "Blue hour peak" is not a warning; it
 * is a fifteen minute window somebody set an alarm for.
 */
export const SUN_BAND_NOTE: Record<SunBand, string> = {
  'flat-overhead': 'Sun overhead. Flat light, short shadows, little modelling.',
  open: 'Sun well up. Ordinary daylight, shadows shorter than their subject.',
  'late-golden': 'Sun under 6°. Long shadows, warm light, flare if you point near it.',
  horizon: 'Sun on the horizon. The light changes minute to minute.',
  afterglow: 'Sun just under. No direct light, and the brightest colour in the sky.',
  'blue-hour': 'Sun 4 to 6° under. Blue hour peak: even light, deep sky, lit windows read.',
  nautical: 'Sun 6 to 12° under. Horizon still visible, sky going dark.',
  night: 'Sun more than 12° under. Dark, with no usable twilight.',
}

/**
 * WHETHER A SUBJECT ON THE GROUND HAS DIRECT LIGHT ON IT.
 *
 * This is the one judgement in this file, and it is narrow on purpose: it is
 * about a subject that needs light on its face, which is the only case the old
 * blanket warning was ever true for. A sky subject at -4 is not a problem, and
 * this does not say it is. It says a face has nothing on it, because the sun
 * is not above the horizon to put anything there.
 */
export function groundSubjectHasDirectLight(altitudeDegrees: number): boolean {
  return altitudeDegrees > 0
}

/**
 * Bands that a sky subject is specifically good in, for a sentence that says
 * what IS there rather than what is missing.
 *
 * Deliberately not a score. It is the set of bands where the SKY carries the
 * picture, which is the answer to "the sun is down, so what am I shooting".
 */
export function skyCarriesTheShot(band: SunBand): boolean {
  return band === 'horizon' || band === 'afterglow' || band === 'blue-hour'
}

/**
 * EVERY BAND A WINDOW ACTUALLY CROSSES, in the order it crosses them.
 *
 * WHY SAMPLING THREE POINTS IS NOT ENOUGH. The readout shows the start, the
 * middle and the end, and naming the bands from those three misses the ones in
 * between. Measured at Lesner Bridge for 18:10 to 19:30 on 20 October 2026:
 * the three samples land on late golden, nautical and night, so a window that
 * passes straight through sunset and afterglow would never have mentioned
 * either. That is the same class of error as the line this replaced: a true
 * statement about a sample, presented as a statement about the shoot.
 *
 * Five minutes is finer than the narrowest band is long. The horizon band is
 * about half a degree either side of zero, which at these latitudes is two to
 * four minutes of clock, so five minutes can still step over it; the start and
 * end are therefore always included explicitly, and the caller passes a step
 * small enough for its own purpose if it needs one.
 */
export function bandsAcross(
  altitudeAt: (at: Date) => number,
  start: Date,
  end: Date,
  stepMinutes = 2,
): SunBand[] {
  const step = Math.max(1, stepMinutes) * 60_000
  const first = start.getTime()
  const last = end.getTime()
  if (!Number.isFinite(first) || !Number.isFinite(last) || last < first) return []

  const seen: SunBand[] = []
  const add = (at: Date) => {
    const band = sunBand(altitudeAt(at))
    if (!seen.includes(band)) seen.push(band)
  }

  add(start)
  for (let t = first + step; t < last; t += step) add(new Date(t))
  add(end)
  return seen
}

/**
 * How much of a window has no direct light on a ground subject's face.
 *
 * Returned as a share rather than a boolean so the sentence can say "any of"
 * or "part of" honestly. Measured the same way as bandsAcross and for the same
 * reason: three samples cannot tell you what a window did in between.
 */
export function unlitGroundShare(
  altitudeAt: (at: Date) => number,
  start: Date,
  end: Date,
  stepMinutes = 2,
): number {
  const step = Math.max(1, stepMinutes) * 60_000
  const first = start.getTime()
  const last = end.getTime()
  if (!Number.isFinite(first) || !Number.isFinite(last) || last < first) return 0

  let total = 0
  let unlit = 0
  for (let t = first; t <= last; t += step) {
    total += 1
    if (!groundSubjectHasDirectLight(altitudeAt(new Date(t)))) unlit += 1
  }
  return total === 0 ? 0 : unlit / total
}
