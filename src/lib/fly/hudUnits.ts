/*
 * THE FLY SCREEN'S NUMBERS, IN ONE SYSTEM. Settings' distance unit decides
 * the lot: feet with miles an hour, or metres with metres a second. The HUD
 * read "H 230 ft · D 120 m · 4.2 m/s" on 27 Oct: three units on one screen.
 */
import type { DistanceUnit } from '../units.ts'

export interface FlyUnits {
  length: 'ft' | 'm'
  speed: 'mph' | 'm/s'
}

export const flyUnits = (distance: DistanceUnit): FlyUnits => (distance === 'm' ? { length: 'm', speed: 'm/s' } : { length: 'ft', speed: 'mph' })

const FT = 0.3048
const MPH = 0.44704

/** A length in the screen's unit, whole numbers; a dash for nothing known. */
export function hudLength(m: number | null | undefined, u: FlyUnits): string {
  if (m === null || m === undefined || !Number.isFinite(m)) return '—'
  return String(Math.round(u.length === 'ft' ? m / FT : m))
}

/** A speed in the screen's unit, one decimal under 10. */
export function hudSpeed(mps: number | null | undefined, u: FlyUnits): string {
  if (mps === null || mps === undefined || !Number.isFinite(mps)) return '—'
  const v = u.speed === 'mph' ? mps / MPH : mps
  return Math.abs(v) < 10 ? v.toFixed(1) : String(Math.round(v))
}

/*
 * HOW CLOSE AN OBSTACLE IS, AS A COLOUR ROLE: 'hazard' (the app's red,
 * which means danger and nothing else) inside HAZARD_M, 'caution' (the sun's
 * amber) inside CAUTION_M, else 'far' (white): nothing the scan measured
 * within CAUTION_M, which says nothing about what it did not measure.
 */
export const HAZARD_M = 5
export const CAUTION_M = 15
export function barRole(m: number | null): 'hazard' | 'caution' | 'far' | 'unknown' {
  if (m === null || !Number.isFinite(m)) return 'unknown'
  return m < HAZARD_M ? 'hazard' : m < CAUTION_M ? 'caution' : 'far'
}

/* The look switches itself to Animated below this, where the photo is stretched and soft. */
export const ANIMATED_BELOW_FT = 150
