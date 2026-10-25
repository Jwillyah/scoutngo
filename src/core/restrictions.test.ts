import { describe, expect, it } from 'vitest'
import {
  decodeParkUnit,
  decodeSpecialUse,
  floorReaches,
  HIGHEST_GROUND_FEET,
  insideShape,
  parkUnitsAt,
  specialUseAt,
  type SpecialUseArea,
} from './restrictions.ts'
import { PARK_UNITS, RESTRICTIONS_COORD_PRECISION, SPECIAL_USE } from '../data/restrictions.ts'

const special = SPECIAL_USE.map((s) => decodeSpecialUse(s, RESTRICTIONS_COORD_PRECISION)).filter(
  (s): s is SpecialUseArea => s !== null,
)
const parks = PARK_UNITS.map((p) => decodeParkUnit(p, RESTRICTIONS_COORD_PRECISION))

describe('the baked data is there to look at', () => {
  /* Zero shapes examined is not a pass. */
  it('holds restricted and prohibited areas and park units', () => {
    expect(special.length).toBeGreaterThan(500)
    expect(parks.length).toBeGreaterThan(400)
    expect(special.every((s) => s.type === 'R' || s.type === 'P')).toBe(true)
  })
})

describe('real places', () => {
  /* Units overlap: the first version returned only the Appalachian Trail here. */
  it('Big Meadow is inside Shenandoah National Park, and the trail corridor too', () => {
    const codes = parkUnitsAt(parks, { lat: 38.5195, lon: -78.444 }).map((p) => p.code)
    expect(codes).toContain('SHEN')
    expect(codes).toContain('APPA')
  })

  it('the Washington Monument is inside P-56', () => {
    expect(specialUseAt(special, { lat: 38.8895, lon: -77.0353 }).map((s) => s.name)).toContain('P-56')
  })

  it('Atlantic Park, Virginia Beach is in no park and no restricted or prohibited area', () => {
    const at = { lat: 36.8465792, lon: -75.9766619 }
    expect(parkUnitsAt(parks, at)).toEqual([])
    expect(specialUseAt(special, at)).toEqual([])
  })
})

describe('inside, for shapes in pieces and with holes', () => {
  const square = (x: number, y: number, s: number) => [x, y, x + s, y, x + s, y + s, x, y + s, x, y]
  const shape = (rings: number[][]) => ({ rings, bbox: [0, 0, 10, 10] as [number, number, number, number] })

  it('counts a second, separate piece as inside, not as a hole', () => {
    const twoPieces = shape([square(0, 0, 2), square(5, 5, 2)])
    expect(insideShape(twoPieces, { lon: 6, lat: 6 })).toBe(true)
    expect(insideShape(twoPieces, { lon: 3.5, lat: 3.5 })).toBe(false)
  })

  it('counts a hole as outside', () => {
    const withHole = shape([square(0, 0, 10), square(4, 4, 2)])
    expect(insideShape(withHole, { lon: 5, lat: 5 })).toBe(false)
    expect(insideShape(withHole, { lon: 1, lat: 1 })).toBe(true)
  })
})

describe('whether a floor comes down to the drone', () => {
  it('a surface floor reaches; one above the drone does not', () => {
    expect(floorReaches({ floor: 0, floorRef: 'SFC', floorUom: 'FT' }, 200)).toBe('reaches')
    expect(floorReaches({ floor: 500, floorRef: 'SFC', floorUom: 'FT' }, 200)).toBe('above')
  })

  it('a sea-level floor reaches over high ground, and may reach where the ground is unknown', () => {
    expect(floorReaches({ floor: 1200, floorRef: 'MSL', floorUom: 'FT' }, 200, 1100)).toBe('reaches')
    expect(floorReaches({ floor: 1200, floorRef: 'MSL', floorUom: 'FT' }, 200, 10)).toBe('above')
    expect(floorReaches({ floor: 1200, floorRef: 'MSL', floorUom: 'FT' }, 200)).toBe('may-reach')
    expect(
      floorReaches({ floor: HIGHEST_GROUND_FEET + 1000, floorRef: 'MSL', floorUom: 'FT' }, 200),
    ).toBe('above')
  })

  it('a flight level is never a drone height', () => {
    expect(floorReaches({ floor: 180, floorRef: 'STD', floorUom: 'FL' }, 400)).toBe('above')
  })
})
