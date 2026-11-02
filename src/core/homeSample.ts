/*
 * THE HOME PAGE'S SAMPLE BEACH, AND THE WORDS ON IT (Batch F, Section 1).
 *
 * The home page shows the four apps working on ONE FIXED place, the Virginia
 * Beach Fishing Pier, never the visitor's: nothing here asks where the phone
 * is, and the requests it makes name only the pier.
 *
 * Every value is computed here from what the services answered, the same
 * arithmetic the app's own screens use (goldenNext, the tide table's turns,
 * surfEstimate, fireVerdict and fireWindow, findAlignments). Anything that did
 * not arrive is a dash, never a zero or a guess.
 */
import type { LatLon } from './geo.ts'
import { compassWord } from './compassWords.ts'
import type { GoldenNext } from './goldenNext.ts'
import type { TideExtreme } from './tide.ts'
import type { SurfEstimate } from './surf.ts'
import type { FireWord } from './fireOutlook.ts'
import type { Alignment } from './alignment.ts'

export const SAMPLE_NAME = 'Virginia Beach Fishing Pier'
export const SAMPLE_TZ = 'America/New_York'
/* The boardwalk at the foot of the pier, 15th Street (the same point the Safari tab audit plans at). */
export const SAMPLE_SPOT: LatLon = { lat: 36.8435575, lon: -75.9713104 }
/*
 * THE PIER'S END, for "the moon rises off the pier end": about 1,000 ft out
 * (305 m), square to the beach, which runs a little east of north here; so
 * 305 m at 95°. A paced-off figure, close enough for a body half a degree wide
 * and the finder's one-degree slack.
 */
export const SAMPLE_PIER_END: LatLon = { lat: 36.84332, lon: -75.96789 }
/* The beach faces east-southeast: square to the pier. */
export const SAMPLE_FACING_DEG = 95

export const DASH = '—'

export interface BandValue {
  value: string
  word: string
}

const none: BandValue = { value: DASH, word: '' }

/** Light: the next golden light, or how long the one on now lasts. */
export function lightBand(g: GoldenNext | null, now: Date, clock: (d: Date) => string): BandValue {
  if (g === null || g.kind === 'none') return none
  if (g.kind === 'now') return { value: `to ${clock(new Date(now.getTime() + g.minutesLeft * 60_000))}`, word: 'golden now' }
  return { value: clock(new Date(now.getTime() + g.minutesUntil * 60_000)), word: 'golden' }
}

/** Tide: the next high or low water after now, from the published table. */
export function tideBand(extremes: readonly TideExtreme[] | null, now: Date, clock: (d: Date) => string): BandValue {
  const next = (extremes ?? []).filter((e) => e.at.getTime() > now.getTime()).sort((a, b) => a.at.getTime() - b.at.getTime())[0]
  return next === undefined ? none : { value: clock(next.at), word: next.kind }
}

/** Surf: the breaking face height as a range of whole feet, and its size word. */
export function surfBand(e: SurfEstimate | null): BandValue {
  if (e === null || !Number.isFinite(e.faceFt)) return none
  if (e.faceFt < 1) return { value: '< 1 ft', word: e.size.toLowerCase() }
  const lo = Math.floor(e.faceFt)
  return { value: `${lo}–${lo + 1} ft`, word: e.size.toLowerCase() }
}

const MPS_TO_KT = 1.943844

/** Wind: knots, and where it comes FROM in words. */
export function windBand(w: { speedMps: number; fromDegrees: number } | null): BandValue {
  if (w === null || !Number.isFinite(w.speedMps) || !Number.isFinite(w.fromDegrees)) return none
  return { value: `${Math.round(w.speedMps * MPS_TO_KT)} kt`, word: `from ${compassWord(w.fromDegrees)}` }
}

/**
 * Sky fire: the verdict for the next sunrise or sunset. When it may fire, from
 * when to look (fireWindow); when it is unlikely, just the event's time.
 */
export function skyFireLine(kind: 'sunrise' | 'sunset' | null, word: FireWord | null, event: Date | null, from: Date | null, clock: (d: Date) => string): string | null {
  if (kind === null || word === null) return null
  const when = kind === 'sunset' ? 'Tonight' : 'Sunrise'
  if (word === 'unlikely' || from === null) return event === null ? `${when}: ${word}` : `${when} ${clock(event)}: ${word}`
  return `${when}: ${word} from ${clock(from)}`
}

/** Moon line-ups: the next time the moon rises off the pier end, from the alignment finder. */
export function moonLine(a: Alignment | null, illumination: number | null, day: (d: Date) => string, clock: (d: Date) => string): string | null {
  if (a === null) return null
  const full = illumination !== null && illumination >= 0.97
  return `${full ? 'Full moon' : 'Moon'} ${a.direction === 'rising' ? 'rises' : 'sets'} off the pier end, ${day(a.at)} ${clock(a.at)}`
}
