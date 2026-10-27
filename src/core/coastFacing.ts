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
