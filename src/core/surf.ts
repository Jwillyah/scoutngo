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
import { angleApart, isGlassy, windToBeach } from './coastFacing.ts'

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
  if (theta >= 90) return 0
  return h0 * Math.sqrt(Math.cos((theta * Math.PI) / 180))
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

/** Clean when glassy (light, or offshore); messy when onshore and 10 kt or more; bumpy between. */
export function surfShape(windMps: number, windFromDeg: number, facingDeg: number | null): SurfShape {
  const relation = facingDeg === null ? null : windToBeach(windFromDeg, facingDeg)
  if (isGlassy(windMps, relation)) return 'Clean'
  if (relation === 'onshore' && windMps >= 5.1) return 'Messy'
  return 'Bumpy'
}

export interface SurfEstimate {
  /** Breaking (face) height, feet, by Komar and Gaillard: the one shown. */
  faceFt: number
  /** The same by Le Mehaute and Koh, for the double check. */
  faceFtLeMehaute: number
  size: SurfSize
}

export function surfEstimate(swellM: number, period: number, swellFromDeg: number, facingDeg: number | null): SurfEstimate {
  const h = angledHeight(swellM, swellFromDeg, facingDeg)
  const k = breakKomar(h, period) * 3.28084
  const l = breakLeMehaute(h, period) * 3.28084
  return { faceFt: k, faceFtLeMehaute: l, size: surfSize(k) }
}
