import { describe, expect, it } from 'vitest'
import { SENSORS } from './fov.ts'
import { destinationPoint, distanceMeters, type LatLon, type Position } from './geo.ts'
import { airspaceAt, type AirspaceShape } from './airspaceLookup.ts'
import {
  DROP_STEPS,
  lineWords,
  NOMINAL_SUBJECT_METERS,
  SPACING_METERS,
  suggestPositions,
  type Footprint,
  type SuggestInput,
} from './suggest.ts'

/*
 * A SCENE WHERE EVERY RULE HAS SOMETHING TO DO. The subject at the centre, and
 * around it: a 40 m tower to the south, a footprint OSM gives no height to the
 * east, water to the north, controlled airspace to the west.
 */
const SUBJECT: LatLon = { lat: 36.8466, lon: -75.9767 }

/** A square footprint centred on a point, side in metres. */
function square(centre: LatLon, side: number): Position[] {
  const half = side / 2
  const n = destinationPoint(centre, 0, half).lat
  const s = destinationPoint(centre, 180, half).lat
  const e = destinationPoint(centre, 90, half).lon
  const w = destinationPoint(centre, 270, half).lon
  return [
    [w, s],
    [e, s],
    [e, n],
    [w, n],
    [w, s],
  ]
}

const TOWER: Footprint = { id: 'tower', ring: square(destinationPoint(SUBJECT, 180, 40), 30), heightMeters: 40 }
const UNKNOWN: Footprint = { id: 'unknown', ring: square(destinationPoint(SUBJECT, 90, 40), 30), heightMeters: null }
const SHED: Footprint = { id: 'shed', ring: square(destinationPoint(SUBJECT, 225, 60), 10), heightMeters: 0.5 }
const WATER = [[square(destinationPoint(SUBJECT, 0, 300), 400)]]
/* From 50 m to 450 m west of the subject. */
const westRing = square(destinationPoint(SUBJECT, 270, 250), 400)
const WEST: AirspaceShape = {
  cls: 'D',
  local: '',
  name: 'Test Class D',
  upper: 2500,
  upperUom: 'FT',
  /* Flat [lon, lat, lon, lat, ...], the extract's own shape. */
  rings: [westRing.flat()],
  bbox: [
    Math.min(...westRing.map((p) => p[0])),
    Math.min(...westRing.map((p) => p[1])),
    Math.max(...westRing.map((p) => p[0])),
    Math.max(...westRing.map((p) => p[1])),
  ],
}

const BASE: SuggestInput = {
  subject: SUBJECT,
  /* Aimed at eye height at the subject, as the app does. */
  subjectHeightMeters: 1.6,
  subjectWidthMeters: 30,
  reach: { centre: SUBJECT, radiusMeters: 2000 },
  optics: [
    { id: 'sigma-28-75', name: 'Sigma 28-75 f2.8', kind: 'lens', minFocalLength: 28, maxFocalLength: 75, sensor: SENSORS.fullFrame },
    { id: 'sony-70-200', name: 'Sony 70-200', kind: 'lens', minFocalLength: 70, maxFocalLength: 200, sensor: SENSORS.fullFrame },
    { id: 'air-3s-wide', name: 'Air 3S wide', kind: 'drone', minFocalLength: 24, maxFocalLength: 24, sensor: SENSORS.fullFrame },
    { id: 'air-3s-tele', name: 'Air 3S tele', kind: 'drone', minFocalLength: 70, maxFocalLength: 70, sensor: SENSORS.fullFrame },
  ],
  platforms: ['ground', 'air'],
  airAltitudeFeet: 200,
  /* Late afternoon, sun in the west-south-west. */
  sun: { azimuth: 250, altitude: 20 } as SuggestInput['sun'],
  footprints: [TOWER, UNKNOWN, SHED],
  water: WATER,
  airspace: [WEST],
  marks: [],
  date: '2026-10-25',
}

const total = (r: ReturnType<typeof suggestPositions>) =>
  r.survivors + DROP_STEPS.reduce((sum, step) => sum + r.dropped[step], 0)

