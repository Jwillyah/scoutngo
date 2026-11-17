/*
 * THE SEA TO THE BEACH, PART BY PART (Batch DRONE, Section 1; the real fix
 * for CORE 8.1). One function turns a sea into faces at a beach, and both
 * sides of every comparison go through it: the forecast's parts
 * (Open-Meteo's swells and wind waves) and a buoy's (its spectral split).
 *
 * WHY. 16 Nov 10:50 AM, Virginia Beach: cams knee to thigh, the app "2-3 ft
 * Rideable" because buoy 44099's 1.2 m, 6 s NE wind sea came out "as faces
 * ~3.3 ft" (fixtures/truth/2026-11-16-vb-surf.json): the old step broke a
 * short wind sea 50-60° off the beach nearly like groundswell. 14 Nov was
 * the mirror (a cut to 0). Same root: no per-part transform.
 *
 * EACH PART, its height H (ft), period T and direction:
 *
 *   direction  the share of its energy that reaches the beach: cos² of its
 *              angle off the beach's normal, spread over ±PART_SPREAD_DEG the
 *              way a real sea is (five directions, each cos² where it faces
 *              in, 0 where it faces out), normalised to 1 head-on: it
 *              tapers from 100° off (14%) to nothing at about 135°
 *   period     the share of its height that breaks as a face: short period
 *              breaks much smaller than its Hs (periodShare): PERIOD_SHORT_SHARE
 *              at PERIOD_SHORT_S and under, 1 at PERIOD_LONG_S and over,
 *              straight between
 *   the beach  the region's factor (src/core/beachFactor.ts), set against a
 *              12 s swell, where the period share is 1, so the two do not
 *              count the same thing twice
 *
 *   face_i = H_i × factor × periodShare(T_i) × √partShare(off_i)
 *
 * and the parts combine by energy, root-sum-square, never by adding heights.
 * A part with no period, or no direction at a beach with a known facing, is
 * left out: its break cannot be worked out, and a guess would be a number
 * we do not know. No usable part: null.
 */
import { angleApart } from './coastFacing.ts'

const FT = 3.28084

/** One part of a sea: its height in metres, period in seconds, the way it comes FROM in degrees. */
export interface SeaPart {
  heightM: number | null
  periodS: number | null
  fromDeg: number | null
}

/*
 * THE SPREAD. ±50°: a box five directions wide, about the spread of a short
 * wind sea. Fixed by 14 Nov 3:30 PM (tests/data/surf-2026-11-12-14/,
 * measurements/2026-11-16-surf-transform.md): 44100's 1.9 m 6 s sea from due
 * N, 100° off the oceanfront, while the beach had 1-2 ft (2-3 at 1st St
 * Jetty, 3:13 PM). At the old ±30° (src/core/surf.ts SPREAD_DEG) that sea
 * reached the beach with 3% of its energy; at ±45° with 10%, and 3:30 PM
 * read 0-1; at ±50° with 14%, and 1-2.
 */
export const PART_SPREAD_DEG = 50
const STEPS = [-1, -0.5, 0, 0.5, 1]
const spreadCos2 = (offDeg: number) => STEPS.reduce((m, k) => m + Math.max(0, Math.cos(((offDeg + k * PART_SPREAD_DEG) * Math.PI) / 180)) ** 2, 0) / STEPS.length
const HEAD_ON = spreadCos2(0)

/** The share of a part's energy that reaches a beach from `offDeg` off its normal, 0-1: about 0.66 at 50°, 0.14 at 100°, nothing from 140°. */
export function partShare(offDeg: number): number {
  return Math.max(0, Math.min(1, spreadCos2(Math.abs(offDeg)) / HEAD_ON))
}

/*
 * THE PERIOD. CORE 8.1's addendum: about 0.35-0.5 of Hs at 5-6 s, 0.9-1.1 at
 * 11 s and up. PERIOD_SHORT_SHARE 0.5, the top of that range, fixed by 14 Nov
 * 1-4 PM: at 0.42 (CORE's trial on the buoy alone) 3-4 PM came out 0-1 ft
 * against a truth of 1-2. The long end is 1 at PERIOD_LONG_S: the beach
 * factor already holds what a 12 s swell does at this beach.
 */
export const PERIOD_SHORT_S = 5
export const PERIOD_LONG_S = 11
export const PERIOD_SHORT_SHARE = 0.5

export function periodShare(periodS: number): number {
  if (!(periodS > 0)) return 0
  if (periodS <= PERIOD_SHORT_S) return PERIOD_SHORT_SHARE
  if (periodS >= PERIOD_LONG_S) return 1
  return PERIOD_SHORT_SHARE + ((periodS - PERIOD_SHORT_S) / (PERIOD_LONG_S - PERIOD_SHORT_S)) * (1 - PERIOD_SHORT_SHARE)
}

