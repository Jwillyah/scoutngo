/*
 * A DECK LIT FROM UNDERNEATH, THROUGH A GAP (Batch J, Section 3). On 2 Nov
 * the app said colour 5:11-5:21 and it ran from about 5:00 to 5:20, peaking
 * as the sun sat in the slot under the deck's edge at sunset: about ten
 * minutes late, because the colour clock lights a cloud only once the sun is
 * below that cloud's own horizon, and a deck with an open gap toward the sun
 * is lit sooner, from below.
 *
 * For a reported deck at base h with the gap toward the sun open:
 *
 *   starts  when the sun's light first gets under the part of the deck you
 *           can see. A ray to the deck's underside at x km toward the sun
 *           must stay under the deck to its edge D km out, so the sun must
 *           be below that point's own horizon by (D - x) / 2R, and that
 *           point's horizon is tilted x / R from yours:
 *             sun (geometric, yours) <= x / R - (D - x) / 2R
 *           x is the deck seen VIEW_DEG above your horizon (lower is lost in
 *           the haze and the horizon's own clutter). The far deck, near its
 *           edge, lights first, while the sun is still up: colour before
 *           sunset. Without an edge distance, the sun at SLOT_DEG.
 *   peak    sunset (the sun's top on the horizon): the whole disc in the
 *           slot, the light at its reddest and still direct, in the 0 to -1
 *           degree band.
 *   ends    when the sun is too far below for its light to reach the deck:
 *           its geometric depression is the deck's dip sqrt(2h/R) plus the
 *           bending of a ray that grazes the Earth on its way up to the
 *           cloud, GRAZE_BEND_DEG (about twice the horizon's refraction).
 *           12,000 ft: 1.94 + 1.1 = about 3.0 degrees, 12-13 minutes after
 *           sunset at Virginia Beach in November.
 *   then    the afterglow, pink overhead: not timed.
 *
 * At sunrise the same, the other way round in time. Calibrate against
 * Jwilly's photo times when they come (until then the observed window is
 * 5:00-5:20 PM).
 */
import { dipDeg, EARTH_R_M, geometricFromApparent } from './skyColour.ts'

export const SLOT_DEG = 1
export const GRAZE_BEND_DEG = 1.1
/** The lowest part of the deck that counts as seen: this far above your horizon. */
export const VIEW_DEG = 2
const DEG = 180 / Math.PI

/** The deck's edge D km away, h m up, as you see it: degrees above your horizon (never under 0). */
export function edgeElevationDeg(heightM: number, edgeKm: number): number {
  const d = edgeKm * 1000
  return Math.max(0, Math.atan(heightM / d) * DEG - (d / (2 * EARTH_R_M)) * DEG)
}

/** How far toward the sun the deck h m up stands `deg` above your horizon, km (by bisection). */
export function deckAtDeg(heightM: number, deg: number): number {
  let lo = 0.1
  let hi = 2000
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2
    if (edgeElevationDeg(heightM, mid) > deg) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/** The sun's geometric elevation at which the seen deck starts to light from under, its edge D km out. */
export function startsAtDeg(heightM: number, edgeKm: number): number {
  const x = Math.min(edgeKm, deckAtDeg(heightM, VIEW_DEG))
  const R = EARTH_R_M / 1000
  return (x / R - (edgeKm - x) / (2 * R)) * DEG
}

/** How far below the horizon (geometric) the sun can be and still light a deck h m up from under. */
export const litUntilDeg = (heightM: number): number => dipDeg(heightM) + GRAZE_BEND_DEG

/**
 * TRUTH CASE #5 CALIBRATION (Batch K, Section 7): minutes added to the whole
 * window, once Jwilly's photo timestamps of the 2 Nov sunset at Chix Beach
 * say when the colour actually was. 0 until then: the observed window is
 * 5:00-5:20 PM by eye, and the replay says 5:00-5:18
 * (measurements/2026-11-02-truth-5-replay.md). Set it from the photos'
 * first and last coloured frames; tests/underLightCalibration.test.ts holds
 * that it moves the whole window and nothing else.
 */
export const CALIBRATION_MIN = 0

export interface UnderLit {
  from: Date
  peak: Date
  to: Date
  /** The sun's elevation where the lighting starts, degrees (geometric; SLOT_DEG apparent without an edge). */
  slotDeg: number
  untilDeg: number
}

/**
 * The window, minute by minute on the sun's apparent altitude (suncalc's,
 * degrees). `event` is the sunrise or sunset; the search runs 60 minutes
 * either side of it.
 */
export function underLitWindow(kind: 'sunrise' | 'sunset', event: Date, heightM: number, edgeKm: number | null, sunApparentDeg: (t: Date) => number, shiftMin: number = CALIBRATION_MIN): UnderLit | null {
  /* Geometric, as the arithmetic is; the default slot is said in what you see (apparent). */
  const slotDeg = edgeKm === null ? null : startsAtDeg(heightM, edgeKm)
  const untilDeg = litUntilDeg(heightM)
  const minutes = Array.from({ length: 121 }, (_, i) => new Date(event.getTime() + (kind === 'sunset' ? i - 60 : 60 - i) * 60_000))
  /* Walk with the light: at sunset forward in time, at sunrise backward from after it. */
  const inSlot = minutes.find((t) => (slotDeg === null ? sunApparentDeg(t) <= SLOT_DEG : geometricFromApparent(sunApparentDeg(t)) <= slotDeg))
  const gone = minutes.find((t) => geometricFromApparent(sunApparentDeg(t)) <= -untilDeg)
  if (inSlot === undefined || gone === undefined) return null
  const [from, to] = kind === 'sunset' ? [inSlot, gone] : [gone, inSlot]
  const shift = (d: Date) => new Date(d.getTime() + shiftMin * 60_000)
  return { from: shift(from), peak: shift(event), to: shift(to), slotDeg: slotDeg ?? SLOT_DEG, untilDeg }
}
