/*
 * WHICH UNITS THE SHOOTER READS IN.
 *
 * KEPT ON THE DEVICE, like every other preference. No account, nothing sent.
 *
 * ONE PLACE CONVERTS, and every readout asks it. The alternative -- each
 * component doing its own arithmetic from a stored flag -- is the same shape
 * as the lens record and its label: as many answers as there are call sites,
 * and the one that is wrong is the one nobody looked at.
 *
 * NOT IN src/core/ ON PURPOSE. Core computes in SI and knows nothing about
 * presentation; a core function whose answer depends on a display preference
 * would be a core function that is no longer a fact.
 */

import { DEFAULT_CLOCK_HOURS, type ClockHours } from '../core/timezone.ts'

export type WindUnit = 'kt' | 'mph' | 'ms'
export type DistanceUnit = 'ft' | 'm'

export interface Units {
  wind: WindUnit
  distance: DistanceUnit
  /** 12 or 24 hour. Kept with the units because it is the same kind of choice: how a value is read, never what it is. */
  clock: ClockHours
}

/*
 * KNOTS AND FEET, because the two things this app is for -- flying a drone
 * and reading a marine forecast -- are both quoted that way, and because the
 * aircraft's own rating is published in m/s and converted once rather than
 * every time somebody reads it.
 */
export const DEFAULT_UNITS: Units = { wind: 'kt', distance: 'ft', clock: DEFAULT_CLOCK_HOURS }

/**
 * Units out of anything stored or imported, field by field.
 *
 * ONE COPY. The settings reviver and the ScoutNGo file import both read units
 * from JSON somebody else wrote; two copies of "is this a unit" is how one of
 * them comes to accept a string the converters cannot handle.
 */
export function reviveUnits(raw: unknown): Units {
  const stored = raw as { wind?: unknown; distance?: unknown; clock?: unknown } | null | undefined
  return {
    wind:
      stored?.wind === 'mph' || stored?.wind === 'ms' || stored?.wind === 'kt'
        ? stored.wind
        : DEFAULT_UNITS.wind,
    distance:
      stored?.distance === 'm' || stored?.distance === 'ft' ? stored.distance : DEFAULT_UNITS.distance,
    clock: stored?.clock === 24 || stored?.clock === 12 ? stored.clock : DEFAULT_UNITS.clock,
  }
}

export const WIND_UNITS: readonly { id: WindUnit; label: string }[] = [
  { id: 'kt', label: 'kt' },
  { id: 'mph', label: 'mph' },
  { id: 'ms', label: 'm/s' },
] as const

export const CLOCK_OPTIONS: readonly { id: ClockHours; label: string }[] = [
  { id: 12, label: '12 hour' },
  { id: 24, label: '24 hour' },
] as const

export const DISTANCE_UNITS: readonly { id: DistanceUnit; label: string }[] = [
  { id: 'ft', label: 'ft' },
  { id: 'm', label: 'm' },
] as const

/*
 * WRITTEN AS THEIR DEFINITIONS, NOT AS ROUNDED FIGURES.
 *
 * These were 1.943844, 2.236936 and 3.280839895 -- each a correct conversion
 * truncated at the point where it looked like enough digits. A test against
 * the SI definitions caught the first one: 1.943844 is 2.5 parts per million
 * short of 3600/1852, which is invisible on a wind chip and is still a number
 * this file does not have to be wrong about.
 *
 * A knot is exactly one nautical mile (1852 m) per hour; a mile is exactly
 * 1609.344 m; the international foot is exactly 0.3048 m. All three are
 * definitions, so the division is the value and there is nothing to round.
 */
const MPS_TO_KT = 3600 / 1852
const MPS_TO_MPH = 3600 / 1609.344
const M_TO_FT = 1 / 0.3048

/** Wind from metres per second into the chosen unit. Null stays null. */
export function windIn(mps: number | null, unit: WindUnit): number | null {
  if (mps === null || !Number.isFinite(mps)) return null
  if (unit === 'kt') return mps * MPS_TO_KT
  if (unit === 'mph') return mps * MPS_TO_MPH
  return mps
}

/** The label for the chosen wind unit, as it is written beside a number. */
export function windUnitLabel(unit: WindUnit): string {
  return unit === 'ms' ? 'm/s' : unit
}

/** Distance from metres into the chosen unit. Null stays null. */
export function distanceIn(meters: number | null, unit: DistanceUnit): number | null {
  if (meters === null || !Number.isFinite(meters)) return null
  return unit === 'ft' ? meters * M_TO_FT : meters
}

export function distanceUnitLabel(unit: DistanceUnit): string {
  return unit
}

/**
 * A wind reading, formatted. A DASH WHERE IT IS NOT KNOWN.
 *
 * Never "0 kt" for an absent forecast: zero wind is a real and notable
 * condition, and printing it for "nobody said" is the exact substitution this
 * app refuses everywhere else.
 */
export function formatWind(mps: number | null, unit: WindUnit, digits = 0): string {
  const value = windIn(mps, unit)
  if (value === null) return '—'
  return `${value.toFixed(digits)} ${windUnitLabel(unit)}`
}

/** A distance reading, formatted. Same dash rule. */
export function formatDistance(meters: number | null, unit: DistanceUnit): string {
  const value = distanceIn(meters, unit)
  if (value === null) return '—'
  return `${Math.round(value).toLocaleString('en-US')} ${distanceUnitLabel(unit)}`
}

const M_PER_MILE = 1609.344
/* A foot is short enough that the switch to miles happens well before one. */
const FEET_IN_A_MILE = M_PER_MILE / 0.3048

/**
 * A LONG DISTANCE, IN THE CHOSEN SYSTEM AND THE SENSIBLE MAGNITUDE.
 *
 * WHY THIS IS A SECOND FUNCTION. formatDistance answers in feet or metres,
 * which is right for an altitude or the distance to a subject and absurd for
 * a weather station: the nearest sky camera at 180 km is "590,551 ft", a
 * number nobody can read and nobody wants. Asking the caller to pick the
 * magnitude would put that decision at every call site, which is how the one
 * that is wrong becomes the one nobody looked at.
 *
 * THE SYSTEM IS THE SHOOTER'S CHOICE; THE MAGNITUDE IS ARITHMETIC. Under a
 * mile reads in feet, over it in miles; under a kilometre in metres, over it
 * in kilometres. Both are the same threshold expressed in the two systems, so
 * neither side of the switch sees a different rule.
 */
export function formatRange(meters: number | null, unit: DistanceUnit): string {
  if (meters === null || !Number.isFinite(meters)) return '—'
  if (unit === 'ft') {
    const feet = meters / 0.3048
    if (feet < FEET_IN_A_MILE) return `${Math.round(feet).toLocaleString('en-US')} ft`
    const miles = meters / M_PER_MILE
    return `${miles < 10 ? miles.toFixed(1) : Math.round(miles).toLocaleString('en-US')} mi`
  }
  if (meters < 1000) return `${Math.round(meters).toLocaleString('en-US')} m`
  const km = meters / 1000
  return `${km < 10 ? km.toFixed(1) : Math.round(km).toLocaleString('en-US')} km`
}