describe('every candidate is accounted for', () => {
  /* A count that does not add up is a check that looked at something else. */
  it('considered = survivors + every drop, step by step', () => {
    const r = suggestPositions(BASE)
    expect(r.considered).toBeGreaterThan(100)
    expect(total(r)).toBe(r.considered)
  })
})

describe('step 2: where nobody can stand or fly', () => {
  const r = suggestPositions(BASE)

  it('drops ground candidates in water, and none survives there', () => {
    expect(r.dropped['in-water']).toBeGreaterThan(0)
    const north = r.picked.filter((c) => c.platform === 'ground' && c.at.lat > destinationPoint(SUBJECT, 0, 100).lat)
    expect(north).toEqual([])
  })

  it('drops air candidates in controlled airspace', () => {
    expect(r.dropped['controlled-airspace']).toBeGreaterThan(0)
  })

  /*
   * A DRONE FLIES AT THE HEIGHT THAT FRAMES THE SUBJECT, 30 degrees down,
   * capped at the planned 200 ft. A fixed 200 ft could not frame a 45 m width
   * with either Air 3S camera: the first Atlantic Park run dropped all 72.
   */
  it('flies each camera at the height that frames the subject', () => {
    const air = [...r.picked, ...r.runnersUp.map((x) => x.candidate)].filter((c) => c.platform === 'air')
    for (const c of air) {
      expect(c.altitudeFeet).toBeGreaterThanOrEqual(30)
      expect(c.altitudeFeet).toBeLessThanOrEqual(200)
    }
    expect(r.dropped['cannot-frame-from-altitude']).toBe(0)
  })

  it('drops only what would have to fly under 30 ft to frame the subject', () => {
    /* A 4 m subject: the wide camera frames 6 m at 3 m, which is 5 ft up. */
    const tiny = suggestPositions({ ...BASE, subjectWidthMeters: 4, platforms: ['air'] })
    expect(tiny.dropped['cannot-frame-from-altitude']).toBeGreaterThan(0)
  })

  it('drops what is outside the reach ring', () => {
    const tight = suggestPositions({ ...BASE, reach: { centre: SUBJECT, radiusMeters: 60 } })
    expect(tight.dropped['outside-reach']).toBeGreaterThan(0)
    for (const c of tight.picked) expect(distanceMeters(SUBJECT, c.at)).toBeLessThanOrEqual(60.01)
  })
})

describe('step 3: line of sight', () => {
  it('drops a line through a building taller than the line', () => {
    const r = suggestPositions(BASE)
    expect(r.dropped['building-in-line']).toBeGreaterThan(0)
    /* Nothing picked looks through the tower: due south of it, beyond it. */
    for (const c of r.picked.filter((p) => p.platform === 'ground')) {
      const south = Math.abs(c.positionBearing - 180) < 15 && c.rangeMeters > 55
      expect(south, `${c.opticId} at ${c.positionBearing.toFixed(0)} deg`).toBe(false)
    }
  })

  it('keeps a line over a building lower than the line', () => {
    const r = suggestPositions({ ...BASE, footprints: [SHED] })
    expect(r.dropped['building-in-line']).toBe(0)
  })

  /*
   * NO HEIGHT IS NOT NO BUILDING. A footprint OSM gives no height for is
   * assumed to block: the candidate is kept only as "line of sight
   * unverified", and never outranks one that was checked.
   */
  it('labels a line through a footprint with no height as unverified, and ranks it last', () => {
    const r = suggestPositions({ ...BASE, footprints: [UNKNOWN] })
    const unverified = r.picked.filter((c) => c.lineOfSight === 'unverified')
    const checked = r.picked.filter((c) => c.lineOfSight === 'nothing-mapped')
    if (unverified.length > 0 && checked.length > 0) {
      expect(r.picked.indexOf(unverified[0])).toBeGreaterThan(r.picked.indexOf(checked.at(-1)!))
    }
    const only = suggestPositions({
      ...BASE,
      platforms: ['ground'],
      footprints: [UNKNOWN],
      water: [],
      optics: [BASE.optics[0]],
      /* East of the subject, beyond the footprint, where the 28-75 frames it. */
      reach: { centre: destinationPoint(SUBJECT, 90, 75), radiusMeters: 25 },
    })
    expect(only.picked.length).toBeGreaterThan(0)
    expect(only.picked.every((c) => c.lineOfSight === 'unverified')).toBe(true)
    expect(lineWords(only.picked[0])).toBe('line of sight unverified')
  })

  it('drops a line through terrain higher than the line', () => {
    /* A ridge 10 m high in a band 30 to 60 m south of the subject. */
    const elevationAt = (p: LatLon) => {
      const d = distanceMeters(SUBJECT, p)
      const south = p.lat < SUBJECT.lat
      return south && d > 30 && d < 60 ? 10 : 0
    }
    const r = suggestPositions({ ...BASE, footprints: [], elevationAt })
    expect(r.dropped['terrain-in-line']).toBeGreaterThan(0)
    expect(r.picked.every((c) => c.terrainChecked)).toBe(true)
  })

  it('drops a line through a hazard the shooter marked', () => {
    /* A power line 12 m up, crossing south of the subject from SE to SW. */
    const wire = {
      id: 'wire',
      kind: 'power-line',
      shape: {
        kind: 'line',
        path: [destinationPoint(SUBJECT, 135, 30), destinationPoint(SUBJECT, 225, 30)],
      },
      heightMeters: 12,
      foliage: 'solid',
      source: 'manual',
    }
    const r = suggestPositions({ ...BASE, footprints: [], marks: [wire as never] })
    expect(r.dropped['marked-hazard-in-line']).toBeGreaterThan(0)
  })
})

