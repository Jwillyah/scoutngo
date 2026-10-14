import { describe, expect, it } from 'vitest'
import { MAX_ALTITUDE_FEET, MIN_ALTITUDE_FEET } from '../core/air.ts'
import type { CameraPosition } from './plan.ts'
import {
  addPosition,
  duplicatePosition,
  MAX_POSITIONS,
  movePosition,
  removePosition,
  renumber,
  setAltitude,
  setOptic,
} from './positions.ts'

const AT = { lat: 38.3648, lon: -75.6059 }
const make = (n: number): CameraPosition[] => {
  let list: CameraPosition[] = []
  for (let i = 0; i < n; i++) {
    list = addPosition(list, { at: AT, lensId: 'sony-200-600', focalLength: 400 })
  }
  return list
}

describe('addPosition', () => {
  it('places where the shooter tapped, with the glass they picked', () => {
    const [one] = addPosition([], { at: AT, lensId: 'sigma-28-75', focalLength: 35 })
    expect(one.at).toEqual(AT)
    expect(one.lensId).toBe('sigma-28-75')
    expect(one.focalLength).toBe(35)
    expect(one.origin).toBe('manual')
    expect(one.number).toBe(1)
  })

  /*
   * The prose stays empty. The shot text is the one thing a model ever writes,
   * and inventing "Position 4" here puts words on a card that read like a plan
   * and mean nothing.
   */
  it('invents no words', () => {
    const [one] = addPosition([], { at: AT, lensId: 'x', focalLength: 50 })
    expect(one.shot).toBe('')
    expect(one.risk).toBe('')
    expect(one.angleRationale).toBe('')
    expect(one.coversShot).toBeNull()
  })

  it('gives every position its own id', () => {
    const list = make(5)
    expect(new Set(list.map((p) => p.id)).size).toBe(5)
  })

  it('rounds a focal length, because a lens has no half millimetres', () => {
    const [one] = addPosition([], { at: AT, lensId: 'x', focalLength: 137.4 })
    expect(one.focalLength).toBe(137)
  })

  it('stops at a plan nobody would read in the field', () => {
    const full = make(MAX_POSITIONS)
    expect(addPosition(full, { at: AT, lensId: 'x', focalLength: 50 })).toHaveLength(
      MAX_POSITIONS,
    )
  })
})

describe('renumber', () => {
  /* The badge is "the third one in the list", so it follows the list. */
  it('keeps badges 1..n in order after every change', () => {
    const list = removePosition(make(4), make(4)[0].id)
    expect(renumber(list).map((p) => p.number)).toEqual([1, 2, 3, 4])
  })

  it('renumbers after a real removal', () => {
    const list = make(4)
    const after = removePosition(list, list[1].id)
    expect(after.map((p) => p.number)).toEqual([1, 2, 3])
    expect(after.map((p) => p.id)).toEqual([list[0].id, list[2].id, list[3].id])
  })
})

describe('duplicatePosition', () => {
  /* Standing in one place and asking what 200mm does instead of 600mm. */
  it('copies the spot, lands next to the original, and takes a new id', () => {
    const list = make(3)
    const after = duplicatePosition(list, list[0].id)
    expect(after).toHaveLength(4)
    expect(after[1].at).toEqual(list[0].at)
    expect(after[1].id).not.toBe(list[0].id)
    expect(after.map((p) => p.number)).toEqual([1, 2, 3, 4])
  })

  /* A copy is a decision, whatever it was copied from. */
  it('is manual even when the original was suggested', () => {
    const suggested = addPosition([], {
      at: AT, lensId: 'x', focalLength: 50, origin: 'suggested',
    })
    expect(duplicatePosition(suggested, suggested[0].id)[1].origin).toBe('manual')
  })

  it('does nothing for an id that is not there', () => {
    const list = make(2)
    expect(duplicatePosition(list, 'nope')).toEqual(list)
  })
})

describe('movePosition', () => {
  it('moves one through the list and renumbers', () => {
    const list = make(3)
    const after = movePosition(list, list[2].id, -1)
    expect(after.map((p) => p.id)).toEqual([list[0].id, list[2].id, list[1].id])
    expect(after.map((p) => p.number)).toEqual([1, 2, 3])
  })

  /* The ends are ends, not wrap-arounds. */
  it('refuses to move past either end', () => {
    const list = make(3)
    expect(movePosition(list, list[0].id, -1)).toEqual(list)
    expect(movePosition(list, list[2].id, 1)).toEqual(list)
  })
})

describe('setOptic', () => {
  it('changes the glass and leaves the spot alone', () => {
    const list = make(2)
    const after = setOptic(list, list[1].id, 'sigma-28-75', 70)
    expect(after[1].lensId).toBe('sigma-28-75')
    expect(after[1].focalLength).toBe(70)
    expect(after[1].at).toEqual(list[1].at)
    expect(after[0]).toEqual(list[0])
  })
})

/*
 * ALTITUDE IS NOW A NUMBER THAT MATTERS.
 *
 * It used to be printed and nothing else. It is in the geometry now, so the
 * edit path is clamped the same way the model's answer is clamped: see
 * src/core/air.ts for what reading it as zero was getting wrong.
 */
describe('setAltitude', () => {
  const air = (over: Partial<CameraPosition> = {}) =>
    addPosition([], { at: AT, lensId: 'air-3s-wide', focalLength: 24, platform: 'air', altitudeFeet: 200 })
      .map((p) => ({ ...p, ...over }))

  it('changes how high an air position flies', () => {
    const list = air()
    expect(setAltitude(list, list[0].id, 320)[0].altitudeFeet).toBe(320)
  })

  it('caps at the Part 107 limit, whatever is typed', () => {
    const list = air()
    expect(setAltitude(list, list[0].id, 1200)[0].altitudeFeet).toBe(MAX_ALTITUDE_FEET)
  })

  it('will not put an air position on the ground', () => {
    const list = air()
    expect(setAltitude(list, list[0].id, 0)[0].altitudeFeet).toBe(MIN_ALTITUDE_FEET)
  })

  /*
   * An altitude on something standing on the ground is not a number, it is a
   * contradiction, so it is refused rather than stored and ignored.
   */
  it('leaves a ground position alone', () => {
    const ground = addPosition([], { at: AT, lensId: 'sony-200-600', focalLength: 400 })
    const after = setAltitude(ground, ground[0].id, 300)
    expect(after[0].altitudeFeet).toBe(0)
  })

  it('touches no other position', () => {
    const two = addPosition(
      addPosition([], { at: AT, lensId: 'air-3s-wide', focalLength: 24, platform: 'air' }),
      { at: AT, lensId: 'air-3s-wide', focalLength: 24, platform: 'air' },
    )
    const after = setAltitude(two, two[0].id, 350)
    expect(after[0].altitudeFeet).toBe(350)
    expect(after[1].altitudeFeet).toBe(two[1].altitudeFeet)
  })
})
