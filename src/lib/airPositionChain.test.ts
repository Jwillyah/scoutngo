import { describe, expect, it } from 'vitest'
import { DEFAULT_KIT, type KitProfile } from '../core/kit.ts'
import { defaultOpticFor, opticsFor } from '../core/optics.ts'
import { defaultSelection, reviveSelection, type KitSelection } from './kitSelection.ts'
/* Whether an air position can be made: an aircraft camera resolves from the bag. */
const droneAvailable = (selection: Parameters<typeof defaultOpticFor>[2], profile: Parameters<typeof defaultOpticFor>[1]) =>
  defaultOpticFor('air', profile, selection) !== null
import { addPosition } from './positions.ts'

/**
 * THE WHOLE CHAIN FROM "DRONE IS SELECTED" TO "THE PICKER LISTS THE AIRCRAFT".
 *
 * WHY THIS FILE EXISTS, AND WHY THE EXISTING PICKER TESTS WERE NOT ENOUGH.
 *
 * The lens list having no drone cameras was reported three times and "fixed"
 * twice. Both fixes were to the picker. The picker was never wrong. Measured in
 * the browser on the third report, with the Drone chip pressed:
 *
 *   chips             Drone=true
 *   ADD BUTTON        "Add position"          (not "Add air position")
 *   position made     ground
 *   optic label       "Lens"
 *   PICKER BUILT FROM Sigma 28-75, Sigma 30mm, Sony 75-300, Sony 200-600, Sony 10-18
 *
 * The picker was listing ground glass because the position was GROUND. It was
 * ground because the decision upstream, "can this platform fly", was answered
 * by counting ids while the decision beside it, "what will it fly with", was
 * answered by resolving them. An id that did not resolve passed the first and
 * failed the second, so the chip offered Air and every Add quietly made ground.
 *
 * So this walks the chain the app walks, in order, and asserts the lists BY
 * CONTENT at the end of it. A test that only checks the picker in isolation
 * passes while the bug is live, which is exactly what happened twice.
 */

const AIRCRAFT = DEFAULT_KIT.drones.flatMap((d) => d.cameras.map((c) => c.name))
const GLASS = DEFAULT_KIT.lenses.map((l) => l.name)

/** The chain: selection -> can it fly -> what with -> what the picker lists. */
function chain(selection: KitSelection, profile: KitProfile = DEFAULT_KIT) {
  const canFly = droneAvailable(selection, profile)
  const optic = defaultOpticFor('air', profile, selection)
  const addsAir = canFly && optic !== null
  const list = addsAir
    ? addPosition([], {
        at: { lat: 37.0869, lon: -76.4746 },
        lensId: optic!.id,
        focalLength: optic!.minFocalLength,
        platform: 'air',
        altitudeFeet: 200,
      })
    : addPosition([], {
        at: { lat: 37.0869, lon: -76.4746 },
        lensId: 'sigma-28-75',
        focalLength: 28,
      })
  const made = list[0]
  return {
    canFly,
    addsAir,
    platform: made.platform,
    offers: opticsFor(made.platform, profile, selection, made.lensId).map((o) => o.name),
  }
}

describe('with the drone in the kit, the Drone chip makes an AIR position', () => {
  const result = chain(defaultSelection(DEFAULT_KIT))

  it('says it can fly', () => {
    expect(result.canFly).toBe(true)
    expect(result.addsAir).toBe(true)
  })

  it('makes a position that is actually air', () => {
    expect(result.platform).toBe('air')
  })

  /* BY CONTENT. The exact list, not "a list exists". */
  it('offers exactly the aircraft cameras', () => {
    expect(result.offers).toEqual(AIRCRAFT)
    expect(result.offers).toEqual(['Air 3S wide', 'Air 3S tele'])
  })

  it('offers none of the ground glass, named one by one', () => {
    for (const name of GLASS) {
      expect(result.offers, `air picker offers "${name}"`).not.toContain(name)
    }
    expect(result.offers).not.toContain('Sigma 28-75 f2.8')
    expect(result.offers).not.toContain('Sony 200-600')
  })
})

describe('a ground position gets the glass and none of the aircraft', () => {
  const selection = defaultSelection(DEFAULT_KIT)
  const offers = opticsFor('ground', DEFAULT_KIT, selection, 'sigma-28-75').map((o) => o.name)

  it('offers exactly the shooter glass', () => {
    expect(offers).toEqual(GLASS)
  })

  it('offers none of the aircraft cameras, named one by one', () => {
    for (const name of AIRCRAFT) {
      expect(offers, `ground picker offers "${name}"`).not.toContain(name)
    }
  })
})

/*
 * THE ACTUAL BUG, PINNED. A selection carrying a drone id the kit does not
 * have. Before the fix: canFly true, optic null, a ground position, ground
 * glass, and nothing on screen saying so.
 */
describe('a drone id the kit does not have cannot offer a flight', () => {
  const stale: KitSelection = {
    ...defaultSelection(DEFAULT_KIT),
    droneIds: ['air-3s'],
  }

  it('is not the real id, which is what made this reachable', () => {
    expect(DEFAULT_KIT.drones.map((d) => d.id)).toContain('dji-air-3s')
    expect(DEFAULT_KIT.drones.map((d) => d.id)).not.toContain('air-3s')
  })

  it('answers "can it fly" and "what with" the same way', () => {
    const result = chain(stale)
    expect(result.canFly).toBe(false)
    expect(defaultOpticFor('air', DEFAULT_KIT, stale)).toBeNull()
    /* Which is the point: the two can no longer disagree. */
    expect(result.canFly).toBe(defaultOpticFor('air', DEFAULT_KIT, stale) !== null)
  })

  /* And it never arrives, because a revived selection drops what cannot resolve. */
  it('is dropped on the way in', () => {
    expect(reviveSelection(stale, DEFAULT_KIT).droneIds).toEqual([])
  })
})

/*
 * AND A DRONE THE SHOOTER ADDED THEMSELVES STILL FLIES. The mirror image: the
 * selection must be revived against the shooter's own profile, not against the
 * shipped one, or adding a drone means losing it on the next reload.
 */
describe('a drone added to the kit by hand flies', () => {
  const mine: KitProfile = {
    ...DEFAULT_KIT,
    drones: [
      ...DEFAULT_KIT.drones,
      {
        id: 'mini-4-pro',
        name: 'DJI Mini 4 Pro',
        weightGrams: 249,
        maxWindMps: null,
        maxWindSource: '',
        notes: 'Added by hand, to prove a shooter own gear survives a reload.',
        cameras: [
          {
            id: 'mini-4-wide',
            name: 'Mini 4 wide',
            equiv35: 24,
            maxAperture: 1.7,
            sensorNote: '1/1.3-inch',
            publishedDiagonalFOV: 82.1,
          },
        ],
      },
    ],
  }
  const selection: KitSelection = { ...defaultSelection(DEFAULT_KIT), droneIds: ['mini-4-pro'] }

  it('survives being revived against the shooter own kit', () => {
    expect(reviveSelection(selection, mine).droneIds).toEqual(['mini-4-pro'])
  })

  it('would have been stripped by reviving against the shipped kit', () => {
    expect(reviveSelection(selection, DEFAULT_KIT).droneIds).toEqual([])
  })

  it('offers its own camera and none of the Air 3S', () => {
    const result = chain(selection, mine)
    expect(result.platform).toBe('air')
    expect(result.offers).toEqual(['Mini 4 wide'])
    expect(result.offers).not.toContain('Air 3S wide')
  })
})
