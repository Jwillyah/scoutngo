/*
 * HOW LONG A BUOY'S WAVES TAKE TO REACH THE SPOT (Batch N, Section 4).
 *
 * Deep-water group speed: the energy of a wave train of period T travels at
 *
 *   cg = g · T / (4π)
 *
 * (half the phase speed g·T/2π). 10 s → 7.80 m/s; 30 km at that speed is
 * 3,846 s, about 64 minutes. Shoaling slows the last stretch near the beach,
 * so this is the open-water figure and the page says so.
 *
 * ONLY WHEN THE WAVES ARE HEADED HERE. NDBC's MWD is the direction the
 * dominant-period waves come FROM; they travel toward MWD + 180. A travel
 * time is given only when that heading is within AIMED_TOLERANCE_DEG of the
 * bearing from the buoy to the spot. Otherwise the waves at the buoy are not
 * on their way to the spot and no time is given.
 */
import { bearingBetween, distanceMeters, type LatLon } from './geo.ts'

/** Standard gravity, m/s². */
export const G = 9.80665

/** How far the waves' heading may be from the buoy-to-spot bearing and still count as headed for the spot. */
export const AIMED_TOLERANCE_DEG = 45

/** Deep-water group speed, m/s, for a wave period in seconds. Null for a period that is not a positive number. */
export function groupSpeedMps(periodS: number | null): number | null {
  if (periodS === null || !Number.isFinite(periodS) || periodS <= 0) return null
  return (G * periodS) / (4 * Math.PI)
}

/** Seconds for a wave train of this period to cover this many metres in deep water. */
export function travelSeconds(meters: number, periodS: number | null): number | null {
  const cg = groupSpeedMps(periodS)
  if (cg === null || !Number.isFinite(meters) || meters < 0) return null
  return meters / cg
}

/** The smaller angle between two compass directions, 0 to 180. */
export function angleApart(a: number, b: number): number {
  const d = Math.abs((((a - b) % 360) + 360) % 360)
  return Math.min(d, 360 - d)
}

/** Whether waves coming FROM fromDeg are travelling toward a spot that lies at bearingToSpot from the buoy. */
export function headedFor(fromDeg: number | null, bearingToSpot: number, toleranceDeg = AIMED_TOLERANCE_DEG): boolean {
  if (fromDeg === null || !Number.isFinite(fromDeg)) return false
  return angleApart((fromDeg + 180) % 360, bearingToSpot) <= toleranceDeg
}

export interface SwellTravel {
  /** Buoy to spot, metres. */
  meters: number
  /** Bearing from the buoy to the spot, degrees true. */
  bearingToSpot: number
  /** Whether the buoy's waves are headed for the spot (headedFor). */
  aimed: boolean
  /** Minutes to reach the spot at the group speed, or null when not aimed or the period is unknown. */
  minutes: number | null
}

/** The buoy-to-spot leg for one reading: distance, bearing, and the travel time only when the waves are headed for the spot. */
export function swellTravel(buoy: LatLon, spot: LatLon, periodS: number | null, fromDeg: number | null): SwellTravel {
  const meters = distanceMeters(buoy, spot)
  const bearingToSpot = bearingBetween(buoy, spot)
  const aimed = headedFor(fromDeg, bearingToSpot)
  const s = aimed ? travelSeconds(meters, periodS) : null
  return { meters, bearingToSpot, aimed, minutes: s === null ? null : s / 60 }
}

/*
 * THE BUOY AGAINST THE FORECAST. The nearest buoy's measured height against
 * the spot's own Open-Meteo Marine wave height at the hour the buoy read: not
 * the forecast at the buoy, which would be another request. "Same" within
 * the larger of FORECAST_TOLERANCE_M and FORECAST_TOLERANCE_FRACTION of the
 * forecast.
 */
export const FORECAST_TOLERANCE_M = 0.15
export const FORECAST_TOLERANCE_FRACTION = 0.2

export type VersusForecast = 'smaller' | 'bigger' | 'as-forecast'

export function versusForecast(buoyM: number | null, forecastM: number | null): VersusForecast | null {
  if (buoyM === null || forecastM === null || !Number.isFinite(buoyM) || !Number.isFinite(forecastM)) return null
  const tol = Math.max(FORECAST_TOLERANCE_M, FORECAST_TOLERANCE_FRACTION * forecastM)
  if (buoyM < forecastM - tol) return 'smaller'
  if (buoyM > forecastM + tol) return 'bigger'
  return 'as-forecast'
}
