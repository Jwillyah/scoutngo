/*
 * THE SURF NOW, NUDGED BY THE BUOY (Batch Beach, Section 2). 10 Nov, Mirlo
 * Beach: clean offshore 3 ft at 12 s on the buoy, and the tag said "SMALL"
 * from the model. As the wind is nudged by its station (src/core/nowcast.ts),
 * the surf leans to the buoy:
 *
 *   the miss    the buoy's face at this beach (src/core/spotSkill.ts
 *               buoyFaceFt, the one buoy→beach function) minus the
 *               forecast's corrected centre at the reading's hour
 *   the weight  1 at the reading, falling in a straight line to 0 at
 *               SURF_FADE_MS after it; nothing before it
 *   the range   the centre and both ends move by the same weighted miss,
 *               never below 0
 *
 * Truth is the buoy, never another app's forecast. The arithmetic only;
 * src/lib/surfPageData.ts applies it.
 */
import type { SurfRange } from './spotSkill.ts'

export const SURF_FADE_MS = 6 * 3_600_000

export interface SurfLean {
  /** The buoy reading's time, ms. */
  at: number
  /** The buoy's face minus the forecast's centre at that hour, feet. */
  missFt: number
}

/** How much of the buoy's miss is still applied at `t` (ms). */
export function surfLeanWeight(lean: SurfLean, t: number): number {
  const dt = t - lean.at
  if (dt < -15 * 60_000) return 0
  return Math.max(0, Math.min(1, 1 - Math.max(0, dt) / SURF_FADE_MS))
}

/** The lean from a buoy face and the forecast's centre at its hour; null when either is missing. */
export function surfLean(buoyFt: number | null, centerFt: number | null, at: number): SurfLean | null {
  if (buoyFt === null || centerFt === null || !Number.isFinite(buoyFt) || !Number.isFinite(centerFt) || !Number.isFinite(at)) return null
  return { at, missFt: buoyFt - centerFt }
}

/** The range at `t` leaned by `lean`, and the shift applied (0 when none). */
export function leanRange(range: SurfRange, lean: SurfLean | null, t: number): { range: SurfRange; shiftFt: number } {
  if (lean === null) return { range, shiftFt: 0 }
  const shift = surfLeanWeight(lean, t) * lean.missFt
  if (shift === 0) return { range, shiftFt: 0 }
  const centerFt = Math.max(0, range.centerFt + shift)
  return {
    range: { ...range, centerFt, lowFt: Math.max(0, Math.min(centerFt, range.lowFt + shift)), highFt: Math.max(centerFt, range.highFt + shift) },
    shiftFt: centerFt - range.centerFt,
  }
}

/*
 * THE BUOYS, WEIGHED (Batch DRONE, Section 1; CORE 8.1). Each fresh buoy is
 * worked to faces at this beach by the one transform (src/core/surfTransform.ts
 * seaFaceFt, the forecast's own), and the lean goes to their weighted mean:
 *
 *   weight   the share of the buoy's sea that is heading for this beach
 *            (seaReach): 44099's bay wind sea and 44014's offshore NW sea on
 *            14 Nov measured a sea going away, and said little about the one
 *            arriving; a bay-mouth buoy (BAY_MOUTH) counts half again
 *   cap      ±LEAN_CAP_FT when the buoys disagree with each other, or with
 *            the forecast, by more than DISAGREE_FT: no one measurement to
 *            follow, so the lean is held to a foot
 *   floor    never below FLOOR_SHARE of the forecast's centre (applied by
 *            the caller, src/lib/surfPageData.ts buoyLean)
 */
export const LEAN_CAP_FT = 1
export const DISAGREE_FT = 1

export interface BuoyFace {
  faceFt: number
  /** 0-1, the weight it carries. */
  weight: number
}

/** The buoys' face at this beach, weighted; null when none can be worked out. With every weight 0 (no buoy's sea heads here), the plain mean. */
export function buoyConsensus(faces: readonly BuoyFace[]): number | null {
  const ok = faces.filter((f) => Number.isFinite(f.faceFt) && Number.isFinite(f.weight) && f.weight >= 0)
  if (ok.length === 0) return null
  const w = ok.reduce((m, f) => m + f.weight, 0)
  if (!(w > 0)) return ok.reduce((m, f) => m + f.faceFt, 0) / ok.length
  return ok.reduce((m, f) => m + f.faceFt * f.weight, 0) / w
}

/** The buoys' miss, capped at ±LEAN_CAP_FT when they disagree with each other or with the forecast by more than DISAGREE_FT. */
export function cappedMiss(missFt: number, faces: readonly number[]): number {
  const apart = faces.length < 2 ? 0 : Math.max(...faces) - Math.min(...faces)
  const disagree = apart > DISAGREE_FT || Math.abs(missFt) > DISAGREE_FT
  return disagree ? Math.max(-LEAN_CAP_FT, Math.min(LEAN_CAP_FT, missFt)) : missFt
}
