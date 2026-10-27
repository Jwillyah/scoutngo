import { describe, expect, it } from 'vitest'
import { destinationPoint, distanceMeters } from './geo.ts'
import {
  battery,
  clearanceByBoxes,
  clearanceBySurface,
  FLIGHT_CARD_CLOSE,
  FT,
  hiddenByHorizon,
  hiddenByMarch,
  legWind,
  pathFor,
  pathLengthFormula,
  pathLengthSampled,
  stretches,
  toGpx,
  toKml,
  type Heights,
  type Move,
} from './flight.ts'

const PIER = { lat: 36.8436, lon: -75.9713 }

describe('a move, measured by hand', () => {
  /* An orbit of radius 100 m through a half circle: pi x 100 = 314.16 m; at 5 m/s, 62.8 s. */
  const orbit: Move = { kind: 'orbit', centre: PIER, radiusM: 100, heightFt: 150, startBearing: 0, sweepDeg: 180, clockwise: true }

  it('orbit length: the arc formula and the sampled path agree with the hand figure', () => {
    const path = pathFor(orbit, { speedMps: 5, capFt: 400, stepS: 0.25 })
    expect(pathLengthFormula(orbit, 400)).toBeCloseTo(Math.PI * 100, 6)
    /* The sampled path is chords of 2 degrees: within 0.1% of the arc. */
    expect(Math.abs(pathLengthSampled(path) - Math.PI * 100) / (Math.PI * 100)).toBeLessThan(0.001)
    expect(path[path.length - 1].t).toBeCloseTo((Math.PI * 100) / 5, 0)
  })

  it('a straight push-in: 60% of the way to the subject, 200 m away, is 120 m', () => {
    const from = destinationPoint(PIER, 270, 200)
    const move: Move = { kind: 'push-in', from, subject: PIER, heightFt: 100 }
    expect(pathLengthFormula(move, 400)).toBeCloseTo(120, 3)
    const path = pathFor(move, { speedMps: 4, capFt: 400 })
    expect(path[path.length - 1].t).toBeCloseTo(30, 3)
    expect(distanceMeters(path[path.length - 1].at, PIER)).toBeCloseTo(80, 1)
  })

  it('a rise asked to 500 ft is held at a 400 ft cap, and the card can see it was asked', () => {
    const path = pathFor({ kind: 'rise', at: PIER, fromFt: 0, toFt: 500 }, { speedMps: 3, capFt: 400 })
    expect(Math.max(...path.map((p) => p.ft))).toBe(400)
    expect(Math.max(...path.map((p) => p.askedFt))).toBe(500)
    expect(stretches(path, (p) => p.askedFt > 400).length).toBe(1)
  })
})

/*
 * A SYNTHETIC SCENE: flat ground at 2 m, one block 20 x 20 m whose roof is at
 * 32 m (30 m tall), 60 m east of the pilot. Both sources (a surface raster and
 * a box) describe the same block.
 */
const pilot = PIER
const blockCentre = destinationPoint(pilot, 90, 60)
const corner = (dx: number, dy: number) => destinationPoint(destinationPoint(blockCentre, 90, dx), 0, dy)
const block = { ring: [corner(-10, -10), corner(10, -10), corner(10, 10), corner(-10, 10)].map((p) => [p.lon, p.lat] as [number, number]), topM: 32 }
const inBlock = (at: { lat: number; lon: number }) => {
  const e = distanceMeters({ lat: blockCentre.lat, lon: at.lon }, blockCentre) * Math.sign(at.lon - blockCentre.lon)
  const n = distanceMeters({ lat: at.lat, lon: blockCentre.lon }, blockCentre) * Math.sign(at.lat - blockCentre.lat)
  return Math.abs(e) <= 10 && Math.abs(n) <= 10
}
const scene: Heights = { groundAt: () => 2, surfaceAt: (at) => (inBlock(at) ? 32 : 2) }

describe('clearance over a block of known height, two ways', () => {
  it('flying over the block at 150 ft clears its 30 m roof by 150 x 0.3048 - 30 = 15.72 m', () => {
    const move: Move = { kind: 'fly-along', points: [destinationPoint(pilot, 90, 20), destinationPoint(pilot, 90, 100)], heightFt: 150 }
    const path = pathFor(move, { speedMps: 5, capFt: 400, stepS: 0.2 })
    const a = clearanceBySurface(path, pilot, scene)
    const b = clearanceByBoxes(path, pilot, scene, [block])
    expect(a?.metres).toBeCloseTo(150 * FT - 30, 6)
    expect(b?.metres).toBeCloseTo(150 * FT - 30, 6)
  })
})

describe('line of sight past a wall, two ways', () => {
  /* The drone at 60 ft (18.3 m) 150 m east, behind the 30 m block: hidden. At 400 ft (121.9 m): seen. */
  const behind = { t: 0, at: destinationPoint(pilot, 90, 150), ft: 60, askedFt: 60 }
  const above = { ...behind, ft: 400, askedFt: 400 }
  const beside = { ...behind, at: destinationPoint(pilot, 0, 150) }
  it('agree: hidden low behind it, seen high over it, seen off to the side', () => {
    for (const [p, want] of [[behind, true], [above, false], [beside, false]] as const) {
      expect(hiddenByMarch(pilot, p, scene)).toBe(want)
      expect(hiddenByHorizon(pilot, p, scene)).toBe(want)
    }
  })
})

describe('wind, battery, and what the card ends with', () => {
  it('flying east into an east wind is a headwind; with a west wind, a tailwind', () => {
    expect(legWind(90, 90)).toBe('headwind')
    expect(legWind(90, 270)).toBe('tailwind')
    expect(legWind(90, 0)).toBe('crosswind')
  })
  it('a 6 minute flight on a 45 minute battery leaves the reserve untouched', () => {
    expect(battery(360)).toEqual({ usedMin: 6, usableMin: 33.75, overReserve: false })
    expect(battery(40 * 60).overReserve).toBe(true)
  })
  it('the card always ends by sending you to LAANC, the TFRs and the site', () => {
    expect(FLIGHT_CARD_CLOSE).toBe('Pull LAANC, check TFRs, look at the site.')
  })
  it('exports GPX and KML of the same points', () => {
    const path = pathFor({ kind: 'rise', at: PIER, fromFt: 0, toFt: 100 }, { speedMps: 3, capFt: 400, stepS: 5 })
    const gpx = toGpx('Rise', path, 2, new Date('2026-10-27T21:00:00Z'))
    expect((gpx.match(/<trkpt/g) ?? []).length).toBe(path.length)
    expect(gpx).toContain('<ele>32.5</ele>')
    expect(toKml('Rise', path)).toContain('<altitudeMode>relativeToGround</altitudeMode>')
  })
})
