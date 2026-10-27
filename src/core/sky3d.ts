/*
 * THE 3D VIEW'S LIGHT AND SKY, FROM THIS APP'S OWN SUN AND MOON.
 *
 * The 3D engine has a sun of its own. It is not used for anything that
 * means something: the light that shades the ground and casts the shadows
 * points along the direction suncalc gives (src/core/sun.ts), the same sun
 * the 2D shadows, rays and time bar use, and the arcs drawn in the sky are
 * suncalc's too. Two suns would be two sources for one fact.
 *
 * Directions are East-North-Up at the venue: x east, y north, z up.
 */
import { getMoonPosition } from 'suncalc'
import { getSunPosition, normalizeBearing } from './sun.ts'

const DEG = Math.PI / 180

/** A unit vector toward a compass azimuth and an altitude, East-North-Up. */
export function enuToward(azimuthDeg: number, altitudeDeg: number): [number, number, number] {
  const az = azimuthDeg * DEG
  const alt = altitudeDeg * DEG
  return [Math.sin(az) * Math.cos(alt), Math.cos(az) * Math.cos(alt), Math.sin(alt)]
}

/*
 * THE BASE LIGHT. The scene is always lit at the day's strength, whatever
 * the sun is doing, and the sun only decides the shadows. The light used to
 * drop to 0.25 once the sun was down, and the engine multiplies the ground's
 * photograph by the light's colour, so at Virginia Beach at 7:11 AM on 27 Oct
 * (sun below the horizon) the view was pitch dark: 13.2 against noon's 45.7
 * in mean luminance. The time of day is read from the sky arcs, the time bar
 * and the shadows, never from a picture too dark to read.
 */
export const CLAY_LIGHT_INTENSITY = 2.2

/** What the 3D view is lit with at a sun altitude: the base light always, shadows only while the sun is up. */
export function clayLight(sunAltitudeDeg: number): { intensity: number; shadows: boolean } {
  return { intensity: CLAY_LIGHT_INTENSITY, shadows: sunAltitudeDeg > 0 }
}

/** The direction the sunlight TRAVELS, East-North-Up: from the sun, toward the ground. */
export function sunlightEnu(at: Date, lat: number, lon: number): [number, number, number] {
  const sun = getSunPosition(at, lat, lon)
  const [e, n, u] = enuToward(sun.azimuth, sun.altitude)
  return [-e, -n, -u]
}

export interface ArcSample {
  at: Date
  azimuth: number
  altitude: number
}

export interface SkyArc {
  body: 'sun' | 'moon'
  /** Every ten minutes the body is above the horizon on the day. */
  path: ArcSample[]
  /** On the hour, for the dots and the time pills. */
  hours: ArcSample[]
}

const MINUTE = 60_000

/* suncalc 2.0.2 already answers in compass degrees, as moonArc.ts reads it. */
function moonAt(at: Date, lat: number, lon: number): ArcSample {
  const m = getMoonPosition(at, lat, lon)
  return { at, azimuth: normalizeBearing(m.azimuth), altitude: m.altitude }
}

function sunAt(at: Date, lat: number, lon: number): ArcSample {
  const s = getSunPosition(at, lat, lon)
  return { at, azimuth: s.azimuth, altitude: s.altitude }
}

/**
 * A body's arc across the 24 hours from `dayStart`, above the horizon only,
 * split where it sets so no line is drawn through the ground.
 */
export function skyArc(body: 'sun' | 'moon', dayStart: Date, lat: number, lon: number): SkyArc[] {
  const sample = body === 'sun' ? sunAt : moonAt
  const arcs: SkyArc[] = []
  let current: SkyArc | null = null
  for (let m = 0; m <= 24 * 60; m += 10) {
    const s = sample(new Date(dayStart.getTime() + m * MINUTE), lat, lon)
    if (s.altitude < 0) {
      current = null
      continue
    }
    if (current === null) {
      current = { body, path: [], hours: [] }
      arcs.push(current)
    }
    current.path.push(s)
    /* On the hour of the venue clock: dayStart is local midnight. */
    if (m % 60 === 0) current.hours.push(s)
  }
  return arcs
}

/** A point on the sky dome of radius r metres, East-North-Up from the venue. */
export function domePoint(s: { azimuth: number; altitude: number }, radius: number): [number, number, number] {
  const [e, n, u] = enuToward(s.azimuth, s.altitude)
  return [e * radius, n * radius, u * radius]
}
