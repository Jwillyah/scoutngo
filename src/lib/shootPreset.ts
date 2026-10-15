import type { LatLon } from '../core/geo.ts'
import { getSunPosition } from '../core/sun.ts'
import {
  peakIn,
  bandIntervals,
  suggestWindow,
  type Peak,
  type ShootKind,
} from '../core/shootWindow.ts'
import { SUN_BAND_LABEL } from '../core/sunBand.ts'
import { formatClock, zonedTimeToUtc } from '../core/timezone.ts'

/**
 * A SHOOT CHIP, TURNED INTO FORM FIELDS.
 *
 * The arithmetic is all in src/core/shootWindow.ts; this is the glue that
 * turns a window of instants into the two HH:MM strings the form holds, in the
 * venue's own zone, and writes the sentence saying what the chip just did.
 *
 * NO MODEL CALL ANYWHERE IN HERE. That is the point of the chips: the common
 * case needs no key, which matters for an app that is given away.
 */
export interface ShootPreset {
  startTime: string
  endTime: string
  /** What happened, for the line under the chips. */
  line: string
  /** The band the light usually concentrates in, when there is one. */
  peak: Peak | null
}

/**
 * The window for a kind of shoot at a place on a date.
 *
 * Null when it cannot be computed: no pin, no date, or a latitude where that
 * kind of day does not happen. The caller still applies the platform half of
 * the chip and says why the window did not move, because a chip that silently
 * does half its job is worse than one that says which half.
 */
export function shootPreset(
  kind: ShootKind,
  at: LatLon,
  /** yyyy-mm-dd, as the form holds it. */
  date: string,
  timeZone: string,
): ShootPreset | null {
  /*
   * The venue's own local midnight to the next, so a window is found in the
   * day the shooter typed rather than in a UTC day that straddles two of them.
   */
  const dayStart = zonedTimeToUtc(date, '00:00', timeZone)
  const dayEnd = zonedTimeToUtc(date, '23:59', timeZone)
  if (dayStart === null || dayEnd === null) return null

  const altitudeAt = (when: Date) => getSunPosition(when, at.lat, at.lon).altitude
  const window = suggestWindow(kind, altitudeAt, dayStart, dayEnd)
  if (window === null) return null

  const peak = peakIn(kind, bandIntervals(altitudeAt, window.start, window.end))
  const startTime = formatClock(window.start, timeZone)
  const endTime = formatClock(window.end, timeZone)

  /*
   * THE SENTENCE SAYS WHERE THE LIGHT USUALLY CONCENTRATES. Not what will
   * happen: one morning with a high thin deck and a clear slot at the horizon
   * is one cloud setup, not a law, and a solid overcast has no peak at all.
   */
  const line =
    peak === null
      ? `Window set to ${startTime}–${endTime}.`
      : `Window set to ${startTime}–${endTime}. Light usually concentrates in ${
          SUN_BAND_LABEL[peak.band]
        }, ${formatClock(peak.from, timeZone)}–${formatClock(
          peak.to,
          timeZone,
        )}. Be set up by ${formatClock(peak.beSetUpBy, timeZone)}.`

  return { startTime, endTime, line, peak }
}