const usable = (p: SeaPart, facing: number | null): p is { heightM: number; periodS: number; fromDeg: number | null } =>
  p.heightM !== null && Number.isFinite(p.heightM) && p.heightM > 0 && p.periodS !== null && p.periodS > 0 && (facing === null || p.fromDeg !== null)

/** One part's face at the beach, feet; null when it cannot be worked out. */
export function partFaceFt(p: SeaPart, facing: number | null, factor: number): number | null {
  if (!usable(p, facing)) return null
  const share = facing === null ? 1 : partShare(angleApart(p.fromDeg as number, facing))
  return p.heightM * FT * factor * periodShare(p.periodS) * Math.sqrt(share)
}

/** The sea's face at the beach, feet: the parts by energy (root-sum-square); null when no part can be worked out. */
export function seaFaceFt(parts: readonly SeaPart[], facing: number | null, factor: number): number | null {
  const faces = parts.map((p) => partFaceFt(p, facing, factor)).filter((f): f is number => f !== null)
  if (faces.length === 0) return null
  return Math.sqrt(faces.reduce((m, f) => m + f * f, 0))
}

/**
 * How much of a sea is heading for this beach, 0-1: the share of its energy
 * (H²) that reaches it. A buoy whose sea is mostly heading away (44099's bay
 * wind sea, 44014's offshore NW sea on 14 Nov) measures little of what
 * reaches this sand, and the nowcast weighs it by this (src/lib/surfPageData.ts
 * buoyLean). Null when no part can be worked out.
 */
export function seaReach(parts: readonly SeaPart[], facing: number | null): number | null {
  const ok = parts.filter((p) => usable(p, facing))
  if (ok.length === 0) return null
  if (facing === null) return 1
  const all = ok.reduce((m, p) => m + (p.heightM as number) ** 2, 0)
  if (!(all > 0)) return null
  return ok.reduce((m, p) => m + (p.heightM as number) ** 2 * partShare(angleApart(p.fromDeg as number, facing)), 0) / all
}

/* ---------------------------------------------------- the parts, from each source */

const POINTS: Record<string, number> = { N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5, S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5 }
const point = (s: string | null): number | null => (s === null ? null : (POINTS[s] ?? null))

/** A buoy reading's spectral split, as src/lib/buoy.ts carries it. */
export interface BuoySplitIn {
  swellM: number | null
  swellS: number | null
  swellFrom: string | null
  windWaveM: number | null
  windWaveS: number | null
  windWaveFrom: string | null
}

/** A buoy's parts: its spectral split (swell and wind sea, each its own period and direction) when it sent one, else its whole sea as one part. */
export function buoySeaParts(b: { waveM: number; periodS: number | null; fromDeg: number | null; split?: BuoySplitIn | null }): SeaPart[] {
  const s = b.split ?? null
  if (s !== null && ((s.swellM ?? 0) > 0 || (s.windWaveM ?? 0) > 0)) {
    return [
      { heightM: s.swellM, periodS: s.swellS, fromDeg: point(s.swellFrom) },
      { heightM: s.windWaveM, periodS: s.windWaveS, fromDeg: point(s.windWaveFrom) },
    ].filter((p) => (p.heightM ?? 0) > 0)
  }
  return [{ heightM: b.waveM, periodS: b.periodS, fromDeg: b.fromDeg }]
}

/**
 * The forecast's parts at an hour (Open-Meteo Marine's names): the swells and
 * the wind waves it gives, and whatever of the whole sea (wave_height) they
 * leave out, as one more part at the whole sea's period and direction: the
 * face is the whole sea's energy (Batch Beach, Section 2: swell-only ran
 * 1.5 ft low at Sandbridge), each part broken its own way. The whole sea as
 * one part when no parts are given.
 */
export function forecastSeaParts(read: (name: string) => number | null): SeaPart[] {
  const part = (k: string): SeaPart => ({ heightM: read(`${k}_height`), periodS: read(`${k}_period`), fromDeg: read(`${k}_direction`) })
  const parts = ['swell_wave', 'secondary_swell_wave', 'tertiary_swell_wave', 'wind_wave'].map(part).filter((p) => (p.heightM ?? 0) > 0)
  const whole = part('wave')
  if (parts.length === 0) return [whole]
  const left = (whole.heightM ?? 0) ** 2 - parts.reduce((m, p) => m + (p.heightM as number) ** 2, 0)
  return left > 0 ? [...parts, { ...whole, heightM: Math.sqrt(left) }] : parts
}

/** Where a part's share reaches nothing: the spread's far edge past square-on (derived, not tuned). */
export const PART_GONE_DEG = 90 + PART_SPREAD_DEG

/* ------------------------------------------------- wind sea against swell */

