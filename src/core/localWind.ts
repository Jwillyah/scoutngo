/*
 * LOCAL PHYSICS (Batch L, Section 2). Arithmetic the models leave coarse at
 * one beach: when the sea breeze comes in, and how much stronger the wind is
 * at 400 ft than at the ground for the air's state that hour.
 *
 * SEA BREEZE. On a sunny day the land heats and the sea does not; once the
 * land is warm enough over the sea, cool air pushes ashore and the wind turns
 * onshore, usually late morning to early afternoon. A wind already blowing
 * off the land holds it back until the contrast is bigger, and a strong one
 * holds it off all day.
 *
 *   contrast   the forecast's 2 m temperature at the venue minus the sea's
 *              surface temperature (Open-Meteo Marine)
 *   holding    the morning wind's offshore part, m/s: its speed times the
 *              cosine of the angle between where it comes from and straight
 *              off the land
 *   onset      the first daytime hour the contrast reaches SB_DT_C plus
 *              SB_HOLD_PER_MPS for each m/s of holding; never past
 *              SB_MAX_HOLD_MPS of holding
 *   the turn   the forecast's own wind turning onshore (within 60° of
 *              straight in off the sea) at or after onset: its hour, its
 *              direction and speed are what is said. When the models do not
 *              turn, only "possible" with the contrast, and no speed.
 *
 * A wind already onshore all morning has nothing to turn: nothing is said.
 *
 * 400 FT. The wind grows with height, and how fast depends on the air:
 * sun-heated ground stirs the lowest few hundred metres and the wind aloft
 * mixes down (a small step up), a clear calm night sets an inversion and the
 * ground wind decouples from the wind above (a big step up). The power law
 * v(z) = v(10 m) x (z / 10)^alpha, with alpha by stability class from the
 * sun's height, the cloud and the wind (Pasquill's classes, Irwin 1979's
 * rural exponents, grouped in three):
 *
 *   mixing     sun 15° or more up, cloud under 85%, ground wind under 6 m/s    alpha 0.10
 *   neutral    overcast, low sun, or 6 m/s and more by day or night             alpha 0.15
 *   inversion  sun down, cloud under 50%, ground wind under 6 m/s               alpha 0.35
 *              (cloudier nights are between: alpha 0.25)
 */
import { angleApart, windToBeach } from './coastFacing.ts'
import { compassPoint } from './field.ts'

export const SB_DT_C = 3
export const SB_HOLD_PER_MPS = 0.6
export const SB_MAX_HOLD_MPS = 7
/** Within this of straight onshore is "onshore" for the turn. */
export const SB_ONSHORE_DEG = 60
/** Daytime hours the turn is looked for, local. */
export const SB_FIRST_HOUR = 9
export const SB_LAST_HOUR = 17

export interface SbHour {
  at: Date
  /** Local hour 0-23. */
  hour: number
  tempC: number | null
  mps: number | null
  fromDeg: number | null
}

export type SeaBreeze =
  | { kind: 'turn'; at: Date; fromDeg: number; mps: number; contrastC: number }
  | { kind: 'possible'; at: Date; contrastC: number }
  | { kind: 'held'; holdMps: number }
  | null

/**
 * One day's sea breeze from its hours (local hour given), the beach's facing
 * (the way it looks out to sea) and the sea's temperature.
 */
