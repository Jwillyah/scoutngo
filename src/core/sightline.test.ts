import { describe, expect, it } from 'vitest'
import { destinationPoint, type LatLon } from './geo.ts'
import {
  blockers,
  cameraHeightMeters,
  EYE_HEIGHT_METERS,
  SIGHTLINE_CORRIDOR_METERS,
} from './sightline.ts'
import type { SiteMark } from './siteMark.ts'

/* 103 Capital Trace, roughly: the restaurant that prompted this. */
const SUBJECT: LatLon = { lat: 37.0869, lon: -76.4746 }
/* The camera 200 m due west, looking east at the building. */
const CAMERA = destinationPoint(SUBJECT, 270, 200)

const mark = (over: Partial<SiteMark> = {}): SiteMark => ({
  id: 'm1',
  kind: 'trees',
  shape: { kind: 'point', at: destinationPoint(SUBJECT, 270, 100) },
  heightMeters: 18,
  foliage: 'solid',
  source: 'manual',
  confirmed: true,
  note: '',
  ...over,
})

const look = (marks: SiteMark[], over: Partial<Parameters<typeof blockers>[0]> = {}) =>
  blockers({
    camera: CAMERA,
    cameraHeightMeters: EYE_HEIGHT_METERS,
    subject: SUBJECT,
    subjectHeightMeters: 6,
    marks,
    date: '2026-07-15',
    ...over,
  })

describe('an obstruction halfway along a ground sightline', () => {
  it('blocks when it is taller than the line at that point', () => {
    const found = look([mark()])
    expect(found).toHaveLength(1)
    expect(found[0].markId).toBe('m1')
    expect(found[0].atMeters).toBeCloseTo(100, 0)
  })

  /*
   * THE LINE RISES. At 100 m along a 200 m run, from 1.6 m eye height to a 6 m
   * aiming point, the sightline is at 3.8 m. An 18 m tree clears that by 14.2;
   * a 2 m hedge does not reach it.
   */
  it('reports how high the sightline is and how far over it the top reaches', () => {
    const found = look([mark()])
    expect(found[0].sightlineHeightMeters).toBeCloseTo(3.8, 1)
    expect(found[0].topMeters).toBe(18)
    expect(found[0].overMeters).toBeCloseTo(14.2, 1)
  })

  it('does not block when it is under the line', () => {
    expect(look([mark({ heightMeters: 2 })])).toEqual([])
  })

  /*
   * Exactly at the line is not blocked: the test is strictly above. Taken from
   * the computed height rather than from 3.8, because the mark sits at 99.99 m
   * along rather than a round 100 and a literal would be testing the rounding.
   */
  it('does not block when it is exactly at the line', () => {
    const line = look([mark()])[0].sightlineHeightMeters
    expect(look([mark({ heightMeters: line })])).toEqual([])
    expect(look([mark({ heightMeters: line + 0.01 })])).toHaveLength(1)
  })
})

describe('what is not in the way', () => {
  it('ignores something behind the camera', () => {
    expect(look([mark({ shape: { kind: 'point', at: destinationPoint(CAMERA, 270, 50) } })]))
      .toEqual([])
  })

  it('ignores something past the subject', () => {
    expect(look([mark({ shape: { kind: 'point', at: destinationPoint(SUBJECT, 90, 50) } })]))
      .toEqual([])
  })

  it('ignores something off to one side', () => {
    const aside = destinationPoint(
      destinationPoint(SUBJECT, 270, 100),
      0,
      SIGHTLINE_CORRIDOR_METERS + 10,
    )
    expect(look([mark({ shape: { kind: 'point', at: aside } })])).toEqual([])
  })

  it('still catches something just inside the corridor', () => {
    const near = destinationPoint(
      destinationPoint(SUBJECT, 270, 100),
      0,
      SIGHTLINE_CORRIDOR_METERS - 3,
    )
    expect(look([mark({ shape: { kind: 'point', at: near } })])).toHaveLength(1)
  })

  /*
   * A MARK WITH NO HEIGHT TAKES NO PART. Inventing a height would decide
   * whether a position is usable from a number nobody gave.
   */
  it('ignores a mark with no height', () => {
    expect(look([mark({ heightMeters: null })])).toEqual([])
  })

  /* A note is not a hazard. A car park does not block anything. */
  it('ignores a positive note standing in the same place', () => {
    expect(look([mark({ kind: 'parking', heightMeters: 30 })])).toEqual([])
    expect(look([mark({ kind: 'open-field', heightMeters: 30 })])).toEqual([])
  })
})

/*
 * A SPAN OF WIRE IS A LINE, AND THE PART THAT HITS YOU IS THE MIDDLE.
 *
 * The vertices are the poles. A test that only checked the vertices would miss
 * the 80 m of wire between them, which is the entire hazard.
 */
