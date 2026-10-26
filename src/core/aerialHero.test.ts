import { describe, expect, it } from 'vitest'
import { aerialHero, START_DEPRESSION_DEGREES, type HeroInput } from './aerialHero.ts'
import { SENSORS } from './fov.ts'
import { destinationPoint, distanceMeters, type LatLon, type Position } from './geo.ts'
import type { AirspaceShape } from './airspaceLookup.ts'

const SUBJECT: LatLon = { lat: 36.8466, lon: -75.9767 }
const box = (centre: LatLon, half: number): Position[] => {
  const n = destinationPoint(centre, 0, half)
  const e = destinationPoint(centre, 90, half)
  const dLat = n.lat - centre.lat
  const dLon = e.lon - centre.lon
  return [
    [centre.lon - dLon, centre.lat - dLat],
    [centre.lon + dLon, centre.lat - dLat],
    [centre.lon + dLon, centre.lat + dLat],
    [centre.lon - dLon, centre.lat + dLat],
    [centre.lon - dLon, centre.lat - dLat],
  ]
}
/* A row of 40 m towers 400 m west of the subject: the city. One low shed east. */
const CITY = [-20, -10, 0, 10, 20].map((off, i) => ({ id: `t${i}`, ring: box(destinationPoint(SUBJECT, 270 + off, 400), 15), heightMeters: 40 }))
const SHED = { id: 'shed', ring: box(destinationPoint(SUBJECT, 90, 300), 4), heightMeters: 3 }
const everywhere = { rings: [[-76.1, 36.7, -75.8, 36.7, -75.8, 37.0, -76.1, 37.0, -76.1, 36.7]], bbox: [-76.1, 36.7, -75.8, 37.0] as [number, number, number, number] }
const CLASS_D: AirspaceShape = { cls: 'D', local: '', name: 'TEST CLASS D', upper: 2500, upperUom: 'FT', ...everywhere }

const BASE: HeroInput = {
  subject: SUBJECT,
  optics: [{ id: 'air-3s-wide', name: 'Air 3S wide', focalLength: 24, sensor: SENSORS.fullFrame }],
  sun: { azimuth: 245, altitude: 6, shadowBearing: 65 },
  footprints: [...CITY, SHED],
  airspace: [],
  specialUse: [],
  parks: [],
  laanc: { enabled: false, ceilingAt: () => null },
}

const hero = (input: HeroInput) => {
  const r = aerialHero(input)
  if (r.status !== 'ok') throw new Error(r.reason)
  return r.hero
}

describe('the hero wide push', () => {
  it('faces the skyline: the city west of the subject puts the drone east of it, looking west', () => {
    const h = hero(BASE)
    expect(Math.abs(h.cameraBearing - 270)).toBeLessThanOrEqual(5)
    expect(h.start.lon).toBeGreaterThan(SUBJECT.lon)
    expect(h.backdropCount).toBe(5)
  })

  it('flies at 400 ft outside controlled airspace, starting where the subject is 15 degrees down', () => {
    const h = hero(BASE)
    expect(h.altitudeFeet).toBe(400)
    expect(h.ceilingFeet).toBeNull()
    const want = (400 * 0.3048) / Math.tan((START_DEPRESSION_DEGREES * Math.PI) / 180)
    expect(Math.abs(h.startMeters - want)).toBeLessThan(1)
    expect(distanceMeters(h.end, SUBJECT)).toBeLessThan(h.startMeters)
  })

  it('in controlled airspace, holds the height under the ceiling it is given: 200 ft approved under a 250 ft grid', () => {
    const h = hero({ ...BASE, airspace: [CLASS_D], laanc: { enabled: true, ceilingAt: () => Math.min(250, 200) } })
    expect(h.altitudeFeet).toBe(200)
    expect(h.ceilingFeet).toBe(200)
  })

  it('reads the ceiling along the whole push, not only at the start', () => {
    /* 300 ft far out, 150 ft close in: the end of the push sets the height. */
    const ceilingAt = (p: LatLon) => (distanceMeters(SUBJECT, p) > 200 ? 300 : 150)
    const h = hero({ ...BASE, airspace: [CLASS_D], laanc: { enabled: true, ceilingAt } })
    expect(h.altitudeFeet).toBe(150)
  })

  it('does not fly controlled airspace with the switch off, and says why', () => {
    const r = aerialHero({ ...BASE, airspace: [CLASS_D] })
    expect(r.status).toBe('none')
    if (r.status === 'none') expect(r.reason).toContain('LAANC switch is off')
  })

  it('does not fly a park unit', () => {
    const r = aerialHero({ ...BASE, parks: [{ code: 'T', name: 'Test Park', unitType: 'National Parks', state: 'VA', ...everywhere }] })
    expect(r.status).toBe('none')
  })

  it('with no buildings mapped there is no skyline, and it says so rather than guessing', () => {
    const r = aerialHero({ ...BASE, footprints: [] })
    expect(r.status).toBe('none')
    if (r.status === 'none') expect(r.reason).toContain('Unmapped is not empty')
  })

  it('weighs by footprint and says so when no height is mapped at all', () => {
    const h = hero({ ...BASE, footprints: CITY.map((b) => ({ ...b, heightMeters: null })) })
    expect(h.backdropBy).toBe('footprint')
    expect(Math.abs(h.cameraBearing - 270)).toBeLessThanOrEqual(5)
  })

  it('uses the widest drone camera in the bag', () => {
    const h = hero({ ...BASE, optics: [{ id: 'tele', name: 'tele', focalLength: 70, sensor: SENSORS.fullFrame }, ...BASE.optics] })
    expect(h.opticId).toBe('air-3s-wide')
  })
})
