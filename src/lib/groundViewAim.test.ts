import { describe, expect, it } from 'vitest'
import { bearingBetween, destinationPoint, type LatLon } from '../core/geo.ts'
import { groundViewAim } from './groundViewAim.ts'

const SUBJECT: LatLon = { lat: 38.364236, lon: -75.605912 }
/* The position 150 m due west, so the subject is due east of it. */
const AT = destinationPoint(SUBJECT, 270, 150)

/*
 * WHAT WAS REPORTED. "It looks from the venue pin towards my position, so at
 * a building I get a wall from ten feet away. That is backwards."
 */
describe('an air position looks at the subject from its own side', () => {
  const aim = groundViewAim({ at: AT, subject: SUBJECT, cameraBearing: null, air: true })

  it('stands at the position, never at the pin', () => {
    expect(aim.from).toEqual(AT)
    expect(aim.from).not.toEqual(SUBJECT)
  })

  it('looks at the subject', () => {
    expect(aim.bearing).toBeCloseTo(bearingBetween(AT, SUBJECT), 6)
    /* Due east, give or take the meridian. */
    expect(aim.bearing).toBeGreaterThan(85)
    expect(aim.bearing).toBeLessThan(95)
  })

  /* The old behaviour, pinned as the counter-example. */
  it('is the opposite of looking from the pin at the position', () => {
    const backwards = bearingBetween(SUBJECT, AT)
    expect(Math.abs((aim.bearing as number) - backwards)).toBeGreaterThan(170)
  })

  it('says it is not the view from the aircraft', () => {
    expect(aim.disclose).toBe(true)
  })
})

describe('a ground position is unchanged', () => {
  it('keeps its measured camera bearing', () => {
    const aim = groundViewAim({ at: AT, subject: SUBJECT, cameraBearing: 91.2, air: false })
    expect(aim.bearing).toBe(91.2)
    expect(aim.from).toEqual(AT)
  })

  /* And says nothing, because it is the view from where you will stand. */
  it('discloses nothing', () => {
    expect(groundViewAim({ at: AT, subject: SUBJECT, cameraBearing: 91.2, air: false }).disclose)
      .toBe(false)
  })
})

/*
 * A TOP-DOWN AND A 360 HAVE NO CAMERA BEARING, by construction. They still get
 * a view, because what is around the subject is the useful part for both.
 */
describe('a shot type with no bearing still gets a view', () => {
  it('falls back to looking at the subject', () => {
    const aim = groundViewAim({ at: AT, subject: SUBJECT, cameraBearing: null, air: false })
    expect(aim.bearing).toBeCloseTo(bearingBetween(AT, SUBJECT), 6)
  })
})

/*
 * NO SUBJECT, NO AIM. "If no usable imagery exists on that bearing, say so
 * rather than showing me something pointing elsewhere." The first thing that
 * rule forbids is pointing somewhere arbitrary when there is nothing to point
 * at, so there is no default bearing anywhere in here.
 */
describe('it never invents a direction', () => {
  it('has no bearing with no subject and no camera bearing', () => {
    const aim = groundViewAim({ at: AT, subject: null, cameraBearing: null, air: true })
    expect(aim.bearing).toBeNull()
    expect(aim.disclose).toBe(false)
  })

  it('never falls back to north', () => {
    for (const air of [true, false]) {
      expect(groundViewAim({ at: AT, subject: null, cameraBearing: null, air }).bearing).not.toBe(0)
    }
  })

  /* And it never moves the camera somewhere else to find imagery. */
  it('always asks from the position', () => {
    for (const subject of [SUBJECT, null]) {
      for (const air of [true, false]) {
        expect(groundViewAim({ at: AT, subject, cameraBearing: null, air }).from).toEqual(AT)
      }
    }
  })
})
