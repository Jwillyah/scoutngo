import { describe, expect, it } from 'vitest'
import { DEFAULT_KIT } from '../core/kit.ts'
import { opticsFor, defaultOpticFor } from '../core/optics.ts'
import { applyAmendments, AMENDMENTS } from './kitAmendments.ts'
import {
  defaultSelection,
  gearState,
  pickableKit,
  reviveSelection,
  reviveShelved,
  setShelved,
  withoutShelved,
} from './kitSelection.ts'
import { bagOptics } from './suggestRun.ts'

/*
 * SHELVED: MINE, BUT STOP OFFERING IT. Three states, and the one this file is
 * about is the third: never suggested, never auto-selected, still findable.
 */
const SHELF = ['sony-75-300']

describe('three states for one piece of gear', () => {
  const bag = defaultSelection(DEFAULT_KIT, SHELF)

  it('in the bag, owned, or shelved', () => {
    expect(gearState('sony-200-600', bag, SHELF)).toBe('bag')
    expect(gearState('sony-200-600', { ...bag, lensIds: [] }, SHELF)).toBe('owned')
    expect(gearState('sony-75-300', bag, SHELF)).toBe('shelved')
  })

  it('is never auto-selected: a first run and a reset leave it out', () => {
    expect(bag.lensIds).not.toContain('sony-75-300')
    expect(bag.lensIds).toContain('sony-200-600')
  })

  /*
   * A SAVED SPOT IS THE TRAP. It carries the selection of the day it was
   * saved, with the 75-300 ticked. Loading it must not take it off the shelf.
   */
  it('a spot saved with it ticked does not put it back in the bag', () => {
    const fromSpot = reviveSelection(defaultSelection(DEFAULT_KIT), DEFAULT_KIT, SHELF)
    expect(fromSpot.lensIds).not.toContain('sony-75-300')
  })

  it('never appears in what the position card offers or the model is sent', () => {
    expect(opticsFor('ground', DEFAULT_KIT, bag).map((o) => o.id)).not.toContain('sony-75-300')
    expect(bagOptics(DEFAULT_KIT, bag).map((o) => o.id)).not.toContain('sony-75-300')
    expect(defaultOpticFor('ground', DEFAULT_KIT, bag)?.id).not.toBe('sony-75-300')
  })

  it('is left out of the pickers but kept in the profile, which is how it stays findable', () => {
    expect(pickableKit(DEFAULT_KIT, SHELF).lenses.map((l) => l.id)).not.toContain('sony-75-300')
    expect(DEFAULT_KIT.lenses.map((l) => l.id)).toContain('sony-75-300')
  })

  it('unshelving returns it to owned, not to the bag', () => {
    const shelf = setShelved(SHELF, 'sony-75-300', false)
    expect(shelf).toEqual([])
    expect(gearState('sony-75-300', bag, shelf)).toBe('owned')
  })

  it('stripping is what every write of the bag does', () => {
    expect(withoutShelved(defaultSelection(DEFAULT_KIT), SHELF).lensIds).not.toContain('sony-75-300')
  })

  it('forgets a shelved id for gear that no longer exists', () => {
    expect(reviveShelved(['sony-75-300', 'gone-lens', 4], DEFAULT_KIT)).toEqual(['sony-75-300'])
  })
})

describe('the amendment asked for by name', () => {
  it('adds the Sony 70-200 and shelves the Sony 75-300, once', () => {
    const first = applyAmendments(DEFAULT_KIT, [], [])
    expect(first.profile.lenses.map((l) => l.id)).toContain('sony-70-200')
    expect(first.shelved).toEqual(['sony-75-300'])
    expect(first.said).toEqual([
      'Added the Sony 70-200 and shelved the Sony 75-300, as asked on 25 October.',
      'Added the Sony a6300, as asked on 25 October.',
    ])

    /* Removing the lens afterwards sticks: the amendment never runs twice. */
    const removed = { ...first.profile, lenses: first.profile.lenses.filter((l) => l.id !== 'sony-70-200') }
    const second = applyAmendments(removed, [], first.applied)
    expect(second.profile.lenses.map((l) => l.id)).not.toContain('sony-70-200')
    expect(second.said).toEqual([])
  })

  it('adds the lens as named: the f/2.8 GM II', () => {
    const lens = AMENDMENTS[0].addLenses[0]
    expect(lens).toMatchObject({ name: 'Sony 70-200 f2.8 GM II', minFocalLength: 70, maxFocalLength: 200, maxAperture: 2.8 })
  })

  /*
   * THE PHONE THAT ALREADY HAS IT. The first amendment ran there with no
   * aperture; the second corrects that lens in place and touches nothing else.
   */
  it('corrects the 70-200 already on a phone from the first amendment', () => {
    const before = {
      ...DEFAULT_KIT,
      lenses: [
        ...DEFAULT_KIT.lenses,
        { id: 'sony-70-200', name: 'Sony 70-200', minFocalLength: 70, maxFocalLength: 200, maxAperture: null, forcesSensor: [], notes: '' },
      ],
    }
    const after = applyAmendments(before, ['sony-75-300'], [AMENDMENTS[0].id, '2026-10-25-sony-a6300'])
    expect(after.profile.lenses.find((l) => l.id === 'sony-70-200')).toMatchObject({
      name: 'Sony 70-200 f2.8 GM II',
      maxAperture: 2.8,
    })
    expect(after.profile.lenses.filter((l) => l.id !== 'sony-70-200')).toEqual(DEFAULT_KIT.lenses)
    expect(after.shelved).toEqual(['sony-75-300'])
    expect(after.said).toEqual(['The 70-200 is the f/2.8 GM II, as you said on 26 October.'])
  })

  it('leaves a kit alone where the 70-200 was since removed', () => {
    const after = applyAmendments(DEFAULT_KIT, [], [AMENDMENTS[0].id])
    expect(after.profile.lenses.map((l) => l.id)).not.toContain('sony-70-200')
  })

  it('does not add a lens that is already there', () => {
    const once = applyAmendments(DEFAULT_KIT, [], []).profile
    const twice = applyAmendments(once, [], []).profile
    expect(twice.lenses.filter((l) => l.id === 'sony-70-200')).toHaveLength(1)
  })
})

