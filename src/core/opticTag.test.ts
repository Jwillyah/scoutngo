import { describe, expect, it } from 'vitest'
import { DEFAULT_KIT } from './kit.ts'
import { OPTIC_TAG_MAX, opticTag } from './opticTag.ts'

/*
 * THE SHIPPED KIT, SPELLED OUT. These are the tags that will actually appear
 * on the map, so they are asserted literally rather than by a rule: a rule
 * that produced "SIGMA 2" would pass a rule-shaped test.
 */
describe('the shipped kit shortens to something readable', () => {
  const EXPECTED: Record<string, string> = {
    'Sigma 28-75 f2.8': 'SIGMA',
    'Sigma 30mm': 'SIGMA',
    'Sony 75-300': 'SONY',
    'Sony 200-600': 'SONY',
    'Sony 10-18 f4': 'SONY',
    'Air 3S wide': 'AIR 3S',
    'Air 3S tele': 'AIR 3S',
  }

  for (const [name, tag] of Object.entries(EXPECTED)) {
    it(`"${name}" becomes "${tag}"`, () => {
      expect(opticTag(name)).toBe(tag)
    })
  }

  /* Every optic in the kit really is covered above, so none goes untested. */
  it('covers the whole kit', () => {
    const names = [
      ...DEFAULT_KIT.lenses.map((lens) => lens.name),
      ...DEFAULT_KIT.drones.flatMap((drone) => drone.cameras.map((camera) => camera.name)),
    ]
    expect(names.sort()).toEqual(Object.keys(EXPECTED).sort())
  })
})

/*
 * THE FOCAL LENGTH DOES THE DISTINGUISHING, which is what makes it safe to
 * drop the words that would otherwise tell two optics apart. The plate shows
 * tag and focal together, so that pair has to be unique within a platform.
 */
describe('tag plus focal length is unambiguous', () => {
  const plate = (name: string, focal: number) => `${opticTag(name)} ${focal}`

  it('tells the two Sigmas apart', () => {
    expect(plate('Sigma 28-75 f2.8', 28)).not.toBe(plate('Sigma 30mm', 30))
  })

  it('tells the aircraft cameras apart', () => {
    expect(plate('Air 3S wide', 24)).toBe('AIR 3S 24')
    expect(plate('Air 3S tele', 70)).toBe('AIR 3S 70')
  })

  it('keeps every shipped optic distinct on its own platform', () => {
    const ground = DEFAULT_KIT.lenses.map((lens) => plate(lens.name, lens.minFocalLength))
    const air = DEFAULT_KIT.drones.flatMap((drone) =>
      drone.cameras.map((camera) => plate(camera.name, camera.equiv35)),
    )
    expect(new Set(ground).size).toBe(ground.length)
    expect(new Set(air).size).toBe(air.length)
  })
})

describe('it stays short enough for the map', () => {
  it('never exceeds the cap', () => {
    for (const name of ['Canon RF 100-500mm f4.5-7.1 L IS USM', 'Averyverylongbrandname']) {
      expect(opticTag(name).length).toBeLessThanOrEqual(OPTIC_TAG_MAX)
    }
  })

  /* The cap is doing something: a long name really is being cut. */
  it('cuts a long name rather than passing it through', () => {
    expect(opticTag('Averyverylongbrandname')).not.toBe('AVERYVERYLONGBRANDNAME')
    expect(opticTag('Averyverylongbrandname')).toBe('AVERYVE')
  })
})

describe('it invents nothing', () => {
  /* An unnamed optic gets an empty tag, not a made-up one. */
  it('gives an empty name an empty tag', () => {
    expect(opticTag('')).toBe('')
    expect(opticTag('   ')).toBe('')
  })

  /* A name that is nothing BUT a focal length has no brand to show. */
  it('does not fabricate a brand from a bare focal length', () => {
    expect(opticTag('50mm')).toBe('50MM')
  })

  it('keeps a single-word name whole', () => {
    expect(opticTag('Laowa')).toBe('LAOWA')
  })
})