describe('a line mark is caught along its length, not just at its ends', () => {
  const crossing: SiteMark = mark({
    kind: 'power-line',
    heightMeters: 11,
    shape: {
      kind: 'line',
      path: [
        destinationPoint(destinationPoint(SUBJECT, 270, 100), 0, 60),
        destinationPoint(destinationPoint(SUBJECT, 270, 100), 180, 60),
      ],
    },
  })

  it('catches a wire crossing the sightline between its poles', () => {
    const found = look([crossing])
    expect(found).toHaveLength(1)
    expect(found[0].atMeters).toBeCloseTo(100, 0)
  })

  it('would have missed it if only the poles were tested', () => {
    /* Both poles are 60 m off the line, well outside the corridor. */
    for (const pole of crossing.shape.kind === 'line' ? crossing.shape.path : []) {
      expect(look([mark({ shape: { kind: 'point', at: pole }, heightMeters: 11 })])).toEqual([])
    }
  })

  it('ignores a wire that runs parallel to one side', () => {
    const parallel: SiteMark = mark({
      kind: 'power-line',
      heightMeters: 11,
      shape: {
        kind: 'line',
        path: [
          destinationPoint(destinationPoint(SUBJECT, 270, 60), 0, 40),
          destinationPoint(destinationPoint(SUBJECT, 270, 140), 0, 40),
        ],
      },
    })
    expect(look([parallel])).toEqual([])
  })
})

/*
 * THE HEIGHT THE CAMERA SEES FROM IS THE POINT OF DOING THIS PER POSITION.
 * The oak that kills a tripod shot is irrelevant at 200 feet.
 */
describe('a ground position and an air position see different things', () => {
  const oak = mark({ heightMeters: 18 })

  it('sees from eye height on the ground', () => {
    expect(cameraHeightMeters('ground', 0)).toBe(EYE_HEIGHT_METERS)
    expect(cameraHeightMeters('ground', 400)).toBe(EYE_HEIGHT_METERS)
  })

  it('sees from the flight altitude in the air, converted from feet', () => {
    expect(cameraHeightMeters('air', 200)).toBeCloseTo(60.96, 2)
  })

  it('blocks the tripod and not the aircraft', () => {
    expect(look([oak])).toHaveLength(1)
    const aerial = look([oak], {
      cameraHeightMeters: cameraHeightMeters('air', 200),
      subjectHeightMeters: 6,
    })
    expect(aerial).toEqual([])
  })

  /* And a low hover is still blocked, which is why the number is used. */
  it('blocks an aircraft flying under the canopy', () => {
    const low = look([oak], { cameraHeightMeters: cameraHeightMeters('air', 20) })
    expect(low).toHaveLength(1)
  })
})

describe('the season decides whether a deciduous obstruction counts', () => {
  const oak = mark({ foliage: 'deciduous', heightMeters: 18 })

  it('blocks in July', () => {
    const found = look([oak], { date: '2026-07-15' })
    expect(found).toHaveLength(1)
    expect(found[0].seasonal).toBe(true)
    expect(found[0].leaf).toBe('in-leaf')
  })

  it('does not block in January', () => {
    expect(look([oak], { date: '2026-01-15' })).toEqual([])
  })

  it('still blocks in a shoulder month, and says which', () => {
    const found = look([oak], { date: '2026-10-16' })
    expect(found).toHaveLength(1)
    expect(found[0].leaf).toBe('turning')
  })

  /* A building is a building in January. */
  it('ignores the date for anything solid', () => {
    const wall = mark({ kind: 'building', foliage: 'solid', heightMeters: 18 })
    expect(look([wall], { date: '2026-01-15' })).toHaveLength(1)
    expect(look([wall], { date: '2026-07-15' })).toHaveLength(1)
  })
})

describe('several blockers come back worst first', () => {
  it('orders by how far over the sightline each one reaches', () => {
    const found = look([
      mark({ id: 'low', heightMeters: 6 }),
      mark({ id: 'high', heightMeters: 30, shape: { kind: 'point', at: destinationPoint(SUBJECT, 270, 120) } }),
    ])
    expect(found.map((b) => b.markId)).toEqual(['high', 'low'])
  })

  /*
   * NOTHING MARKED IS AN EMPTY LIST, NOT A VERDICT. There is no "clear"
   * result to return, by construction. See src/core/siteMark.ts.
   */
  it('returns an empty list when nothing is marked', () => {
    expect(look([])).toEqual([])
  })

  it('returns an empty list rather than anything when the camera is on the subject', () => {
    expect(look([mark()], { camera: SUBJECT })).toEqual([])
  })
})
