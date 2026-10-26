/*
 * THE HERO WIDE PUSH: A VENUE-WIDE AERIAL, WORKED OUT, NOT ASKED FOR.
 *
 * WHY THIS IS NOT ONE MORE SUGGEST RING. Suggest's drone spots frame the
 * subject: a 24 mm drone camera fills its frame with a 20 m subject from about
 * 20 m away, which at a 30 degree look-down is 35 ft up. That is a real shot,
 * and it is not the one flown at Atlantic Park. The hero is the opposite: as
 * high as the shooter may fly, far enough out that the subject sits low in a
 * wide frame, pushing in at golden hour with the city behind it.
 *
 *   FACING. For every camera bearing, the mapped buildings beyond the subject
 *   and inside the widest drone lens's field are weighed by how much of the
 *   frame they take: footprint width times height over distance squared, the
 *   solid angle near enough. The bearing with the most built skyline behind
 *   the subject is the facing. Only mapped heights count; where OSM gave none
 *   at all, footprint area stands in and that is said. With no buildings
 *   mapped there is no backdrop to face, and the answer is that, not a guess.
 *
 *   HEIGHT. The lower of 400 ft (Part 107's altitude limit) and, wherever the
 *   push crosses controlled airspace, the ceiling the caller gives: the lower
 *   of the facility map's grid and the shooter's own approved ceiling. Checked
 *   at every sample along the push, because the grid changes square by square.
 *
 *   DISTANCE. The push starts where the subject is START_DEPRESSION_DEGREES
 *   below the drone, low in frame with the skyline over it, and ends at
 *   END_DEPRESSION_DEGREES.
 *
 * NOTHING HERE SAYS A FLIGHT MAY HAPPEN. Parks and restricted areas drop a
 * bearing; controlled airspace without the LAANC switch drops it. What is left
 * is arithmetic over what the app holds, and the card still ends with today's
 * flight restrictions.
 */
import { computeFOV, type SensorSize } from './fov.ts'
import { bearingBetween, destinationPoint, distanceMeters, type LatLon, type Position } from './geo.ts'
import { classifyLighting, classificationOf, type Classification } from './lighting.ts'
import { airspaceAt, type AirspaceShape } from './airspaceLookup.ts'
import { floorReaches, insideShape, type ParkUnit, type SpecialUseArea } from './restrictions.ts'
import { MAX_ALTITUDE_FEET } from './air.ts'
import type { SunPosition } from './sun.ts'
import type { Footprint } from './suggest.ts'

export const START_DEPRESSION_DEGREES = 15
export const END_DEPRESSION_DEGREES = 35
/** Buildings nearer than this are the subject's own surroundings, not the skyline. */
export const BACKDROP_MIN_METERS = 60
export const BACKDROP_MAX_METERS = 3000
export const HERO_BEARING_STEP_DEGREES = 5
/** Below this the hero is no longer a wide push; Suggest's framed spots cover it. */
export const MIN_HERO_ALTITUDE_FEET = 100
const PUSH_SAMPLES = 12
const FT = 0.3048
const DEG = Math.PI / 180

export interface HeroOptic {
  id: string
  name: string
  focalLength: number
  sensor: SensorSize
}

export interface HeroInput {
  subject: LatLon
  /** The drone cameras in the bag; the widest is used. */
  optics: readonly HeroOptic[]
  /** The sun at golden hour on the shoot date, or null when it has none. */
  sun: SunPosition | null
  footprints: readonly Footprint[]
  airspace: readonly AirspaceShape[]
  specialUse: readonly SpecialUseArea[]
  parks: readonly ParkUnit[]
  /** The switch, and the ceiling to fly under in controlled airspace: lower of grid and approved. */
  laanc: { enabled: boolean; ceilingAt: (at: LatLon) => number | null }
}

