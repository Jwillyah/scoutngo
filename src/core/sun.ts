import { getPosition, getTimes } from 'suncalc'

const RAD_TO_DEG = 180 / Math.PI

export interface SunPosition {
  /** Compass bearing of the sun: 0 = north, 90 = east, increasing clockwise. */
  azimuth: number
  /** Degrees above the horizon. Negative when the sun is down. */
  altitude: number
  /** Compass bearing that shadows are cast toward: (azimuth + 180) % 360. */
  shadowBearing: number
}

/**
 * Converts the CLASSIC suncalc azimuth convention (radians measured from SOUTH,
 * positive toward WEST) into compass degrees (from NORTH, positive clockwise).
 *
 * NOT applied by getSunPosition below. The suncalc build installed here
 * (2.0.2, ESM rewrite) already reports azimuth in north-based compass DEGREES,
 * per its own index.d.ts, and applying this conversion on top put the midday
 * sun at 88 degrees instead of 180. Kept exported and tested because the
 * conversion itself is the thing that is easy to get backwards, and because a
 * different suncalc build would need it.
 */
export function toCompassAzimuth(radiansFromSouth: number): number {
  return ((radiansFromSouth * RAD_TO_DEG + 180) % 360 + 360) % 360
}

/** Normalise any degree value into [0, 360). */
export function normalizeBearing(degrees: number): number {
  return ((degrees % 360) + 360) % 360
}

/**
 * All solar math is delegated to suncalc. The only work done here is
 * normalising to compass bearings and deriving the shadow direction.
 * Guarded by the solar-noon sanity check in sun.test.ts: in the northern
 * hemisphere, midday azimuth must land near 180.
 */
export function getSunPosition(date: Date, lat: number, lon: number): SunPosition {
  const { azimuth, altitude } = getPosition(date, lat, lon)
  const compass = normalizeBearing(azimuth)
  return {
    azimuth: compass,
    altitude,
    shadowBearing: normalizeBearing(compass + 180),
  }
}

export interface SunEvent {
  at: Date
  /** Compass bearing of the sun at that moment. */
  azimuth: number
}

export interface SunArc {
  /** Null at latitudes and dates where the sun does not rise or set. */
  sunrise: SunEvent | null
  sunset: SunEvent | null
}

/**
 * Sunrise and sunset, and the compass bearing of the sun at each.
 *
 * Still no solar math here. suncalc supplies the times, and getSunPosition above
 * supplies the bearing at those times. This exists so the map overlay has one
 * source for all four of its lines.
 */
export function getSunArc(date: Date, lat: number, lon: number): SunArc {
  const times = getTimes(date, lat, lon)
  const event = (at: Date | null): SunEvent | null =>
    at === null || Number.isNaN(at.getTime())
      ? null
      : { at, azimuth: getSunPosition(at, lat, lon).azimuth }

  return { sunrise: event(times.sunrise), sunset: event(times.sunset) }
}
