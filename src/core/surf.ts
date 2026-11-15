/*
 * HOW BIG THE WAVES BREAK AT THE BEACH: AN ESTIMATE FROM THE OFFSHORE FORECAST.
 *
 * Not a surf report. Open-Meteo Marine forecasts the swell offshore (height,
 * period, direction); this works out the height it breaks at, two published
 * ways, and a test holds them together (BREAK_AGREE):
 *
 *   Komar and Gaillard (1973), "A study of breaking wave heights", via
 *   Komar, Beach Processes and Sedimentation (1998), eq. 5.32:
 *       Hb = 0.39 g^(1/5) (T H0^2)^(2/5)
 *   Le Mehaute and Koh (1967), "On the breaking of waves arriving at an angle
 *   to the shore", J. Hydraulic Research 5(1):
 *       Hb / H0 = 0.76 m^(1/7) (H0 / L0)^(-1/4),  L0 = g T^2 / (2 pi)
 *   with m the beach slope, BEACH_SLOPE unless the lidar says otherwise.
 *
 * SWELL AT AN ANGLE breaks smaller: it spreads along the beach as it bends
 * in. Approximated by conserving the shoreward energy flux with a small
 * breaking angle, H0 sqrt(cos theta), theta the swell's angle off the way the
 * beach faces; swell running away from the beach (theta of 90 or more)
 * breaks nothing here.
 */
import { angleApart, isGlassy, windSide, windToBeach } from './coastFacing.ts'

export const G = 9.81
/* A typical sandy foreshore; stated on screen as an assumption. */
export const BEACH_SLOPE = 1 / 50
/*
 * How far apart the two formulas may be. MEASURED at most 6% across 15 times
 * over 3 days at Virginia Beach (measurements/2026-10-27-surf-checks.md);
 * the test sweeps a wider range of swells, so the limit is 15%.
 */
export const BREAK_AGREE = 0.15

/** Deep-water height after the angle, metres. */
export function angledHeight(h0: number, swellFromDeg: number, facingDeg: number | null): number {
  if (facingDeg === null) return h0
  const theta = angleApart(swellFromDeg, facingDeg)
  /*
   * Batch LIVE, Section 9A: the calibrated √cos up to where it was fitted,
   * then the spread taper (reachShare): a sea 94° off an E-facing beach, the
   * N windswell of 14 Nov, reaches it at about a fifth of its height instead
   * of none. Nothing past about 120°.
   */
  const fitted = theta >= 90 ? 0 : Math.sqrt(Math.cos((theta * Math.PI) / 180))
  return h0 * Math.max(fitted, Math.sqrt(reachShare(theta)))
}

export const breakKomar = (h0: number, period: number): number => (h0 <= 0 || period <= 0 ? 0 : 0.39 * G ** 0.2 * (period * h0 * h0) ** 0.4)

export function breakLeMehaute(h0: number, period: number, slope = BEACH_SLOPE): number {
  if (h0 <= 0 || period <= 0) return 0
  const l0 = (G * period * period) / (2 * Math.PI)
  return h0 * 0.76 * slope ** (1 / 7) * (h0 / l0) ** -0.25
}

export type SurfSize = 'Flat' | 'Small' | 'Fun' | 'Solid' | 'Big'
export type SurfShape = 'Clean' | 'Bumpy' | 'Messy'

/** Face height in feet, in words. */
export function surfSize(faceFt: number): SurfSize {
  if (faceFt < 1) return 'Flat'
  if (faceFt < 2) return 'Small'
  if (faceFt < 4) return 'Fun'
  if (faceFt < 6) return 'Solid'
  return 'Big'
}

/*
 * THE SURF TAG SCALE, the one place it is decided (Batch QA, Section 0B;
 * field 10 Nov 6:52 AM, VB Pier: "2–4 ft · FUN · bumpy, onshore" while the cam
 * showed thigh to waist with onshore texture). Size first, from the faces:
 *
 *   Flat      under SURF_SMALL_FT, 0.6 ft: nothing to ride
 *   Small     SURF_SMALL_FT to SURF_FUN_FT, 0.6 to 2.5 ft: ankle to thigh
 *             (Batch TRUTH: 12 Nov, ankle to knee and clean, was Small, not
 *             the Flat this scale said under 1.5 ft)
 *   Fun       SURF_FUN_FT to SURF_FIRING_FT, 2.5 to 4 ft: waist and up
 *   Firing    SURF_FIRING_FT, 4 ft, and up
 *
 * Then the wind on the water (surfShape): Fun and Firing need it Clean (light
 * or offshore). Bumpy, or no wind forecast, drops one step; Messy drops two:
 *
 *   Firing   Clean Firing · Bumpy Fun · Messy Rideable
 *   Fun      Clean Fun · Bumpy Rideable · Messy Small
 *   Small    Clean or Bumpy Small · Messy Flat
 *   Flat     Flat
 *
 * Rideable is only ever a surfable size the wind has spoiled. The tag reads
 * the same shape as the line beside it ("bumpy, onshore"), so it can never
 * contradict it.
 */
export type SurfTag = 'Flat' | 'Small' | 'Rideable' | 'Fun' | 'Firing'
export const SURF_TAGS: readonly SurfTag[] = ['Flat', 'Small', 'Rideable', 'Fun', 'Firing']
export const SURF_SMALL_FT = 0.6
export const SURF_FUN_FT = 2.5
export const SURF_FIRING_FT = 4

