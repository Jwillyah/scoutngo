import { describe, expect, it } from 'vitest'
import { DEFAULT_KIT } from './kit.ts'
import {
  defaultOpticFor,
  focalOn,
  opticFitsPlatform,
  opticsFor,
  platformOptics,
  type OpticSelection,
} from './optics.ts'

const ALL: OpticSelection = {
  lensIds: DEFAULT_KIT.lenses.map((l) => l.id),
  droneIds: DEFAULT_KIT.drones.map((d) => d.id),
}
const names = (platform: 'ground' | 'air', selection = ALL, current?: string) =>
  opticsFor(platform, DEFAULT_KIT, selection, current).map((optic) => optic.id)

/*
 * THE REPORTED BUG, as an assertion. A drone position offered five pieces of
 * ground glass and displayed "Sigma 28-75 f2.8" at 28mm, because its real
 * optic id was not among the options and a select with no matching option
 * shows its first.
 */
describe('an air position shoots with the aircraft and nothing else', () => {
  it('offers the Air 3S cameras', () => {
    expect(names('air')).toEqual(['air-3s-wide', 'air-3s-tele'])
  })

  it('offers no ground glass at all', () => {
    for (const id of names('air')) {
      expect(DEFAULT_KIT.lenses.some((lens) => lens.id === id)).toBe(false)
    }
    expect(names('air')).not.toContain('sigma-28-75')
    expect(names('air')).not.toContain('sony-200-600')
  })

  it('reports the cameras as primes, because they are', () => {
    for (const optic of opticsFor('air', DEFAULT_KIT, ALL)) {
      expect(optic.minFocalLength).toBe(optic.maxFocalLength)
      expect(optic.kind).toBe('drone')
    }
  })
})

describe('a ground position shoots with the glass and nothing else', () => {
  it('offers the packed lenses', () => {
    expect(names('ground')).toEqual(DEFAULT_KIT.lenses.map((l) => l.id))
  })

  it('offers no aircraft camera', () => {
    const cameras = DEFAULT_KIT.drones.flatMap((d) => d.cameras.map((c) => c.id))
    expect(cameras.length).toBeGreaterThan(0)
    for (const id of cameras) expect(names('ground')).not.toContain(id)
  })
})

/*
 * THE INVARIANT THE PICKER DEPENDS ON: the value is always one of the options.
 * Without it, a select displays a name that is not the position's optic, which
 * is how a Sigma came to stand in for a Mavic.
 */
describe('the held optic is always among the options', () => {
  const PACKED: OpticSelection = { lensIds: ['sigma-28-75'], droneIds: [] }

  it('includes a lens that is on the position but not packed for the shoot', () => {
    expect(names('ground', PACKED, 'sony-200-600')).toEqual(['sony-200-600', 'sigma-28-75'])
  })

  it('includes an aircraft camera even with no aircraft packed', () => {
    expect(names('air', PACKED, 'air-3s-tele')).toEqual(['air-3s-tele'])
  })

  /*
   * EXCEPT an optic the platform cannot carry, which is not quietly added: an
   * aircraft that cannot mount the lens must not have a row claiming it does.
   */
  it('does not add a ground lens to an air position to satisfy the invariant', () => {
    expect(names('air', ALL, 'sigma-28-75')).toEqual(['air-3s-wide', 'air-3s-tele'])
  })
})

describe('opticFitsPlatform is the membership test', () => {
  it('knows which way round the gear goes', () => {
    expect(opticFitsPlatform('air', DEFAULT_KIT, 'air-3s-wide')).toBe(true)
    expect(opticFitsPlatform('air', DEFAULT_KIT, 'sigma-28-75')).toBe(false)
    expect(opticFitsPlatform('ground', DEFAULT_KIT, 'sigma-28-75')).toBe(true)
    expect(opticFitsPlatform('ground', DEFAULT_KIT, 'air-3s-wide')).toBe(false)
  })

  it('refuses an id that is in no kit at all', () => {
    expect(opticFitsPlatform('ground', DEFAULT_KIT, 'nikon-nothing')).toBe(false)
    expect(opticFitsPlatform('air', DEFAULT_KIT, 'nikon-nothing')).toBe(false)
  })

  /* It tests the platform's full capability, not the shoot's packing list. */
  it('does not depend on what is packed', () => {
    expect(platformOptics('air', DEFAULT_KIT).map((o) => o.id)).toEqual([
      'air-3s-wide',
      'air-3s-tele',
    ])
  })
})

describe('focalOn holds what the optic can produce', () => {
  const sigma = platformOptics('ground', DEFAULT_KIT).find((o) => o.id === 'sigma-28-75')!
  const tele = platformOptics('air', DEFAULT_KIT).find((o) => o.id === 'air-3s-tele')!

  it('keeps a focal length the lens covers', () => {
    expect(focalOn(sigma, 50)).toBe(50)
  })

  it('clamps to the ends rather than refusing', () => {
    expect(focalOn(sigma, 300)).toBe(75)
    expect(focalOn(sigma, 4)).toBe(28)
  })

  /*
   * A DRONE CAMERA HAS ONE FOCAL LENGTH. 45mm on an Air 3S is a shot the
   * aircraft cannot take, and the published figure wins over the request.
   */
  it('gives a drone camera its published focal length whatever is asked', () => {
    expect(focalOn(tele, 45)).toBe(70)
    expect(focalOn(tele, 200)).toBe(70)
    expect(tele.minFocalLength).toBe(70)
  })
})

describe('defaultOpticFor is what a new position starts on', () => {
  it('starts an air position on an aircraft camera', () => {
    expect(defaultOpticFor('air', DEFAULT_KIT, ALL)?.id).toBe('air-3s-wide')
  })

  it('starts a ground position on packed glass', () => {
    expect(defaultOpticFor('ground', DEFAULT_KIT, { lensIds: ['sony-200-600'], droneIds: [] })?.id)
      .toBe('sony-200-600')
  })

  /* Null, not a made-up optic: with no aircraft there is no air position. */
  it('is null when the platform has nothing packed', () => {
    expect(defaultOpticFor('air', DEFAULT_KIT, { lensIds: [], droneIds: [] })).toBeNull()
    expect(defaultOpticFor('ground', DEFAULT_KIT, { lensIds: [], droneIds: [] })).toBeNull()
  })
})
