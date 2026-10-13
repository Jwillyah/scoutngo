import { describe, expect, it } from 'vitest'
import { computeFOV, SENSORS } from './fov.ts'
import { DEFAULT_KIT, resolveSensor } from './kit.ts'
import {
  addBody,
  addDrone,
  addLens,
  hasFieldErrors,
  kitId,
  parseFocalList,
  removeLens,
  validateBody,
  validateDrone,
  validateLens,
} from './kitEdit.ts'

const GM2 = { name: 'Sony 70-200 GM II', minFocalLength: '70', maxFocalLength: '200', apscOnly: false }

describe('adding the lens that prompted this', () => {
  it('adds a 70-200 and makes it usable', () => {
    expect(hasFieldErrors(validateLens(GM2))).toBe(false)
    const kit = addLens(DEFAULT_KIT, GM2)
    const lens = kit.lenses.at(-1)!
    expect(lens.name).toBe('Sony 70-200 GM II')
    expect(lens.minFocalLength).toBe(70)
    expect(lens.maxFocalLength).toBe(200)
    expect(kit.lenses).toHaveLength(DEFAULT_KIT.lenses.length + 1)
  })

  /* The whole point: the numbers downstream have to come out of it. */
  it('computes a real field of view from what was typed', () => {
    const kit = addLens(DEFAULT_KIT, GM2)
    const lens = kit.lenses.at(-1)!
    const sensor = SENSORS[resolveSensor(lens, kit.bodies)]
    expect(computeFOV(lens.maxFocalLength, sensor).hFOV).toBeCloseTo(10.3, 1)
  })

  it('leaves the original kit alone', () => {
    const before = DEFAULT_KIT.lenses.length
    addLens(DEFAULT_KIT, GM2)
    expect(DEFAULT_KIT.lenses).toHaveLength(before)
  })
})

describe('validateLens', () => {
  it('wants a name', () => {
    expect(validateLens({ ...GM2, name: '   ' }).name).toBeDefined()
  })

  /*
   * A reversed range computes a negative span everywhere it is used, and
   * nothing downstream checks for it because nothing downstream should have to.
   */
  it('refuses a range entered backwards', () => {
    const errors = validateLens({ ...GM2, minFocalLength: '200', maxFocalLength: '70' })
    expect(errors.maxFocalLength).toMatch(/cannot be shorter/)
  })

  /* A prime is min === max, and that is legitimate. */
  it('accepts a prime', () => {
    expect(hasFieldErrors(validateLens({ ...GM2, name: 'Sigma 30mm', minFocalLength: '30', maxFocalLength: '30' }))).toBe(false)
  })

  it('refuses a blank, a word and an absurd number', () => {
    expect(validateLens({ ...GM2, minFocalLength: '' }).minFocalLength).toBeDefined()
    expect(validateLens({ ...GM2, minFocalLength: 'wide' }).minFocalLength).toBeDefined()
    expect(validateLens({ ...GM2, maxFocalLength: '99999' }).maxFocalLength).toBeDefined()
    expect(validateLens({ ...GM2, minFocalLength: '0' }).minFocalLength).toBeDefined()
  })
})

/* An APS-C lens only covers a crop circle, so it is cropped on every body. */
describe('an APS-C lens', () => {
  it('is cropped whatever is in the bag', () => {
    const kit = addLens(DEFAULT_KIT, { ...GM2, name: 'Sigma 18-50 f2.8', minFocalLength: '18', maxFocalLength: '50', apscOnly: true })
    const lens = kit.lenses.at(-1)!
    expect(resolveSensor(lens, kit.bodies)).toBe('apsc')
    expect(resolveSensor(lens, [])).toBe('apsc')
  })

  it('narrows the frame against the same lens on full frame', () => {
    const kit = addLens(DEFAULT_KIT, { ...GM2, apscOnly: true })
    const cropped = computeFOV(70, SENSORS[resolveSensor(kit.lenses.at(-1)!, kit.bodies)])
    expect(cropped.hFOV).toBeLessThan(computeFOV(70, SENSORS.fullFrame).hFOV)
  })
})

describe('bodies', () => {
  it('adds one with its sensor', () => {
    const kit = addBody(DEFAULT_KIT, { name: 'Sony a6700', sensor: 'apsc' })
    expect(kit.bodies.at(-1)).toMatchObject({ name: 'Sony a6700', sensor: 'apsc' })
  })

  it('wants a name and a real sensor', () => {
    expect(validateBody({ name: '', sensor: 'apsc' }).name).toBeDefined()
    expect(validateBody({ name: 'x', sensor: 'medium' as never }).sensor).toBeDefined()
  })
})

describe('drones', () => {
  const MINI = { name: 'DJI Mini 4 Pro', weightGrams: '249', focalLengths: '24' }

  it('adds one, with a fixed camera per focal length', () => {
    const kit = addDrone(DEFAULT_KIT, { ...MINI, focalLengths: '24, 70' })
    const drone = kit.drones.at(-1)!
    expect(drone.weightGrams).toBe(249)
    expect(drone.cameras.map((c) => c.equiv35)).toEqual([24, 70])
    expect(new Set(drone.cameras.map((c) => c.id)).size).toBe(2)
  })

  /* Weight is not decoration: the FAA category over people turns on it. */
  it('insists on a weight', () => {
    expect(validateDrone({ ...MINI, weightGrams: '' }).weightGrams).toMatch(/FAA/)
    expect(validateDrone({ ...MINI, weightGrams: '2' }).weightGrams).toBeDefined()
  })

  it('insists on at least one focal length, and refuses junk', () => {
    expect(validateDrone({ ...MINI, focalLengths: '' }).focalLengths).toBeDefined()
    expect(validateDrone({ ...MINI, focalLengths: 'wide, tele' }).focalLengths).toBeDefined()
    expect(validateDrone({ ...MINI, focalLengths: '24,35,50,70,85' }).focalLengths).toBeDefined()
  })

  it('reads a comma list tolerantly', () => {
    expect(parseFocalList(' 24 , 70 ,, ')).toEqual([24, 70])
  })
})

describe('kitId', () => {
  it('slugs a name', () => {
    expect(kitId('lens', 'Sony 70-200 GM II', [])).toBe('lens-sony-70-200-gm-ii')
  })

  /* Two lenses with the same name must not become the same lens. */
  it('never collides', () => {
    const first = kitId('lens', 'Sony 70-200', [])
    const second = kitId('lens', 'Sony 70-200', [first])
    expect(second).not.toBe(first)
  })

  it('survives a name with nothing sluggable in it', () => {
    expect(kitId('lens', '!!!', [])).toBe('lens-item')
  })
})

/*
 * Removing is unconditional. Blocking it because an old plan references the
 * lens would make the kit un-editable for the exact reason someone edits it.
 */
describe('removing', () => {
  it('removes a lens without asking', () => {
    const kit = removeLens(DEFAULT_KIT, DEFAULT_KIT.lenses[0].id)
    expect(kit.lenses).toHaveLength(DEFAULT_KIT.lenses.length - 1)
  })

  it('ignores an id that is not there', () => {
    expect(removeLens(DEFAULT_KIT, 'nope').lenses).toHaveLength(DEFAULT_KIT.lenses.length)
  })
})
