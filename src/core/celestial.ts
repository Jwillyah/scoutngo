/*
 * WHERE A FIXED POINT ON THE SKY IS, FROM HERE, RIGHT NOW.
 *
 * Pure arithmetic. No React, no fetch, no model. A radiant and the galactic
 * core do not move against the stars on any timescale this app cares about, so
 * their positions are constants and everything else is rotation.
 *
 * WHAT THIS IS FOR. A meteor shower is only worth driving to when its radiant
 * is actually up, the sky is actually dark, and the moon is actually down.
 * Those are three independent facts and all three are arithmetic. The app has
 * no business asking a model for any of them, and does not.
 *
 * ACCURACY, MEASURED RATHER THAN CLAIMED. Checked against four JPL Horizons
 * apparent positions spanning four latitudes from -34 to +70 degrees; the
 * worst disagreement is 0.0024 degrees, 8.5 arcseconds. The run that
 * produced those residuals wrote them to
 * measurements/2026-10-18-celestial-vs-horizons.md and the four reference
 * values are literals in celestial.test.ts.
 *
 * WHY IT IS NOT EXACT, AND WHY THAT IS FINE. This uses MEAN sidereal time and
 * ignores nutation, so it is off by the equation of the equinoxes, which
 * reaches about 1.1 seconds of time -- the 8.5 arcseconds above. The question
 * this file exists to answer is whether a radiant clears a ridge, and a ridge
 * edge is not knowable to a tenth of a degree from a 30 m DEM. Adding nutation
 * would buy precision the inputs cannot support. It is NOT ignored silently:
 * it is the measured residual, it is pinned by a test, and a future need for
 * arcsecond work starts by reading this paragraph.
 */

const DEG = Math.PI / 180

/** Days from the Unix epoch to the Julian epoch. */
const JD_UNIX_EPOCH = 2440587.5

/** The Julian Day number for an instant. */
export function julianDay(date: Date): number {
  return date.getTime() / 86_400_000 + JD_UNIX_EPOCH
}

/**
 * Greenwich mean sidereal time, in degrees.
 *
 * Meeus, Astronomical Algorithms, 2nd edition, formula 12.4, which gives GMST
 * directly from the Julian Day without going through a separate 0h UT term.
 */
export function greenwichMeanSiderealTime(date: Date): number {
  const jd = julianDay(date)
  const d = jd - 2451545
  const t = d / 36525
  const degrees =
    280.46061837 + 360.98564736629 * d + 0.000387933 * t * t - (t * t * t) / 38_710_000
  return ((degrees % 360) + 360) % 360
}

/**
 * Local mean sidereal time, in degrees, EAST longitude positive.
 *
 * East positive matches every other longitude in this codebase and matches
 * GeoJSON. Meeus writes his own formulae with west positive, so a sign flip
 * here against the book is correct rather than a bug.
 */
export function localSiderealTime(date: Date, longitude: number): number {
  const degrees = greenwichMeanSiderealTime(date) + longitude
  return ((degrees % 360) + 360) % 360
}

/** Degrees above the horizon, and degrees clockwise from true north. */
export interface Horizontal {
  /** Positive is above the horizon. Negative is a real answer, not an error. */
  altitude: number
  /** 0 is north, 90 is east. Clockwise, matching every bearing in this app. */
  azimuth: number
}

/**
 * Equatorial to horizontal: the standard rotation.
 *
 *   H   = local sidereal time - right ascension
 *   sin(altitude) = sin(lat) sin(dec) + cos(lat) cos(dec) cos(H)
 *   azimuth       = atan2( sin H, cos H sin(lat) - tan(dec) cos(lat) )
 *
 * AZIMUTH IS FROM NORTH, NOT FROM SOUTH. The atan2 above is Meeus's, which
 * measures from south, so 180 is added. Every other bearing in this app is
 * clockwise from north -- compass bearings, sun azimuth, radiant direction on
 * the map -- and a single function quietly using the other convention is how a
 * ray gets drawn at the wrong end of the sky.
 *
 * NO REFRACTION. The altitude returned is geometric. Refraction lifts a body
 * near the horizon by about half a degree, which matters for a sunset time and
 * does not matter for "is the radiant usefully high", where the app's own
 * threshold is tens of degrees. Adding half a degree of lift to a radiant
 * rising behind a ridge would be precision theatre.
 */
export function equatorialToHorizontal(
  raDegrees: number,
  decDegrees: number,
  latitude: number,
  longitude: number,
  date: Date,
): Horizontal {
  const hourAngle = (localSiderealTime(date, longitude) - raDegrees) * DEG
  const lat = latitude * DEG
  const dec = decDegrees * DEG

  const altitude = Math.asin(
    Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(hourAngle),
  )
  const fromSouth = Math.atan2(
    Math.sin(hourAngle),
    Math.cos(hourAngle) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat),
  )

  return {
    altitude: altitude / DEG,
    azimuth: (((fromSouth / DEG + 180) % 360) + 360) % 360,
  }
}