export function seaBreeze(hours: readonly SbHour[], facing: number | null, seaC: number | null): SeaBreeze {
  if (facing === null || seaC === null) return null
  const day = hours.filter((h) => h.hour >= SB_FIRST_HOUR - 2 && h.hour <= SB_LAST_HOUR)
  const morning = day.filter((h) => h.hour >= SB_FIRST_HOUR - 2 && h.hour < SB_FIRST_HOUR + 1 && h.mps !== null && h.fromDeg !== null)
  if (morning.length === 0) return null
  const onshore = (from: number) => angleApart(from, facing) <= SB_ONSHORE_DEG
  /* Already blowing in off the sea all morning: there is no turn to see. */
  if (morning.every((h) => onshore(h.fromDeg as number))) return null
  /* The offshore part of the morning wind: from straight off the land is facing + 180. */
  const hold = Math.max(0, ...morning.map((h) => (h.mps as number) * Math.cos((angleApart(h.fromDeg as number, (facing + 180) % 360) * Math.PI) / 180)))
  if (hold > SB_MAX_HOLD_MPS) return { kind: 'held', holdMps: hold }
  const need = SB_DT_C + SB_HOLD_PER_MPS * hold
  const onset = day.find((h) => h.hour >= SB_FIRST_HOUR && h.tempC !== null && h.tempC - seaC >= need)
  if (onset === undefined) return null
  const contrastC = (onset.tempC as number) - seaC
  const turn = day.find((h, i) => h.at.getTime() >= onset.at.getTime() && h.fromDeg !== null && h.mps !== null && onshore(h.fromDeg) && (i === 0 || day[i - 1].fromDeg === null || !onshore(day[i - 1].fromDeg as number)))
  if (turn !== undefined) return { kind: 'turn', at: turn.at, fromDeg: turn.fromDeg as number, mps: turn.mps as number, contrastC }
  return { kind: 'possible', at: onset.at, contrastC }
}

/* ------------------------------------------------------------- 400 ft */

export type Stability = 'mixing' | 'neutral' | 'inversion'
export const STABILITY_WORD: Record<Stability, string> = { mixing: 'sun-heated mixing', neutral: 'neutral: overcast, low sun or a strong wind', inversion: 'night inversion' }
export const FT_400_M = 121.92

export function stabilityOf(sunAltDeg: number, cloudPct: number | null, windMps: number): { cls: Stability; alpha: number } {
  const cloud = cloudPct ?? 50
  if (windMps >= 6) return { cls: 'neutral', alpha: 0.15 }
  if (sunAltDeg >= 15) return cloud < 85 ? { cls: 'mixing', alpha: 0.1 } : { cls: 'neutral', alpha: 0.15 }
  if (sunAltDeg > 0) return { cls: 'neutral', alpha: 0.15 }
  return cloud < 50 ? { cls: 'inversion', alpha: 0.35 } : { cls: 'inversion', alpha: 0.25 }
}

/** How many times the 10 m wind the wind at `heightM` is, for the air's state. */
export function aloftFactor(sunAltDeg: number, cloudPct: number | null, windMps: number, heightM = FT_400_M): { cls: Stability; alpha: number; factor: number } {
  const s = stabilityOf(sunAltDeg, cloudPct, windMps)
  return { ...s, factor: (heightM / 10) ** s.alpha }
}

/* --------------------------------------------------------------- words */

export interface WindSay {
  /** "10 mph": a speed in the shooter's unit. */
  speed: (mps: number) => string
  /** "1 PM". */
  hour: (at: Date) => string
  /** "6°": a temperature difference in the shooter's unit. */
  diff: (c: number) => string
}

/** "Sea breeze ~1 PM, turns SE 10 mph" or "Sea breeze possible from ~12 PM · land 6° warmer than the sea"; null when there is none to say. */
export function seaBreezeLine(sb: SeaBreeze, say: WindSay): string | null {
  if (sb === null) return null
  if (sb.kind === 'held') return `No sea breeze in the forecast: ${say.speed(sb.holdMps)} off the land holds it back`
  if (sb.kind === 'possible') return `Sea breeze possible from ~${say.hour(sb.at)} · land ${say.diff(sb.contrastC)} warmer than the sea`
  return `Sea breeze ~${say.hour(sb.at)}, turns ${compassPoint(sb.fromDeg)} ${say.speed(sb.mps)}`
}

const TO_BEACH_WORD = { offshore: 'offshore', cross: 'cross-shore', onshore: 'onshore' } as const

/**
 * ONSHORE OR OFFSHORE, ONE WAY EVERYWHERE (Batch L, Section 2): "Wind
 * onshore, 12 mph from the E". From the beach's own facing, through
 * windToBeach (coastFacing.ts), which the Surf page, the Water card and
 * Today all read. Null inland or with no wind said.
 */
export function beachWindLine(fromDeg: number | null, mps: number | null, facing: number | null, speed: (mps: number) => string): string | null {
  if (fromDeg === null || mps === null || facing === null) return null
  return `Wind ${TO_BEACH_WORD[windToBeach(fromDeg, facing)]}, ${speed(mps)} from the ${compassPoint(fromDeg)}`
}