describe('steps 4 and 5: light, then the best spread out', () => {
  const r = suggestPositions(BASE)

  it('picks three to five', () => {
    expect(r.picked.length).toBeGreaterThanOrEqual(3)
    expect(r.picked.length).toBeLessThanOrEqual(5)
  })

  it(`keeps every pick at least ${SPACING_METERS} m from every other`, () => {
    for (const a of r.picked) {
      for (const b of r.picked) {
        if (a !== b) expect(distanceMeters(a.at, b.at)).toBeGreaterThanOrEqual(SPACING_METERS)
      }
    }
  })

  it('ranks side light above front light above back light among checked lines', () => {
    const checked = r.picked.filter((c) => c.lineOfSight === 'nothing-mapped')
    const order = { 'side-lit': 3, 'front-lit': 2, backlit: 1 } as const
    for (let i = 1; i < checked.length; i++) {
      expect(order[checked[i - 1].light!]).toBeGreaterThanOrEqual(order[checked[i].light!])
    }
    expect(checked[0].light).toBe('side-lit')
  })

  it('says why the runners-up lost', () => {
    expect(r.runnersUp.length).toBeGreaterThan(0)
    for (const runner of r.runnersUp) expect(runner.lostBecause).not.toBe('')
  })

  it('never calls a line clear', () => {
    for (const c of [...r.picked, ...r.runnersUp.map((x) => x.candidate)]) {
      expect(lineWords(c)).not.toMatch(/\bclear\b/i)
    }
  })
})

describe('what it says it assumed', () => {
  it(`says when it framed for a nominal ${NOMINAL_SUBJECT_METERS} m subject`, () => {
    const r = suggestPositions({ ...BASE, subjectWidthMeters: null })
    expect(r.notes.join(' ')).toContain(`${NOMINAL_SUBJECT_METERS} m subject`)
  })

  it('says terrain and buildings were not checked when it had none', () => {
    const r = suggestPositions({ ...BASE, footprints: [] })
    expect(r.notes.join(' ')).toMatch(/Terrain not checked/)
    expect(r.notes.join(' ')).toMatch(/Unmapped is not empty/)
  })

  it('does not score light with the sun down', () => {
    const r = suggestPositions({ ...BASE, sun: { azimuth: 300, altitude: -10 } as SuggestInput['sun'] })
    expect(r.picked.every((c) => c.light === null)).toBe(true)
  })
})

/*
 * THE LAANC SWITCH. Off: controlled airspace drops a drone spot, as it always
 * did. On: kept, and never flown above the facility map's ceiling where it
 * ends up. Restricted areas and park units drop it either way.
 */
