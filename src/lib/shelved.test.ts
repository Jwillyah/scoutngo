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
import { selectedLenses, selectedOptics } from './planRequest.ts'

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
    expect(selectedLenses(bag).map((l) => l.id)).not.toContain('sony-75-300')
    expect(selectedOptics(bag).map((o) => o.id)).not.toContain('sony-75-300')
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
    expect(first.said).toHaveLength(1)

    /* Removing the lens afterwards sticks: the amendment never runs twice. */
    const removed = { ...first.profile, lenses: first.profile.lenses.filter((l) => l.id !== 'sony-70-200') }
    const second = applyAmendments(removed, [], first.applied)
    expect(second.profile.lenses.map((l) => l.id)).not.toContain('sony-70-200')
    expect(second.said).toEqual([])
  })

  it('invents nothing about the lens it was not told', () => {
    const lens = AMENDMENTS[0].addLenses[0]
    expect(lens).toMatchObject({ minFocalLength: 70, maxFocalLength: 200, maxAperture: null })
  })

  it('does not add a lens that is already there', () => {
    const once = applyAmendments(DEFAULT_KIT, [], []).profile
    const twice = applyAmendments(once, [], []).profile
    expect(twice.lenses.filter((l) => l.id === 'sony-70-200')).toHaveLength(1)
  })
})

/*
 * THE MODEL WAS SENT THE SHIPPED KIT. planRequest read DEFAULT_KIT, so a lens
 * added by hand was in the bag and never offered for a suggested plan.
 */
describe('a suggested plan is offered the shooter\'s own kit', () => {
  it('offers a lens the shooter added', () => {
    const profile = applyAmendments(DEFAULT_KIT, [], []).profile
    const bag = { ...defaultSelection(profile, ['sony-75-300']) }
    expect(selectedLenses(bag, profile).map((l) => l.id)).toContain('sony-70-200')
    expect(selectedOptics(bag, null, profile).map((o) => o.id)).toContain('sony-70-200')
    /* And the shipped default alone could not have: */
    expect(selectedLenses(bag).map((l) => l.id)).not.toContain('sony-70-200')
  })
})