export interface AerialHero {
  start: LatLon
  end: LatLon
  /** FROM the start TO the subject, which is FROM the subject TO the skyline. */
  cameraBearing: number
  altitudeFeet: number
  /** Ground distance from the subject to the start. */
  startMeters: number
  pushMeters: number
  /** The controlled-airspace ceiling the height is held under, when one applies. */
  ceilingFeet: number | null
  opticId: string
  opticName: string
  focalLength: number
  /** How the skyline was weighed: by mapped heights, or by footprint area where no height was mapped. */
  backdropBy: 'height' | 'footprint'
  /** Buildings in frame behind the subject at the facing. */
  backdropCount: number
  light: Classification | null
}

export type HeroResult = { status: 'ok'; hero: AerialHero } | { status: 'none'; reason: string }

interface Weighed {
  bearing: number
  distance: number
  width: number
  height: number | null
  area: number
}

function ringArea(ring: readonly Position[], at: LatLon): number {
  const kx = 111_320 * Math.cos(at.lat * DEG)
  const ky = 110_540
  let sum = 0
  for (let i = 0; i < ring.length - 1; i++) {
    sum += ring[i][0] * kx * ring[i + 1][1] * ky - ring[i + 1][0] * kx * ring[i][1] * ky
  }
  return Math.abs(sum) / 2
}

function centroid(ring: readonly Position[]): LatLon {
  let lon = 0
  let lat = 0
  for (const p of ring) {
    lon += p[0]
    lat += p[1]
  }
  return { lat: lat / ring.length, lon: lon / ring.length }
}

const angleOff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)

/** The highest the whole push may fly, or a reason it may not. */
function pushCeiling(input: HeroInput, path: LatLon[]): { feet: number; ceiling: number | null } | { reason: string } {
  let feet = MAX_ALTITUDE_FEET
  let ceiling: number | null = null
  for (const at of path) {
    if (input.parks.some((park) => insideShape(park, at))) return { reason: 'a national park unit' }
    if (airspaceAt(input.airspace, at).length > 0) {
      if (!input.laanc.enabled) return { reason: 'controlled airspace, and the LAANC switch is off' }
      const here = input.laanc.ceilingAt(at)
      if (here === null || here <= 0) return { reason: 'controlled airspace with no grid ceiling above 0 ft' }
      ceiling = ceiling === null ? here : Math.min(ceiling, here)
      feet = Math.min(feet, here)
    }
  }
  return { feet: Math.floor(feet / 5) * 5, ceiling }
}