describe('the "I have LAANC here" switch', () => {
  /* Inside the test's controlled airspace, which is what the switch is about. */
  const inWest = (c: { at: LatLon }) => airspaceAt([WEST], c.at).length > 0
  const all = (r: ReturnType<typeof suggestPositions>) => [...r.picked, ...r.runnersUp.map((x) => x.candidate)]

  it('off, or absent, changes nothing', () => {
    const off = suggestPositions({ ...BASE, laanc: { enabled: false, ceilingAt: () => 400 } })
    expect(off.dropped['controlled-airspace']).toBe(suggestPositions(BASE).dropped['controlled-airspace'])
    expect(off.dropped['controlled-airspace']).toBeGreaterThan(0)
  })

  it('on, keeps drone spots in controlled airspace under the grid ceiling', () => {
    /* The reach ring inside the controlled airspace, so whatever is picked was tested by it. */
    const on = suggestPositions({
      ...BASE,
      platforms: ['air'],
      reach: { centre: destinationPoint(SUBJECT, 270, 120), radiusMeters: 90 },
      laanc: { enabled: true, ceilingAt: () => 100 },
    })
    expect(on.dropped['controlled-airspace']).toBe(0)
    const west = all(on).filter(inWest)
    expect(west.length).toBeGreaterThan(0)
    for (const c of west) {
      expect(c.ceilingFeet).toBe(100)
      expect(c.altitudeFeet).toBeLessThanOrEqual(100)
    }
    expect(total(on)).toBe(on.considered)
  })

  it('on, still drops a square whose ceiling is 0', () => {
    const zero = suggestPositions({ ...BASE, platforms: ['air'], laanc: { enabled: true, ceilingAt: () => 0 } })
    expect(zero.dropped['grid-ceiling-too-low']).toBeGreaterThan(0)
    expect(all(zero).some(inWest)).toBe(false)
  })

  it('reads the ceiling again where the drone ends up after flying lower', () => {
    /* 400 ft near the subject, 50 ft further out: the lowered drone moves outward into the 50 ft square. */
    const ceilingAt = (p: LatLon) => (distanceMeters(SUBJECT, p) < 70 ? 400 : 50)
    const r = suggestPositions({ ...BASE, platforms: ['air'], laanc: { enabled: true, ceilingAt } })
    for (const c of all(r).filter(inWest)) expect(c.altitudeFeet).toBeLessThanOrEqual(ceilingAt(c.at))
  })
})

describe('parks and restricted areas drop drone spots, LAANC or not', () => {
  /* The whole neighbourhood, as flat rings, for restrictions.ts. */
  const everywhere = { rings: [[-76.1, 36.7, -75.8, 36.7, -75.8, 37.0, -76.1, 37.0, -76.1, 36.7]], bbox: [-76.1, 36.7, -75.8, 37.0] as [number, number, number, number] }
  const park = { code: 'TEST', name: 'Test Park', unitType: 'National Parks', state: 'VA', ...everywhere }
  const restricted = (floor: number, floorRef: string) => ({
    type: 'R' as const, name: 'R-TEST', floor, floorUom: 'FT', floorRef, ceiling: 18000, ceilingUom: 'FT', agency: '', times: '', state: 'VA', ...everywhere,
  })
  const laanc = { enabled: true, ceilingAt: () => 400 }

  it('drops every drone spot in a park unit and keeps the ground ones', () => {
    const r = suggestPositions({ ...BASE, parks: [park], laanc })
    expect(r.dropped['national-park']).toBeGreaterThan(0)
    expect(r.picked.some((c) => c.platform === 'air')).toBe(false)
    expect(r.picked.some((c) => c.platform === 'ground')).toBe(true)
  })

  it('drops drone spots where a restricted floor reaches them', () => {
    const r = suggestPositions({ ...BASE, specialUse: [restricted(0, 'SFC')], laanc })
    expect(r.dropped['restricted-or-prohibited']).toBeGreaterThan(0)
    expect(r.picked.some((c) => c.platform === 'air')).toBe(false)
  })

  it('keeps them under a restricted area whose floor is far above', () => {
    const r = suggestPositions({ ...BASE, specialUse: [restricted(18000, 'MSL')], laanc })
    expect(r.dropped['restricted-or-prohibited']).toBe(0)
  })
})