/*
 * WHICH PART IS WIND SEA (Batch FIX, Section 3.1). 16 Nov 10:50 AM the beach
 * was wind-chopped by a N wind sea (fixtures/truth/2026-11-16-vb-surf.json)
 * and nothing said so: the model's NNW wind counted as cross-offshore. The
 * quality now keys on the chop itself, the wind sea against the swell at the
 * beach, each through the transform above.
 *
 * A part is wind sea or swell by its period, one line for both sources:
 *
 *   under WIND_SEA_MAX_S   wind sea, whatever the source called it. Open-
 *                          Meteo names its biggest part "swell" even at
 *                          3.5-4.5 s (tests/data/surf-2026-11-17/marine.json,
 *                          17 Nov 7 AM); NDBC split the same morning's sea as
 *                          wind waves at 4.3-5.0 s and 16 Nov's at 5.3 s
 *                          (tests/data/surf-2026-11-16/44099.spec,
 *                          tests/data/surf-2026-11-17/44099.spec)
 *   SWELL_FROM_S and over  swell, even when the source called it wind waves
 *                          (src/core/surfReads.ts, Batch TRUTH 2: 44099's
 *                          9 s "wind waves" on 12 Nov were clean lines)
 *   between                as the source named it
 *
 * 6 s: about the peak period of a sea fully grown under a 16 kt wind
 * (Pierson-Moskowitz, T ≈ 0.73 × U in m/s), so a part under it can be the
 * local wind's own sea; the measured splits above sit under it.
 */
export const WIND_SEA_MAX_S = 6
export const SWELL_FROM_S = 8

export type SeaKind = 'swell' | 'wind'
export interface KindPart extends SeaPart {
  kind: SeaKind
}

/** Wind sea or swell, by the period first and the source's own name between the two lines. */
export function seaKind(periodS: number | null, named: SeaKind): SeaKind {
  if (periodS === null || !(periodS > 0)) return named
  if (periodS < WIND_SEA_MAX_S) return 'wind'
  if (periodS >= SWELL_FROM_S) return 'swell'
  return named
}

/** The forecast's parts, each named wind sea or swell (forecastSeaParts, kept apart). */
export function forecastSeaKinds(read: (name: string) => number | null): KindPart[] {
  const part = (k: string, named: SeaKind): KindPart => {
    const p = { heightM: read(`${k}_height`), periodS: read(`${k}_period`), fromDeg: read(`${k}_direction`) }
    return { ...p, kind: seaKind(p.periodS, named) }
  }
  const parts = [part('swell_wave', 'swell'), part('secondary_swell_wave', 'swell'), part('tertiary_swell_wave', 'swell'), part('wind_wave', 'wind')].filter((p) => (p.heightM ?? 0) > 0)
  const whole = part('wave', 'swell')
  if (parts.length === 0) return [whole]
  const left = (whole.heightM ?? 0) ** 2 - parts.reduce((m, p) => m + (p.heightM as number) ** 2, 0)
  return left > 0 ? [...parts, { ...whole, heightM: Math.sqrt(left) }] : parts
}

/** A buoy's parts, each named: its split's swell and wind waves by the same period lines; its whole sea, by its period, when it sent no split. */
export function buoySeaKinds(b: { waveM: number; periodS: number | null; fromDeg: number | null; split?: BuoySplitIn | null }): KindPart[] {
  const s = b.split ?? null
  if (s !== null && ((s.swellM ?? 0) > 0 || (s.windWaveM ?? 0) > 0)) {
    const out: KindPart[] = [
      { heightM: s.swellM, periodS: s.swellS, fromDeg: point(s.swellFrom), kind: seaKind(s.swellS, 'swell') },
      { heightM: s.windWaveM, periodS: s.windWaveS, fromDeg: point(s.windWaveFrom), kind: seaKind(s.windWaveS, 'wind') },
    ]
    return out.filter((p) => (p.heightM ?? 0) > 0)
  }
  return [{ heightM: b.waveM, periodS: b.periodS, fromDeg: b.fromDeg, kind: seaKind(b.periodS, 'swell') }]
}

/** The energy (face², ft²) of the wind sea and of the swell that reach this beach; null when no part can be worked out. */
export function seaEnergyAtBeach(parts: readonly KindPart[], facing: number | null, factor: number): { windFt2: number; swellFt2: number } | null {
  let windFt2 = 0
  let swellFt2 = 0
  let any = false
  for (const p of parts) {
    const f = partFaceFt(p, facing, factor)
    if (f === null) continue
    any = true
    if (p.kind === 'wind') windFt2 += f * f
    else swellFt2 += f * f
  }
  return any ? { windFt2, swellFt2 } : null
}

/*
 * THE WIND SEA DOMINATES when its energy at the beach is WIND_SEA_DOMINANCE
 * times the swell's or more (the batch's line: "wind-sea energy ≥ 2× swell
 * after the transform"). A sea with nothing reaching the beach does not
 * dominate anything; null when no part can be worked out.
 */
export const WIND_SEA_DOMINANCE = 2
export function windSeaDominates(e: { windFt2: number; swellFt2: number } | null): boolean | null {
  if (e === null) return null
  return e.windFt2 > 0 && e.windFt2 >= WIND_SEA_DOMINANCE * e.swellFt2
}
