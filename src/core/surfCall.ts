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
import { angleApart, type WindSide } from './coastFacing.ts'
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
  /** Whether the wind chops the water this hour (surfChop); absent: not known, no quality words. */
  chop?: boolean
  /** The swell's period, seconds; absent: not known, and it moves nothing. */
  periodS?: number | null
  /** The wind at the beach, knots; absent or null: not known, and no "calm". */
  windKt?: number | null
}

/*
 * THE QUALITY WORDS (Batch DRONE, Section 1.4; CORE 8.1 addendum, 16 Nov:
 * "2-3 ft RIDEABLE" and a "clean" band while the cams showed small and
 * wind-chopped). With the wind at CHOP_WIND_KT or more from cross-shore round
 * to onshore, the water is choppy: no "clean", no "Rideable"; the call says
 * how it is instead, "Poor · choppy" at Small and under, "Fair · textured"
 * for a size worth riding. 10 kt: the addendum's line, the same as Messy
 * onshore (src/core/surf.ts MESSY_ONSHORE_MPS).
 */
export const CHOP_WIND_KT = 10
export type SurfQuality = 'Poor' | 'Poor-Fair' | 'Fair' | 'Good' | 'Poor · choppy' | 'Fair · textured'
const CHOP_SIDES: ReadonlySet<WindSide> = new Set<WindSide>(['onshore', 'cross-onshore', 'cross-shore'])

/** Whether a wind chops the water at this beach: CHOP_WIND_KT or more, from cross-shore round to onshore. */
export function surfChop(windKt: number | null, side: WindSide | null): boolean {
  return windKt !== null && side !== null && windKt >= CHOP_WIND_KT && CHOP_SIDES.has(side)
}

/*
 * THE CHOP ITSELF (Batch FIX, Section 3.1). 16 Nov 10:50 AM the beach was
 * wind-chopped by a N wind sea while the model's NNW counted as
 * cross-offshore, so the rule above never fired (fixtures/truth/
 * 2026-11-16-vb-surf.json); on 17 Nov a "clean" stretch was shaded 6-7 PM
 * under N 13 kt. Now also: when the wind sea dominates the swell at the beach
 * (src/core/surfTransform.ts windSeaDominates: its energy after the transform
 * twice the swell's or more) and the wind is CHOP_WIND_KT or more from
 * anywhere but straight offshore, within OFFSHORE_HALF_DEG of it, the water
 * is choppy: "Poor · choppy", and no "clean".
 */
export const OFFSHORE_HALF_DEG = 30

/** Whether a wind blows from within OFFSHORE_HALF_DEG of straight offshore (the facing's opposite). */
export function nearOffshore(fromDeg: number, facing: number, halfDeg: number = OFFSHORE_HALF_DEG): boolean {
  return angleApart(fromDeg, (facing + 180) % 360) <= halfDeg
}

/** Whether a dominant wind sea chops the water: CHOP_WIND_KT or more from anywhere but near offshore. Unknown wind, direction or facing: no. */
export function seaChop(windKt: number | null, fromDeg: number | null, facing: number | null, windSeaDominant: boolean | null): boolean {
  if (windSeaDominant !== true || windKt === null || fromDeg === null || facing === null) return false
  return windKt >= CHOP_WIND_KT && !nearOffshore(fromDeg, facing)
}

/*
 * SIZE AND QUALITY ARE TWO THINGS (Batch SIMPLE-3, Section 5.1; 23 Nov: 2-3 ft
 * clean, 10 s, light offshore read "Small" on the pill, Surfline said "Fair",
 * Jwilly: "def a go all day"). The number beside the pill is the size; the
 * pill is how good the water is for riding it: Poor, Poor-Fair, Fair, Good.
 *
 *   by size   under 1 ft Poor, 1 to 2 Poor-Fair, 2 to 4 Fair, 4 and up Good
 *             (the face's centre, the same one the number comes from)
 *   the wind  on the water: Bumpy drops a step, Messy two, no wind forecast one
 *             (the same drops as the size tag, src/core/surf.ts surfTag)
 *   the period under 6 s drops a step (wind chop's own period); not known: no change
 *   chop      the wind chops the water (surfChop, seaChop): "Poor · choppy"
 *             at Small and under, "Fair · textured" for a size worth riding
 *
 * The size tag (Flat, Small, Fun, Firing) stays for the filters that ask
 * "is it worth going" (surfOn); it is no longer what the pill says.
 */
export const QUALITY_SCALE = ['Poor', 'Poor-Fair', 'Fair', 'Good'] as const
export const QUALITY_SHORT_PERIOD_S = 6
const QUALITY_SIZE_FT = [1, 2, 4] as const

export function surfQuality(centerFt: number, chop: boolean, shape: SurfShape | null = 'Clean', periodS: number | null = null): SurfQuality {
  if (chop) {
    const size = surfTag(centerFt, 'Clean')
    return size === 'Flat' || size === 'Small' ? 'Poor · choppy' : 'Fair · textured'
  }
  const bySize = QUALITY_SIZE_FT.filter((ft) => centerFt >= ft).length
  const drop = (shape === 'Clean' ? 0 : shape === 'Messy' ? 2 : 1) + (periodS !== null && periodS > 0 && periodS < QUALITY_SHORT_PERIOD_S ? 1 : 0)
  return QUALITY_SCALE[Math.max(0, bySize - drop)]
}

/** Under this wind the water is glassy and the side of the beach it blows from means nothing: 5 kt (src/core/coastFacing.ts GLASSY_MPS). */
export const CALM_GLASSY_KT = 5
export const CALM_GLASSY_WORDS = 'Calm · glassy'
export const isCalmGlassy = (windKt: number | null | undefined): boolean => windKt !== null && windKt !== undefined && windKt < CALM_GLASSY_KT

export interface SurfCall {
  lowFt: number
  highFt: number
  /** "1–2 ft". */
  words: string
  size: SurfTag
  /** "clean, offshore"; "wind not forecast" when no wind came. */
  wind: string
  confidence: 'firm' | 'guess'
  /** The pill: Poor, Poor-Fair, Fair, Good (or the chop words); the size is `words`. */
  quality: SurfQuality
  /** Whether the wind chops the water this hour. */
  choppy: boolean
}

export const SHAPE_WORD: Record<SurfShape, string> = { Clean: 'clean', Bumpy: 'bumpy', Messy: 'messy' }

export function surfCall(h: SurfHourIn | null, dayIndex: number): SurfCall | null {
  if (h === null || !Number.isFinite(h.centerFt)) return null
  const [lowFt, highFt] = surfBand(h.centerFt)
  const calm = h.chop !== true && isCalmGlassy(h.windKt)
  return {
    lowFt,
    highFt,
    words: `${lowFt}–${highFt} ft`,
    size: surfTag(h.centerFt, h.shape),
    wind: calm ? CALM_GLASSY_WORDS : [h.shape === null ? 'wind not forecast' : SHAPE_WORD[h.shape], h.side].filter((x) => x !== null).join(', '),
    confidence: dayIndex < SURF_SURE_DAYS ? 'firm' : 'guess',
    quality: surfQuality(h.centerFt, h.chop === true, h.shape, h.periodS ?? null),
    choppy: h.chop === true,
  }
}
