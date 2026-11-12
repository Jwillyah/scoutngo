/*
 * ONE SURF CALL (Batch TRUTH, Section 1). On 12 Nov the same day read 0–2 on
 * the home card, 1–2 in the week list and 0–3 on the Surf page's week strip:
 * three screens, three sums. Now one: the hour the day is called by (the
 * hour now for today, the day's biggest hour 5 AM to 8 PM for the rest;
 * src/lib/useSurfNow.ts) goes through this, and every screen prints what it
 * returns.
 *
 *   range   one foot wide under 4 ft, from the face's centre: 0–1, 1–2,
 *           2–3, 3–4; from 4 ft up, two: 4–6, 5–7. Never 0–2, 1–4 or 2–4.
 *   size    the tag from the same centre (src/core/surf.ts surfTag):
 *           Flat under 0.6 ft, Small to 2.5, then Fun and Firing.
 *   wind    the water's shape and the wind to the beach, "clean, offshore".
 *   sure    firm for the first WEEK_SURE_DAYS days, a guess after.
 */
import { surfTag, type SurfShape, type SurfTag } from './surf.ts'

/** Days from today this sure; after, the models drift apart (src/core/homeDay.ts WEEK_SURE_DAYS). */
export const SURF_SURE_DAYS = 3

/** The band's ends, whole feet, from the face's centre. */
export function surfBand(centerFt: number): [number, number] {
  const c = Number.isFinite(centerFt) ? Math.max(0, centerFt) : 0
  if (c < 4) {
    const lo = Math.floor(c)
    return [lo, lo + 1]
  }
  const lo = Math.floor(c)
  return [lo, lo + 2]
}

export interface SurfHourIn {
  centerFt: number
  shape: SurfShape | null
  /** The wind to the beach in words, "offshore", "cross-offshore"; null when not known. */
  side: string | null
}

export interface SurfCall {
  lowFt: number
  highFt: number
  /** "1–2 ft". */
  words: string
  size: SurfTag
  /** "clean, offshore"; "wind not forecast" when no wind came. */
  wind: string
  confidence: 'firm' | 'guess'
}

export const SHAPE_WORD: Record<SurfShape, string> = { Clean: 'clean', Bumpy: 'bumpy', Messy: 'messy' }

export function surfCall(h: SurfHourIn | null, dayIndex: number): SurfCall | null {
  if (h === null || !Number.isFinite(h.centerFt)) return null
  const [lowFt, highFt] = surfBand(h.centerFt)
  return {
    lowFt,
    highFt,
    words: `${lowFt}–${highFt} ft`,
    size: surfTag(h.centerFt, h.shape),
    wind: [h.shape === null ? 'wind not forecast' : SHAPE_WORD[h.shape], h.side].filter((x) => x !== null).join(', '),
    confidence: dayIndex < SURF_SURE_DAYS ? 'firm' : 'guess',
  }
}
