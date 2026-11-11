/*
 * WHICH WAY THE BEACH FACES, AND WHAT THE WIND IS DOING TO THE WATER.
 *
 * The beach faces the sea: the bearing from the venue out to open water.
 * Worked out two independent ways from where the sea is (the map tiles'
 * ocean polygons, src/lib/coast.ts), and a test fails if they disagree past
 * FACING_AGREE_DEG:
 *
 *   byCircle      look at points on a circle CIRCLE_M around the venue,
 *                 every CIRCLE_STEP_DEG; the facing is the mean direction of
 *                 the ones in the sea (a vector sum, so 350 and 10 make 0).
 *   byNearest     walk out along every bearing until the sea; the facing is
 *                 the bearing that reaches it soonest (ties averaged).
 *
 * The wind is offshore when it blows from the land out to sea: it comes FROM
 * the side opposite the facing. Glassy is light wind, or wind offshore.
 */
import { destinationPoint, type LatLon } from './geo.ts'

export const CIRCLE_M = 1500
export const CIRCLE_STEP_DEG = 2
export const WALK_STEP_M = 50
export const FACING_AGREE_DEG = 35
/** Light enough to leave the water glassy whatever its direction: 5 knots. */
export const GLASSY_MPS = 2.6

export type SeaAt = (at: LatLon) => boolean

/*
 * THE OCEAN SIDE OF A BARRIER ISLAND (Batch Beach, Section 1; Rodanthe, 10
 * Nov: the pin sat on the Pamlico Sound side, the beach "faced" west, the
 * east swell was blocked, a SW wind read cross-shore and the tide was the
 * sound's). The map's ocean polygons are cut from the coastline, so a sound
 * or a bay is "ocean" too. A facing is OPEN when the sea goes on along it:
 * every point OPEN_SEA_KM out is sea. A facing that is not open is a sound,
 * a bay or a lagoon; across the island, within ISLAND_CROSS_M, the open
 * ocean is the beach.
 */
export const OPEN_SEA_KM = [20, 60, 120] as const
export const ISLAND_CROSS_M = 3000
const SIDE_TRIES = [0, -15, 15, -30, 30, -45, 45] as const

export const opensOnSea = (venue: LatLon, facing: number, farSea: SeaAt): boolean => OPEN_SEA_KM.every((km) => farSea(destinationPoint(venue, facing, km * 1000)))

/** The ocean beach across the island from a venue whose facing is not open: the last land point before the open sea, and the bearing walked. Null with no open sea within ISLAND_CROSS_M. */
export function oceanSide(venue: LatLon, facing: number, nearSea: SeaAt, farSea: SeaAt): { beachAt: LatLon; bearing: number } | null {
  let best: { beachAt: LatLon; bearing: number; m: number } | null = null
  for (const d of SIDE_TRIES) {
    const b = norm(facing + 180 + d)
    if (!opensOnSea(venue, b, farSea)) continue
    /* Off the water first (a pin in the sound), then on to the next water: the ocean. */
    let land = !nearSea(venue)
    let last = venue
    for (let m = WALK_STEP_M; m <= ISLAND_CROSS_M; m += WALK_STEP_M) {
      const p = destinationPoint(venue, b, m)
      const wet = nearSea(p)
      if (!land) {
        if (!wet) land = true
      } else if (wet) {
        if (best === null || m < best.m) best = { beachAt: last, bearing: b, m }
        break
      }
      if (!wet) last = p
    }
  }
  return best === null ? null : { beachAt: best.beachAt, bearing: best.bearing }
}

const norm = (d: number) => ((d % 360) + 360) % 360
export const angleApart = (a: number, b: number): number => {
  const d = Math.abs(norm(a) - norm(b))
  return Math.min(d, 360 - d)
}

function meanBearing(bearings: number[]): number | null {
  let x = 0
  let y = 0
  for (const b of bearings) {
    x += Math.sin((b * Math.PI) / 180)
    y += Math.cos((b * Math.PI) / 180)
  }
  if (Math.hypot(x, y) < 1e-9) return null
  return norm((Math.atan2(x, y) * 180) / Math.PI)
}

/** Null when no sea is in reach, or the sea is all around (a pier end, an island): no single facing. */
export function facingByCircle(venue: LatLon, sea: SeaAt): number | null {
  const wet: number[] = []
  for (let b = 0; b < 360; b += CIRCLE_STEP_DEG) if (sea(destinationPoint(venue, b, CIRCLE_M))) wet.push(b)
  if (wet.length === 0 || wet.length * CIRCLE_STEP_DEG >= 330) return null
  return meanBearing(wet)
}

export function facingByNearest(venue: LatLon, sea: SeaAt): number | null {
  let best = Infinity
  let at: number[] = []
  for (let b = 0; b < 360; b += CIRCLE_STEP_DEG) {
    for (let m = WALK_STEP_M; m <= CIRCLE_M && m <= best; m += WALK_STEP_M) {
      if (!sea(destinationPoint(venue, b, m))) continue
      if (m < best) {
        best = m
        at = [b]
      } else at.push(b)
      break
    }
  }
  return at.length === 0 ? null : meanBearing(at)
}

export type WindToBeach = 'offshore' | 'cross' | 'onshore'

/** `windFrom` is where the wind comes FROM, as forecasts give it. */
export function windToBeach(windFrom: number, facing: number): WindToBeach {
  const d = angleApart(windFrom, facing)
  if (d <= 45) return 'onshore'
  if (d >= 135) return 'offshore'
  return 'cross'
}

export const isGlassy = (speedMps: number, relation: WindToBeach | null): boolean => speedMps < GLASSY_MPS || relation === 'offshore'