export function surfTag(faceFt: number, shape: SurfShape | null): SurfTag {
  const size: SurfTag = faceFt < SURF_SMALL_FT ? 'Flat' : faceFt < SURF_FUN_FT ? 'Small' : faceFt < SURF_FIRING_FT ? 'Fun' : 'Firing'
  const at = SURF_TAGS.indexOf(size)
  const drop = shape === 'Clean' ? 0 : shape === 'Messy' ? 2 : 1
  if (size === 'Flat') return 'Flat'
  if (size === 'Small') return shape === 'Messy' ? 'Flat' : 'Small'
  return SURF_TAGS[Math.max(1, at - drop)]
}

/** Worth going for: Fun or Firing on the one scale. A day or an hour is "surf" only then. */
export const surfOn = (tag: SurfTag | null): boolean => tag === 'Fun' || tag === 'Firing'

/** Onshore at this or more blows the faces apart: 5.1 m/s, 10 kt. */
export const MESSY_ONSHORE_MPS = 5.1

/*
 * WIND SEA HEADING AWAY FROM THE BEACH (Batch TRUTH, Section 2). Waves blown
 * off the land travel out to sea; they never reach the sand. A wind sea
 * coming FROM more than 90° off the beach's facing carries nothing to it, so
 * its energy comes out of the whole sea's height (heights add as squares).
 * Fri 13 Nov at Virginia Beach: NW 12 g21, offshore, read 1-4 ft from the
 * NW wind sea alone.
 */
/*
 * A TAPER, NOT A CUT (Batch LIVE, Section 9A; 14 Nov 3:13 PM: 2-3 ft at 1st
 * St Jetty, 1-2 at Croatan and North End, while a NW wind sea read as "0 ft"
 * and the page said Flat). The share of a wind sea's energy that reaches the
 * beach falls as cos² of its angle off the beach's normal, spread over
 * ±SPREAD_DEG the way a real sea is (SPREAD_STEPS directions, each cos²
 * where it faces in, 0 where it faces out), normalised to 1 head-on: about
 * 0.56 at 45°, 0.07 at 90°, nothing past about 110°. Heights add as squares.
 */
export const SPREAD_DEG = 30
const SPREAD_STEPS = [-1, -0.5, 0, 0.5, 1]
const spreadCos2 = (offDeg: number) => SPREAD_STEPS.reduce((m, k) => m + Math.max(0, Math.cos(((offDeg + k * SPREAD_DEG) * Math.PI) / 180)) ** 2, 0) / SPREAD_STEPS.length
const HEAD_ON = spreadCos2(0)

/** The share of a sea's energy that reaches a beach from `offDeg` off its normal, 0-1. */
export function reachShare(offDeg: number): number {
  return Math.max(0, Math.min(1, spreadCos2(Math.abs(offDeg)) / HEAD_ON))
}

export function towardBeachM(totalM: number, windWaveM: number | null, windWaveFromDeg: number | null, facingDeg: number | null): number {
  if (windWaveM === null || windWaveFromDeg === null || facingDeg === null || !(windWaveM > 0)) return totalM
  const share = reachShare(angleApart(windWaveFromDeg, facingDeg))
  const ww = Math.min(windWaveM, totalM)
  return Math.sqrt(Math.max(0, totalM * totalM - ww * ww * (1 - share)))
}

/** Cross-offshore under this grooms the faces like offshore (Batch TRUTH, Section 2): 12 kt. */
export const CLEAN_CROSS_OFF_MPS = 12 * 0.514444

/** Clean when glassy (light under GLASSY_MPS, 5 kt, or offshore) or cross-offshore under 12 kt; messy when onshore and MESSY_ONSHORE_MPS (10 kt) or more; bumpy between. */
export function surfShape(windMps: number, windFromDeg: number, facingDeg: number | null): SurfShape {
  const relation = facingDeg === null ? null : windToBeach(windFromDeg, facingDeg)
  if (isGlassy(windMps, relation)) return 'Clean'
  /* 12 Nov: SSW at 4-7 kt on a beach facing 100°, "clean" by every eye and cam; the page said "bumpy, cross-shore". */
  if (facingDeg !== null && windSide(windFromDeg, facingDeg) === 'cross-offshore' && windMps < CLEAN_CROSS_OFF_MPS) return 'Clean'
  if (relation === 'onshore' && windMps >= MESSY_ONSHORE_MPS) return 'Messy'
  return 'Bumpy'
}

export interface SurfEstimate {
  /** Breaking (face) height, feet, by Komar and Gaillard: the one shown. */
  faceFt: number
  /** The same by Le Mehaute and Koh, for the double check. */
  faceFtLeMehaute: number
  size: SurfSize
}

/*
 * THE BEACH CAP (Batch QA, Section 0B; field 10 Nov 6:52-7:05 AM, VB Pier,
 * src/data/beachObservations.ts). Komar's breaker height runs 1.3 to 1.8
 * times the deep-water height at 8 to 14 s: buoy 44099 at 3.0 ft and 12 s
 * came out "≈ 4.8 ft" at the beach while the cam showed 2-3 ft, thigh to
 * waist. The face is never taken above the height it was worked from, times
 * BEACH_CAP; a spot gets more only with a documented observation that says
 * so, and none has one yet.
 */
export const BEACH_CAP = 1

/** `factor`: the region's (src/core/beachFactor.ts beachFactorAt), BEACH_CAP where none is known. */
export function surfEstimate(swellM: number, period: number, swellFromDeg: number, facingDeg: number | null, factor: number = BEACH_CAP): SurfEstimate {
  const h = angledHeight(swellM, swellFromDeg, facingDeg)
  const cap = Math.max(0, swellM) * 3.28084 * factor
  const k = Math.min(breakKomar(h, period) * 3.28084, cap)
  const l = Math.min(breakLeMehaute(h, period) * 3.28084, cap)
  return { faceFt: k, faceFtLeMehaute: l, size: surfSize(k) }
}
