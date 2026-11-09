/*
 * SKY CAMS: "LOOK WEST NOW" (Batch J, Section 7; tightened Batch M, Section 4).
 * The nearest public cams that look toward the sun's line at the next sunrise
 * or sunset, with their direction and distance from you. LINK OUT ONLY:
 * nothing is fetched from a cam, no frame, no image; the row is a link to the
 * operator's own page (tests/camsLinkOnly.test.ts holds that).
 *
 * ONE RULE, HERE, for every row that offers a cam toward the sun or the
 * water: the cam's recorded facing is within CAM_FACING_DEG of the line, and
 * the cam is within CAM_MAX_KM of the venue. Nothing passes, no row.
 *
 * WHAT COUNTS AS A RECORDED FACING. A beach cam's `facing` is the sea's
 * direction from its beach (src/data/coastCams.ts): where a beach cam looks.
 * A VDOT cam's direction is the LANES it watches (WB, EB), not where its lens
 * points (`facingIs: 'lanes'`, src/data/vdotCams.ts). On 8 Nov "Look WSW now"
 * offered I-264 cams labelled WB, 9 to 15 km inland, that looked the wrong
 * way. A lane label is an unknown facing, and an unknown facing is never
 * offered.
 */
import { getPosition } from 'suncalc'
import { compassPoint } from './field.ts'
import { angleApart } from './coastFacing.ts'
import { bearingBetween, distanceMeters, type LatLon } from './geo.ts'

/** A cam further than this shows someone else's sky: 15 km. */
export const CAM_MAX_KM = 15
/** A cam looks along a line when its recorded facing is within this of it: 45° either side. */
export const CAM_FACING_DEG = 45
export const SKY_CAMS_SHOWN = 2

export interface FacingCam {
  id: string
  name: string
  operator: string
  at: LatLon
  facing: number | null
  /** 'lanes': `facing` is the traffic direction a road cam watches, not where it looks. */
  facingIs?: 'lanes'
  url: string
  access: 'free' | 'paid'
}

export interface SkyCam {
  cam: FacingCam
  km: number
  /** Where the cam is from you: "4 km N". */
  where: string
}

/** Where the cam's lens looks, when that is recorded; null otherwise. */
export const lensFacing = (cam: FacingCam): number | null => (cam.facingIs === 'lanes' ? null : cam.facing)

/** The nearest cams within CAM_MAX_KM whose recorded facing is within CAM_FACING_DEG of any of `lines`. */
function camsAlong(venue: LatLon, lines: readonly number[], cams: readonly FacingCam[], n: number): SkyCam[] {
  const seen = new Set<string>()
  return cams
    .filter((c) => {
      const f = lensFacing(c)
      return f !== null && lines.some((line) => angleApart(f, line) <= CAM_FACING_DEG)
    })
    .map((cam) => ({ cam, km: distanceMeters(venue, cam.at) / 1000 }))
    .filter((x) => x.km <= CAM_MAX_KM)
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

/** "Look toward the sun": cams facing within CAM_FACING_DEG of the sun's azimuth, within CAM_MAX_KM. Empty means no row. */
export function camsTowardSun(venue: LatLon, sunAzDeg: number, cams: readonly FacingCam[], n = SKY_CAMS_SHOWN): SkyCam[] {
  return camsAlong(venue, [sunAzDeg], cams, n)
}

/**
 * The home's "Cams" row: real cams within CAM_MAX_KM that face the water or
 * the sun line, that is, a recorded facing within CAM_FACING_DEG of the sun's
 * azimuth or of the beach's seaward facing (src/core/coastFacing.ts; null when
 * the venue has none). Unknown facing is excluded. Empty means no row.
 */
export function camsFacingWaterOrSun(venue: LatLon, sunAzDeg: number | null, seaFacingDeg: number | null, cams: readonly FacingCam[], n = SKY_CAMS_SHOWN): SkyCam[] {
  const lines = [sunAzDeg, seaFacingDeg].filter((d): d is number => d !== null)
  return lines.length === 0 ? [] : camsAlong(venue, lines, cams, n)
}

/** "Look WSW now". */
export const lookWords = (sunAzimuthDeg: number): string => `Look ${compassPoint(sunAzimuthDeg)} now`

/** The cams for one sunrise or sunset: toward the sun's azimuth at that moment. */
export function camsForEvent(venue: LatLon, event: Date, cams: readonly FacingCam[]): { look: string; cams: SkyCam[] } {
  const az = getPosition(event, venue.lat, venue.lon).azimuth
  return { look: lookWords(az), cams: camsTowardSun(venue, az, cams) }
}

/*
 * THE CAMS SHEET (Batch N A4): "Cams near <spot>", with chips.
 *   all      every cam within CAM_MAX_KM, nearest first
 *   surf     a recorded lens facing within CAM_FACING_DEG of the beach's seaward facing
 *   sunset   a recorded lens facing within CAM_FACING_DEG of the sunset's azimuth;
 *            unknown facing (VDOT's lanes) never
 *   roads    the road cams (VDOT), whose facing is the lanes', under Roads and All only
 */
export type CamChip = 'all' | 'surf' | 'sunset' | 'roads'
export function camsNear(venue: LatLon, chip: CamChip, cams: readonly FacingCam[], sunsetAzDeg: number | null, seaFacingDeg: number | null): SkyCam[] {
  const MANY = 40
  if (chip === 'surf') return seaFacingDeg === null ? [] : camsAlong(venue, [seaFacingDeg], cams.filter((c) => c.facingIs !== 'lanes'), MANY)
  if (chip === 'sunset') return sunsetAzDeg === null ? [] : camsAlong(venue, [sunsetAzDeg], cams, MANY)
  const pool = chip === 'roads' ? cams.filter((c) => c.facingIs === 'lanes') : cams
  return pool
    .map((cam) => ({ cam, km: distanceMeters(venue, cam.at) / 1000 }))
    .filter((x) => x.km <= CAM_MAX_KM)
    .sort((a, b) => a.km - b.km)
    .slice(0, MANY)
    .map((x) => ({ ...x, where: x.km < 1 ? 'here' : `${Math.round(x.km)} km ${compassPoint(bearingBetween(venue, x.cam.at))}` }))
}
