/*
 * SKY CAMS: "LOOK WEST NOW" (Batch J, Section 7). The nearest public cams
 * that look toward the sun's line at the next sunrise or sunset, with their
 * direction and distance from you. LINK OUT ONLY: nothing is fetched from a
 * cam, no frame, no image; the row is a link to the operator's own page
 * (tests/camsLinkOnly.test.ts holds that).
 *
 * Which way a cam looks is the baked list's `facing` (src/data/coastCams.ts:
 * the sea's direction from a beach cam). A cam with no facing is not said to
 * look anywhere, so it is not offered here.
 */
import { getPosition } from 'suncalc'
import { compassPoint } from './field.ts'
import { angleApart } from './coastFacing.ts'
import { bearingBetween, distanceMeters, type LatLon } from './geo.ts'

/** A cam looks toward the sun when its facing is within this of the sun's azimuth. */
export const FACES_SUN_DEG = 60
export const SKY_CAMS_KM = 80
export const SKY_CAMS_SHOWN = 2

export interface FacingCam {
  id: string
  name: string
  operator: string
  at: LatLon
  facing: number | null
  url: string
  access: 'free' | 'paid'
}

export interface SkyCam {
  cam: FacingCam
  km: number
  /** Where the cam is from you: "4 km N". */
  where: string
}

export function camsTowardSun(venue: LatLon, sunAzimuthDeg: number, cams: readonly FacingCam[], n = SKY_CAMS_SHOWN): SkyCam[] {
  const seen = new Set<string>()
  return cams
    .filter((c) => c.facing !== null && angleApart(c.facing, sunAzimuthDeg) <= FACES_SUN_DEG)
    .map((cam) => ({ cam, km: distanceMeters(venue, cam.at) / 1000 }))
    .filter((x) => x.km <= SKY_CAMS_KM)
    .sort((a, b) => a.km - b.km)
    .filter((x) => {
      /* One per page, and one per place: two pages named for one pier read as one. */
      const name = x.cam.name.split(/[,(]/)[0].trim()
      if (seen.has(x.cam.url) || seen.has(name)) return false
      seen.add(x.cam.url)
      seen.add(name)
      return true
    })
    .slice(0, n)
    .map((x) => ({ ...x, where: x.km < 1 ? 'here' : `${Math.round(x.km)} km ${compassPoint(bearingBetween(venue, x.cam.at))}` }))
}

/** "Look WSW now". */
export const lookWords = (sunAzimuthDeg: number): string => `Look ${compassPoint(sunAzimuthDeg)} now`

/** The cams for one sunrise or sunset: toward the sun's azimuth at that moment. */
export function camsForEvent(venue: LatLon, event: Date, cams: readonly FacingCam[]): { look: string; cams: SkyCam[] } {
  const az = getPosition(event, venue.lat, venue.lon).azimuth
  return { look: lookWords(az), cams: camsTowardSun(venue, az, cams) }
}