/**
 * Sagittarius A*, the galactic centre.
 *
 * J2000: RA 17h45m40.0s = 266.4167 degrees, Dec -29d00m28s = -29.0078 degrees.
 *
 * THIS SAID -28.9408, an arithmetic slip: -(29 + 0/60 + 28/3600) is -29.0078.
 * Fifteen hundredths of a degree, which moved nothing a shooter could see,
 * but it was a number nobody could check against its own comment. The test
 * now derives it from the sexagesimal figures instead of restating it.
 *
 * Rounded to the figures the shoot actually uses. The bright part of the Milky
 * Way that a photographer frames is a region many degrees across, so a tenth
 * of a degree on its centre is far below the thing being pointed at.
 */
export const GALACTIC_CORE = { ra: 266.42, dec: -29.008 } as const

export type ShowerId =
  | 'quadrantids'
  | 'lyrids'
  | 'eta-aquariids'
  | 'perseids'
  | 'orionids'
  | 'leonids'
  | 'geminids'
  | 'ursids'

export interface Shower {
  id: ShowerId
  name: string
  /** 1-12. */
  peakMonth: number
  /** Day of that month. */
  peakDay: number
  /** Zenithal hourly rate at maximum, under a perfect sky. See the note. */
  zhr: number
  /** Radiant position at maximum, J2000 degrees. */
  radiantRa: number
  radiantDec: number
}

/*
 * THE EIGHT, FROM THE IMO WORKING LIST OF VISUAL METEOR SHOWERS.
 *
 * Source: International Meteor Organization, 2025 Meteor Shower Calendar,
 * IMO INFO(3.1-24), edited by Jurgen Rendtel, Table 5 "Working List of Visual
 * Meteor Showers" and the per-shower entries in the text. Retrieved from the
 * Internet Archive copy of imo.net/files/meteor-shower/cal2025.pdf on
 * 2026-10-18, because imo.net itself is mid-rebuild and serves no PDFs.
 *
 * THE PEAK DATE IS NOT A PROMISE, AND THIS IS THE REASON THE APP SHOWS TWO
 * NIGHTS. A shower peaks at a solar longitude, not on a calendar date, so the
 * date drifts up to about a day from year to year as the calendar and the
 * orbit fall in and out of step; the IMO calendar itself states its maximum
 * dates are "accurate only for 2025". Several of these showers also have broad
 * or multi-peaked maxima measured in many hours. A single night printed
 * against a shower would be a precision this data does not have, so every
 * shower here is offered as the night before and the night of, and the app
 * says which it is showing.
 *
 * ZHR IS NOT WHAT ANYONE WILL SEE. It is the rate for a radiant at the zenith
 * under a sky with a limiting magnitude of 6.5. A real radiant is lower, a
 * real sky is brighter, and the honest use of this number is to rank showers
 * against each other, which is what it is used for here. Nothing in this app
 * converts it into meteors per hour for a shooter.
 */
export const SHOWERS: readonly Shower[] = [
  /* 010QUA. Max Jan 3 15h00m UT. ZHR 80, can vary 60-200. Radiant 230, +49. */
  { id: 'quadrantids', name: 'Quadrantids', peakMonth: 1, peakDay: 3, zhr: 80, radiantRa: 230, radiantDec: 49 },
  /* 006LYR. Max Apr 22 13h30m UT. ZHR 18, can be variable up to 90. */
  { id: 'lyrids', name: 'Lyrids', peakMonth: 4, peakDay: 22, zhr: 18, radiantRa: 271, radiantDec: 34 },
  /* 031ETA. Max May 6 03h UT. ZHR 50, variable 40-85. Radiant 338, -1. */
  { id: 'eta-aquariids', name: 'Eta Aquariids', peakMonth: 5, peakDay: 6, zhr: 50, radiantRa: 338, radiantDec: -1 },
  /* 007PER. Max Aug 12, solar longitude 140.0. ZHR 100. Radiant 48, +58. */
  { id: 'perseids', name: 'Perseids', peakMonth: 8, peakDay: 12, zhr: 100, radiantRa: 48, radiantDec: 58 },
  /* 008ORI. Max Oct 21, solar longitude 208. ZHR 20+. Radiant 95, +16. */
  { id: 'orionids', name: 'Orionids', peakMonth: 10, peakDay: 21, zhr: 20, radiantRa: 95, radiantDec: 16 },
  /* 013LEO. Max Nov 17 18h UT. ZHR 15. Radiant 152, +22. */
  { id: 'leonids', name: 'Leonids', peakMonth: 11, peakDay: 17, zhr: 15, radiantRa: 152, radiantDec: 22 },
  /* 004GEM. Max Dec 14 08h UT. ZHR 150. Radiant 112, +33. */
  { id: 'geminids', name: 'Geminids', peakMonth: 12, peakDay: 14, zhr: 150, radiantRa: 112, radiantDec: 33 },
  /* 015URS. Max Dec 22 10h UT. ZHR 10, occasionally variable up to 50. */
  { id: 'ursids', name: 'Ursids', peakMonth: 12, peakDay: 22, zhr: 10, radiantRa: 217, radiantDec: 76 },
] as const

/** The shower with this id, or null. */
export function showerById(id: ShowerId): Shower | null {
  return SHOWERS.find((s) => s.id === id) ?? null
}