/*
 * SUGGEST WORKS FROM THE SHOOTER'S OWN KIT. The model request it replaced read
 * DEFAULT_KIT, so a lens added by hand was never offered; Suggest's optics come
 * from the live profile and the bag, and shelved gear never reaches it.
 */
describe('Suggest is given the shooter\'s own kit', () => {
  it('offers a lens the shooter added, and nothing shelved', () => {
    const profile = applyAmendments(DEFAULT_KIT, [], []).profile
    const bag = defaultSelection(profile, ['sony-75-300'])
    const ids = bagOptics(profile, bag).map((o) => o.id)
    expect(ids).toContain('sony-70-200')
    expect(ids).not.toContain('sony-75-300')
  })
})

/*
 * THE KIT AS THE BRIEF NAMES IT. "Bodies a7IV, a7III, a6300; lenses 70-200
 * f/2.8 GM II, Sigma 28-75 f/2.8, Sigma 30mm, Sony 10-18 f/4, 200-600; 75-300
 * shelved." What is in the bag after every amendment, on a fresh phone.
 */
describe('the kit the brief names', () => {
  const { profile, shelved } = applyAmendments(DEFAULT_KIT, [], [])
  const active = <T extends { id: string }>(list: T[]) => list.filter((g) => !shelved.includes(g.id)).map((g) => g.id).sort()

  it('has the three bodies and the five lenses, and the 75-300 on the shelf', () => {
    expect(active(profile.bodies)).toEqual(['a6300', 'a7iii', 'a7iv'])
    expect(active(profile.lenses)).toEqual(['sigma-28-75', 'sigma-30', 'sony-10-18', 'sony-200-600', 'sony-70-200'])
    expect(shelved).toEqual(['sony-75-300'])
  })

  it('adds the a6300 as an APS-C body with its own pixel count', () => {
    expect(profile.bodies.find((b) => b.id === 'a6300')).toMatchObject({ sensor: 'apsc', horizontalPixels: 6000, verticalPixels: 4000 })
  })

  it('adds it once: a phone that removed it keeps it removed', () => {
    const first = applyAmendments(DEFAULT_KIT, [], [])
    const removed = { ...first.profile, bodies: first.profile.bodies.filter((b) => b.id !== 'a6300') }
    expect(applyAmendments(removed, first.shelved, first.applied).profile.bodies.map((b) => b.id)).not.toContain('a6300')
  })
})

/*
 * THE PHONE THE FIX IS FOR: a stored kit with the a7IV and the a6300 but no
 * a7III, every earlier amendment already applied. DEFAULT_KIT has the a7III,
 * and that is exactly why a fresh-phone test could not see this gap.
 */
describe('the a7III on a phone that never had it', () => {
  const earlier = AMENDMENTS.filter((a) => a.id !== '2026-10-25-sony-a7iii').map((a) => a.id)
  const stored = {
    ...DEFAULT_KIT,
    bodies: [DEFAULT_KIT.bodies[0], { id: 'a6300', name: 'Sony a6300', role: 'photo' as const, sensor: 'apsc' as const, horizontalPixels: 6000, verticalPixels: 4000, notes: '' }],
  }
  const after = applyAmendments(stored, [], earlier)

  it('puts it in as the photo body, between the a7IV and the a6300', () => {
    expect(after.profile.bodies.map((b) => b.id)).toEqual(['a7iv', 'a7iii', 'a6300'])
    expect(after.said).toEqual(['Added the Sony a7III as the photo body, as asked on 25 October.'])
  })

  it('with the spec table figures: full frame, 6000 x 4000', () => {
    expect(after.profile.bodies.find((b) => b.id === 'a7iii')).toMatchObject({ role: 'photo', sensor: 'fullFrame', horizontalPixels: 6000, verticalPixels: 4000 })
  })

  it('is the same record DEFAULT_KIT seeds', () => {
    expect(AMENDMENTS.find((a) => a.id === '2026-10-25-sony-a7iii')?.addBodies).toEqual([DEFAULT_KIT.bodies.find((b) => b.id === 'a7iii')])
  })

  it('says nothing on a phone that already has it', () => {
    expect(applyAmendments(DEFAULT_KIT, [], earlier).said).toEqual([])
  })
})
