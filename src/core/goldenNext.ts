/*
 * THE NEXT GOLDEN LIGHT, MORNING OR EVENING.
 *
 * WHAT WAS WRONG. The GOLDEN chip counted to the end of the shoot window, so
 * at Virginia Beach at 6:58 AM on 27 Oct, sunrise 7:21, with a saved window
 * ending at 7 PM, it said "12 h": counting to the evening and past the
 * morning's golden light altogether. It now counts to the next golden period
 * from the time on the bar, whichever end of the day it is at.
 *
 * Golden is the time bar's own band (sunPath.ts band(): the sun between the
 * horizon and six degrees up), so the chip and the gold on the bar start at
 * the same minute.
 */
import { band } from './sunPath.ts'

export type GoldenNext =
  /** In golden light now, this many minutes left. */
  | { kind: 'now'; minutesLeft: number }
  /** Golden light starts in this many minutes. */
  | { kind: 'next'; minutesUntil: number }
  /** None in the next LOOK_HOURS: the sun stays up or stays down. */
  | { kind: 'none' }

const MINUTE = 60_000
/** Far enough to cross a night, short enough to stay cheap: one-minute steps. */
export const LOOK_HOURS = 36

/** `altitudeAt` is in this suncalc build's degrees, as band() expects. */
export function goldenNext(altitudeAt: (at: Date) => number, from: Date): GoldenNext {
  const start = from.getTime()
  const golden = (t: number) => band(altitudeAt(new Date(t))) === 'golden'
  const steps = LOOK_HOURS * 60
  if (golden(start)) {
    for (let i = 1; i <= steps; i += 1) if (!golden(start + i * MINUTE)) return { kind: 'now', minutesLeft: i }
    return { kind: 'none' }
  }
  for (let i = 1; i <= steps; i += 1) if (golden(start + i * MINUTE)) return { kind: 'next', minutesUntil: i }
  return { kind: 'none' }
}
