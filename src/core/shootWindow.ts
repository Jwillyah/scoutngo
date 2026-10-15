/*
 * WHEN TO BE THERE, not just what the light is called.
 *
 * src/core/sunBand.ts names the band the sun is in. This works out WHEN each
 * band runs, which is the question a shooter actually has, and which one of
 * them the light usually concentrates in.
 *
 * THE MEASUREMENT THIS IS BUILT ON. Virginia Beach, the morning of 15 October
 * 2026, read off rewind cameras, against the bands this app already computed:
 *
 *   06:29   sun -8.8   nautical          dark deck, thin pink slot at horizon
 *   06:49   sun -4.8   blue hour peak    PEAK, orange and red fire
 *   07:09   sun -0.9   afterglow         flat, washed out
 *   07:11   sun -0.5   sunrise           sun up, over
 *
 * The computed blue hour band ran 06:43 to 06:54 and the observed peak at
 * 06:49 sits in the middle of it. The band before it was too dark and the band
 * after it was washed out. So the bands were already right and the app simply
 * never said which one to be in the air for: the best light was twenty-two
 * minutes BEFORE sunrise and over before the sun appeared.
 *
 * AND IT IS NOT A PROMISE. One morning with a high thin deck and a clear slot
 * at the horizon is one cloud setup, not a law. Nothing here returns a
 * confidence, and the wording at every call site says where light usually
 * concentrates rather than what will happen. A solid overcast has no peak at
 * all and this module cannot tell; only the sky can.
 */

import { sunBand, type SunBand } from './sunBand.ts'

/**
 * A stretch of time the sun spent in one band.
 *
 * `to` is the LAST sampled moment still inside the band, not the first moment
 * outside it. At one minute steps on the measured Virginia Beach morning, blue
 * hour was 06:43 to 06:53 and afterglow began at 06:54.
 */
export interface BandInterval {
  band: SunBand
  from: Date
  to: Date
}

/**
 * Every band the sun passes through between two instants, with its times.
 *
 * ONE MINUTE STEPS by default. The horizon band is about half a degree either
 * side of zero, which at mid latitudes is two to four minutes of clock, so a
 * coarser step steps straight over it. Measured at Virginia Beach the horizon
 * band ran 07:11 to 07:16, five minutes.
 *
 * Takes an altitude function rather than a latitude and longitude so it stays
 * testable against a ramp with no solar maths involved.
 */
export function bandIntervals(
  altitudeAt: (at: Date) => number,
  from: Date,
  to: Date,
  stepMinutes = 1,
): BandInterval[] {
  const step = Math.max(1, stepMinutes) * 60_000
  const first = from.getTime()
  const last = to.getTime()
  if (!Number.isFinite(first) || !Number.isFinite(last) || last <= first) return []

  const out: BandInterval[] = []
  for (let t = first; t <= last; t += step) {
    const at = new Date(Math.min(t, last))
    const band = sunBand(altitudeAt(at))
    const open = out[out.length - 1]
    if (open !== undefined && open.band === band) open.to = at
    else out.push({ band, from: at, to: at })
  }
  return out
}

export type ShootKind = 'sunrise' | 'sunset' | 'daytime'

export const SHOOT_KIND_LABEL: Record<ShootKind, string> = {
  sunrise: 'Sunrise',
  sunset: 'Sunset',
  daytime: 'Daytime',
}

/**
 * WHICH BANDS EACH KIND OF SHOOT IS ABOUT.
 *
 * A sunrise shoot is not "the hour after sunrise". It starts in the dark and
 * most of it happens before the sun appears, which is the thing the app was
 * getting wrong by treating below-the-horizon as empty. These are the bands
 * worth being set up for, in the order the sun crosses them.
 */
export const KIND_BANDS: Record<ShootKind, readonly SunBand[]> = {
  sunrise: ['nautical', 'blue-hour', 'afterglow', 'horizon', 'late-golden'],
  sunset: ['late-golden', 'horizon', 'afterglow', 'blue-hour', 'nautical'],
  daytime: ['open', 'flat-overhead'],
}

