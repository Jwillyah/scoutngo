/*
 * THE DRONE PAGE'S ARITHMETIC (Batch Flow, Section 5; board D_Drone).
 *
 *   the air    the wind at the ground, 100, 200, 300 and 400 ft (between the
 *              forecast's 10 m and 120 m on a log of the height,
 *              src/core/homeCards.ts windAtFeet), each coloured by its share
 *              of the drone's limit: calm under CALM_SHARE, near under the
 *              limit, over at or past it
 *   the best   the next 18 hours as one bar: dark (the sun under -6°),
 *   time       twilight (-6° to 0°), golden (0° to +6°), the calm window
 *              (daylight, the wind at the planned height under CALM_SHARE
 *              of the limit), day; the first that applies, in that order
 *
 * Facts, never "safe" (rule 28): "calm" is a number under a share of the
 * drone's own limit, said with the limit.
 */
import { windAtFeet } from './homeCards.ts'

/** Calm: the wind at the planned height under this share of the drone's limit. */
export const CALM_SHARE = 0.6
/** The height the page plans for, feet, until the pilot sets one in Preflight. */
export const PLANNED_FT = 150
export const AIR_ROWS_FT = [400, 300, 200, 100, 0] as const

export type AirRole = 'calm' | 'near' | 'over' | 'unknown'

export function airRole(mps: number | null, limitMps: number | null): AirRole {
  if (mps === null) return 'unknown'
  if (limitMps === null) return 'calm'
  const share = mps / limitMps
  return share < CALM_SHARE ? 'calm' : share < 1 ? 'near' : 'over'
}

export interface AirRow {
  ft: number
  mps: number | null
  role: AirRole
  /** 0 to 1: the arrow's length, by speed against the strongest row (or the limit). */
  length: number
}

/** The air column, 400 ft at the top. */
export function airColumn(mps10: number | null, mps120: number | null, limitMps: number | null): AirRow[] {
  const speeds = AIR_ROWS_FT.map((ft) => (ft === 0 ? mps10 : ft === 400 ? mps120 : windAtFeet(mps10, mps120, ft)))
  const top = Math.max(limitMps ?? 0, ...speeds.map((v) => v ?? 0), 1)
  return AIR_ROWS_FT.map((ft, i) => ({ ft, mps: speeds[i], role: airRole(speeds[i], limitMps), length: speeds[i] === null ? 0 : Math.max(0.2, (speeds[i] as number) / top) }))
}

export type FlyBand = 'dark' | 'twilight' | 'golden' | 'calm' | 'day'

export interface FlySegment {
  band: FlyBand
  from: Date
  to: Date
}

/** The next `hours` as bands, every `stepMin` minutes, merged. `windAt` is the wind at the planned height, m/s. */
export function bestTimeBar(now: Date, hours: number, sunAlt: (t: Date) => number, windAt: (t: Date) => number | null, limitMps: number | null, stepMin = 15): FlySegment[] {
  const out: FlySegment[] = []
  const t0 = now.getTime()
  for (let m = 0; m < hours * 60; m += stepMin) {
    const t = new Date(t0 + m * 60_000)
    const alt = sunAlt(t)
    const w = windAt(t)
    const band: FlyBand = alt < -6 ? 'dark' : alt < 0 ? 'twilight' : alt < 6 ? 'golden' : limitMps !== null && w !== null && w < CALM_SHARE * limitMps ? 'calm' : 'day'
    const last = out[out.length - 1]
    const to = new Date(t.getTime() + stepMin * 60_000)
    if (last !== undefined && last.band === band) last.to = to
    else out.push({ band, from: t, to })
  }
  return out
}

/** The first calm window ahead, or null. */
export const calmWindow = (segs: readonly FlySegment[]): FlySegment | null => segs.find((s) => s.band === 'calm') ?? null