export function aerialHero(input: HeroInput): HeroResult {
  const optic = [...input.optics].sort((a, b) => a.focalLength - b.focalLength)[0]
  if (optic === undefined) return { status: 'none', reason: 'No drone is in the bag.' }
  const half = computeFOV(optic.focalLength, optic.sensor).hFOV / 2

  const weighed: Weighed[] = input.footprints.flatMap((f) => {
    if (f.ring.length < 4) return []
    const c = centroid(f.ring)
    const distance = distanceMeters(input.subject, c)
    if (distance < BACKDROP_MIN_METERS || distance > BACKDROP_MAX_METERS) return []
    const area = ringArea(f.ring, c)
    return [{ bearing: bearingBetween(input.subject, c), distance, width: Math.sqrt(area), height: f.heightMeters, area }]
  })
  if (weighed.length === 0) {
    return { status: 'none', reason: `No mapped buildings between ${BACKDROP_MIN_METERS} m and ${BACKDROP_MAX_METERS / 1000} km of the subject, so there is no skyline to put behind it. Unmapped is not empty.` }
  }
  const backdropBy: AerialHero['backdropBy'] = weighed.some((w) => w.height !== null) ? 'height' : 'footprint'
  const weight = (w: Weighed) =>
    backdropBy === 'height' ? (w.height === null ? 0 : (w.width * w.height) / w.distance ** 2) : w.area / w.distance ** 2

  type Option = { hero: AerialHero; weight: number; centreOff: number }
  const options: Option[] = []
  const refused = new Map<string, number>()
  for (let facing = 0; facing < 360; facing += HERO_BEARING_STEP_DEGREES) {
    const inFrame = weighed.filter((w) => angleOff(w.bearing, facing) <= half)
    const total = inFrame.reduce((sum, w) => sum + weight(w), 0)
    if (total <= 0) continue
    /* How far the skyline's weighted middle sits from the frame's centre. */
    const sx = inFrame.reduce((sum, w) => sum + weight(w) * Math.sin(w.bearing * DEG), 0)
    const cy = inFrame.reduce((sum, w) => sum + weight(w) * Math.cos(w.bearing * DEG), 0)
    const centreOff = angleOff(Math.atan2(sx, cy) / DEG, facing)

    /* The height sets the distance and the distance sets which squares the push crosses: settle it in a few passes. */
    let feet = MAX_ALTITUDE_FEET
    let fit: ReturnType<typeof pushCeiling> | null = null
    let path: LatLon[] = []
    for (let pass = 0; pass < 6; pass++) {
      const startMeters = (feet * FT) / Math.tan(START_DEPRESSION_DEGREES * DEG)
      const endMeters = (feet * FT) / Math.tan(END_DEPRESSION_DEGREES * DEG)
      path = Array.from({ length: PUSH_SAMPLES + 1 }, (_, i) =>
        destinationPoint(input.subject, facing + 180, startMeters + ((endMeters - startMeters) * i) / PUSH_SAMPLES),
      )
      fit = pushCeiling(input, path)
      if ('reason' in fit || fit.feet >= feet) break
      feet = fit.feet
    }
    if (fit !== null && !('reason' in fit) && fit.feet < feet) fit = { reason: 'a grid ceiling that did not settle along the push' }
    if (fit === null || 'reason' in fit) {
      const why = fit === null ? 'unknown' : fit.reason
      refused.set(why, (refused.get(why) ?? 0) + 1)
      continue
    }
    if (feet < MIN_HERO_ALTITUDE_FEET) {
      const why = `a ceiling under ${MIN_HERO_ALTITUDE_FEET} ft`
      refused.set(why, (refused.get(why) ?? 0) + 1)
      continue
    }
    const restricted = input.specialUse.some((area) => path.some((at) => insideShape(area, at)) && floorReaches(area, feet) !== 'above')
    if (restricted) {
      refused.set('a restricted or prohibited area', (refused.get('a restricted or prohibited area') ?? 0) + 1)
      continue
    }

    const start = path[0]
    const end = path[path.length - 1]
    const cameraBearing = bearingBetween(start, input.subject)
    const light =
      input.sun === null || input.sun.altitude <= -1
        ? null
        : classificationOf(classifyLighting({ shotType: 'framed', positionBearing: bearingBetween(input.subject, start), cameraBearing }, input.sun))
    options.push({
      weight: total,
      centreOff,
      hero: {
        start,
        end,
        cameraBearing,
        altitudeFeet: feet,
        startMeters: distanceMeters(input.subject, start),
        pushMeters: distanceMeters(start, end),
        ceilingFeet: fit.ceiling,
        opticId: optic.id,
        opticName: optic.name,
        focalLength: optic.focalLength,
        backdropBy,
        backdropCount: inFrame.filter((w) => weight(w) > 0).length,
        light,
      },
    })
  }

  if (options.length === 0) {
    const why = [...refused.entries()].sort((a, b) => b[1] - a[1]).map(([r]) => r)
    return { status: 'none', reason: `Every facing with a skyline behind the subject crosses ${why.join(', or ') || 'nothing the app can fly'}.` }
  }
  /*
   * Most skyline wins. A wide lens sees the same towers from many facings, so a
   * near tie (within 5 percent) goes to the higher flight, then to the facing
   * that puts the skyline straight behind the subject, then to the light.
   */
  const lightRank = (l: Classification | null) => (l === 'side-lit' ? 3 : l === 'backlit' ? 2 : l === 'front-lit' ? 1 : 0)
  const best = Math.max(...options.map((o) => o.weight))
  const near = options.filter((o) => o.weight >= best * 0.95)
  near.sort((a, b) => b.hero.altitudeFeet - a.hero.altitudeFeet || a.centreOff - b.centreOff || lightRank(b.hero.light) - lightRank(a.hero.light) || b.weight - a.weight)
  return { status: 'ok', hero: near[0].hero }
}
