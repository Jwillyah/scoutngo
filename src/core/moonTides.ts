/*
 * BIG TIDES OR SMALL ONES THIS WEEK, FROM THE MOON.
 *
 * Spring tides (the big ones) come with a new or full moon, when the sun and
 * the moon pull in a line; neap tides (the small ones) with a half moon. The
 * phase is worked out two ways and a test holds them together
 * (PHASE_AGREE, about a day):
 *
 *   suncalc       getMoonIllumination's phase, 0 new, 0.5 full.
 *   synodic       days since a known new moon (2000-01-06 18:14 UTC, Meeus)
 *                 over the mean synodic month, 29.530588853 days.
 *
 * The line is the moon's; whether the week's tides really are bigger is the
 * station's to say, and measurements/<date>-tide-checks.md sets the NOAA range
 * beside it.
 */
import { getMoonIllumination } from 'suncalc'

export const SYNODIC_DAYS = 29.530588853
export const KNOWN_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14)
/*
 * Phase agreement between the two methods: 0.035 of a month, about a day. The
 * mean month ignores the moon's elliptical orbit, which moves a real new or
 * full moon up to about 14 hours off the mean one; across 2026 the two methods
 * were at most 0.029 apart (21 hours, on 11 Oct). A spring week is three days
 * either side, so a day's disagreement never changes the line.
 */
export const PHASE_AGREE = 0.035
/** Within this much of a new or full moon (about 3 days), the week is a spring week. */
export const SPRING_WITHIN = 0.1

export const phaseBySuncalc = (at: Date): number => getMoonIllumination(at).phase

export function phaseBySynodic(at: Date): number {
  const days = (at.getTime() - KNOWN_NEW_MOON) / 86_400_000
  const p = (days / SYNODIC_DAYS) % 1
  return p < 0 ? p + 1 : p
}

/** Shortest distance between two phases on the 0..1 circle. */
export const phaseApart = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 1
  return Math.min(d, 1 - d)
}

export type TideWeek = { kind: 'spring'; moon: 'new moon' | 'full moon'; line: string } | { kind: 'neap'; line: string } | null

export function tideWeek(at: Date): TideWeek {
  const p = phaseBySuncalc(at)
  if (phaseApart(p, 0) <= SPRING_WITHIN) return { kind: 'spring', moon: 'new moon', line: 'Big tides this week (new moon)' }
  if (phaseApart(p, 0.5) <= SPRING_WITHIN) return { kind: 'spring', moon: 'full moon', line: 'Big tides this week (full moon)' }
  if (phaseApart(p, 0.25) <= SPRING_WITHIN || phaseApart(p, 0.75) <= SPRING_WITHIN) return { kind: 'neap', line: 'Small tides this week (half moon)' }
  return null
}
