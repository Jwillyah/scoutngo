/*
 * RESTRICTED AND PROHIBITED AIRSPACE, AND NATIONAL PARK UNITS, AT A POINT.
 *
 * The data is baked by scripts/bake-restrictions.mjs from the FAA's Special Use
 * Airspace layer and the NPS unit boundaries (see docs/airspace-sources.md).
 * This file decodes it and answers two questions, on the device, with no
 * network: which of these contain a point, and whether an area's floor is low
 * enough to reach a drone flying at a given height.
 *
 * EVEN-ODD, NOT OUTLINE-AND-HOLES. A park unit is often several separate
 * pieces, and airspaceLookup.ts treats ring 0 as the outline and every other
 * ring as a hole, which would read the second piece of a park as a hole in the
 * first. Counting how many rings contain the point, and calling an odd count
 * inside, is right for both pieces and holes.
 *
 * WHAT THIS NEVER SAYS. That anywhere is open to fly. An empty answer is a
 * statement about this extract, which is generalised at its edges and knows
 * nothing about temporary restrictions. See airspaceCard.ts for the words.
 */
import type { LatLon } from './geo.ts'

export interface EncodedSpecialUse {
  type: string
  name: string
  floor: number | null
  floorUom: string
  floorRef: string
  ceiling: number | null
  ceilingUom: string
  agency: string
  times: string
  state: string
  bbox: number[]
  rings: string[]
}

export interface EncodedParkUnit {
  code: string
  name: string
  unitType: string
  state: string
  bbox: number[]
  rings: string[]
}

interface Decoded {
  /** Flat [lon, lat, lon, lat, ...] per ring, degrees. */
  rings: number[][]
  bbox: [number, number, number, number]
}

export type SpecialUseArea = Omit<EncodedSpecialUse, 'rings' | 'bbox' | 'type'> &
  Decoded & { type: 'R' | 'P' }
export type ParkUnit = Omit<EncodedParkUnit, 'rings' | 'bbox'> & Decoded

function decodeRings(rings: string[], bbox: number[], precision: number): Decoded {
  const out = rings.map((ring) => {
    const flat: number[] = []
    let x = 0
    let y = 0
    for (const pair of ring.split(',')) {
      const colon = pair.indexOf(':')
      if (colon === -1) continue
      x += Number.parseInt(pair.slice(0, colon), 36)
      y += Number.parseInt(pair.slice(colon + 1), 36)
      flat.push(x / precision, y / precision)
    }
    return flat
  })
  const [a = 0, b = 0, c = 0, d = 0] = bbox
  return { rings: out, bbox: [a / precision, b / precision, c / precision, d / precision] }
}

export function decodeSpecialUse(encoded: EncodedSpecialUse, precision: number): SpecialUseArea | null {
  if (encoded.type !== 'R' && encoded.type !== 'P') return null
  return { ...encoded, type: encoded.type, ...decodeRings(encoded.rings, encoded.bbox, precision) }
}

export function decodeParkUnit(encoded: EncodedParkUnit, precision: number): ParkUnit {
  return { ...encoded, ...decodeRings(encoded.rings, encoded.bbox, precision) }
}

function inRing(ring: number[], lon: number, lat: number): boolean {
  let inside = false
  const n = ring.length / 2
  for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
    const xi = ring[i * 2]
    const yi = ring[i * 2 + 1]
    const xj = ring[j * 2]
    const yj = ring[j * 2 + 1]
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Inside when an odd number of rings contain the point: pieces and holes both work. */
export function insideShape(shape: Decoded, at: LatLon): boolean {
  if (!Number.isFinite(at.lat) || !Number.isFinite(at.lon)) return false
  const [minLon, minLat, maxLon, maxLat] = shape.bbox
  if (at.lon < minLon || at.lon > maxLon || at.lat < minLat || at.lat > maxLat) return false
  let count = 0
  for (const ring of shape.rings) if (inRing(ring, at.lon, at.lat)) count += 1
  return count % 2 === 1
}

export function specialUseAt(areas: readonly SpecialUseArea[], at: LatLon): SpecialUseArea[] {
  return areas.filter((a) => insideShape(a, at))
}

/**
 * EVERY UNIT, NOT THE FIRST. Park units overlap: Big Meadow is inside both
 * Shenandoah National Park and the Appalachian National Scenic Trail corridor,
 * and the first version returned only the trail.
 */
export function parkUnitsAt(units: readonly ParkUnit[], at: LatLon): ParkUnit[] {
  return units.filter((u) => insideShape(u, at))
}

/**
 * The highest ground in the lower 48, in feet, rounded up: Mount Whitney is
 * 14,505 ft. Used only when the ground under a point is not known.
 */
export const HIGHEST_GROUND_FEET = 14_505

export type FloorReach = 'reaches' | 'may-reach' | 'above'

/**
 * Whether an area's floor comes down to a drone at this height.
 *
 *   SFC     the floor is measured from the ground: it reaches when the floor
 *           is at or below the drone's height.
 *   MSL     measured from sea level: it reaches when the floor is at or below
 *           ground elevation plus the drone's height. With the ground unknown
 *           it MAY reach anywhere the floor is no higher than the highest
 *           ground in the country plus the height, and may-reach is treated
 *           as reaching. Wrongly keeping a drone out of an area is a lost
 *           shot; wrongly putting it in one is a violation.
 *   STD     a flight level, 18,000 ft and up: never a drone's height.
 */
export function floorReaches(
  area: Pick<SpecialUseArea, 'floor' | 'floorRef' | 'floorUom'>,
  droneFeet: number,
  groundFeet: number | null = null,
): FloorReach {
  if (area.floorRef === 'STD' || area.floorUom === 'FL') return 'above'
  /* A floor with no value is read as the surface: the charted area, all the way down. */
  const floor = area.floor ?? 0
  if (area.floorRef === 'MSL') {
    if (groundFeet !== null) return floor <= groundFeet + droneFeet ? 'reaches' : 'above'
    return floor <= HIGHEST_GROUND_FEET + droneFeet ? 'may-reach' : 'above'
  }
  return floor <= droneFeet ? 'reaches' : 'above'
}