/**
 * THE BAND THE LIGHT USUALLY CONCENTRATES IN.
 *
 * Blue hour peak for both ends of the day, which is the sun between four and
 * six degrees under: the band the measured peak above landed in the middle of,
 * with the band before it too dark and the band after it washed out.
 *
 * Daytime has none, and says so rather than nominating one. Light at midday is
 * decided by cloud and by what you are pointing at, not by a band, and naming
 * a "peak" there would be inventing a recommendation.
 */
export const PEAK_BAND: Record<ShootKind, SunBand | null> = {
  sunrise: 'blue-hour',
  sunset: 'blue-hour',
  daytime: null,
}

/**
 * How long before the peak to be standing there, in minutes.
 *
 * A judgement, and a small one: the peak band is about eleven minutes long at
 * these latitudes, so arriving as it starts means setting up through it.
 */
export const SET_UP_MARGIN_MINUTES = 5

export interface Peak {
  band: SunBand
  from: Date
  to: Date
  /** When to be standing there, which is the number the shooter acts on. */
  beSetUpBy: Date
}

/**
 * The peak within a set of intervals, or null.
 *
 * Null when this kind of shoot has no peak band, or when the window simply
 * does not reach it. Both are honest answers and neither is an error: a window
 * from 09:00 to 11:00 has no blue hour in it.
 */
export function peakIn(kind: ShootKind, intervals: readonly BandInterval[]): Peak | null {
  const want = PEAK_BAND[kind]
  if (want === null) return null
  const found = intervals.find((i) => i.band === want)
  if (found === undefined) return null
  /* A single sample is a band the window only grazed, not a stretch to aim at. */
  if (found.to.getTime() <= found.from.getTime()) return null
  return {
    band: found.band,
    from: found.from,
    to: found.to,
    beSetUpBy: new Date(found.from.getTime() - SET_UP_MARGIN_MINUTES * 60_000),
  }
}

/**
 * A window wide enough to cover the bands that kind of shoot is about.
 *
 * Found by walking the day and taking the first and last moment the sun is in
 * one of those bands, rather than by solving for an altitude crossing: the
 * same sampling the intervals use, so the window and the bands inside it can
 * never disagree about where a boundary is.
 *
 * Null when the day never reaches those bands at all, which happens at high
 * latitudes: in an Arctic December there is no sunrise to shoot.
 */
export function suggestWindow(
  kind: ShootKind,
  altitudeAt: (at: Date) => number,
  dayStart: Date,
  dayEnd: Date,
  stepMinutes = 1,
): { start: Date; end: Date } | null {
  const wanted = new Set<SunBand>(KIND_BANDS[kind])
  const intervals = bandIntervals(altitudeAt, dayStart, dayEnd, stepMinutes)
  const inKind = intervals.filter((i) => wanted.has(i.band))
  if (inKind.length === 0) return null

  /*
   * THE FIRST RUN, NOT THE WHOLE DAY. Sunrise bands occur twice: once going up
   * and once coming down, and a window spanning both would be sixteen hours
   * long. The runs are contiguous in time, so a break of more than an hour
   * between them is the other end of the day and is dropped.
   */
  const BREAK_MS = 60 * 60_000
  const run: BandInterval[] = [inKind[0]]
  for (let i = 1; i < inKind.length; i++) {
    if (inKind[i].from.getTime() - run[run.length - 1].to.getTime() > BREAK_MS) {
      /*
       * For a sunset the run that matters is the LATER one, so once a break is
       * found the run restarts; for a sunrise and for daytime the first run is
       * the one wanted and the loop stops.
       */
      if (kind === 'sunset') {
        run.length = 0
        run.push(inKind[i])
        continue
      }
      break
    }
    run.push(inKind[i])
  }

  return { start: run[0].from, end: run[run.length - 1].to }
}
