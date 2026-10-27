/*
 * THE TIDE SHEET'S WORDS: one plain sentence a ten-year-old gets, then the
 * numbers. Computed values only; nothing here is guessed.
 */
import { isGlassy, windToBeach, type WindToBeach } from '../core/coastFacing.ts'
import type { TideDirection } from '../core/tide.ts'

export function motionWords(direction: TideDirection, feetPerHour: number | null): string {
  if (direction === 'slack' || feetPerHour === null || Math.abs(feetPerHour) < 0.05) return 'The water is turning: hardly moving'
  const rate = Math.abs(feetPerHour).toFixed(1)
  return direction === 'rising' ? `Coming in, ${rate} ft an hour` : `Going out, ${rate} ft an hour`
}

export const metresToFeet = (m: number): number => m * 3.28084
export const celsiusToF = (c: number): number => (c * 9) / 5 + 32

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
export const compass = (deg: number): string => COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16]

export interface GlassRead {
  glassy: boolean
  relation: WindToBeach | null
  /** "Glassy: light wind" and the like. */
  line: string
}

export function glassRead(speedMps: number, fromDeg: number, facing: number | null): GlassRead {
  const relation = facing === null ? null : windToBeach(fromDeg, facing)
  const glassy = isGlassy(speedMps, relation)
  const line = glassy
    ? speedMps < 2.6
      ? 'Glassy: hardly any wind'
      : 'Glassy: the wind blows off the land'
    : relation === 'onshore'
      ? 'Choppy: the wind blows in off the water'
      : relation === 'cross'
        ? 'Bumpy: the wind blows along the beach'
        : 'Windy'
  return { glassy, relation, line }
}
