import { describe, expect, it } from 'vitest'
import { canPackAir } from './kitPacking.ts'
import { DEFAULT_KIT } from './kit.ts'

/*
 * WHAT IS LEFT TO TEST, AND WHAT WENT WITH THE PACKING RULE.
 *
 * This file used to test packForPlatform and the holds that protected a hand
 * tick from it. Both are gone: a view filter writing to the kit is what made
 * the platform control one-way, and the rule now is that it never does. The
 * tests went with the behaviour rather than being left to describe code
 * nobody calls.
 */
describe('canPackAir', () => {
  it('is true when the profile owns an aircraft with a camera', () => {
    expect(canPackAir(DEFAULT_KIT)).toBe(true)
  })

  it('is false with no drones at all', () => {
    expect(canPackAir({ ...DEFAULT_KIT, drones: [] })).toBe(false)
  })

  it('is false when a drone carries no camera, because it cannot shoot', () => {
    const blind = DEFAULT_KIT.drones.map((d) => ({ ...d, cameras: [] }))
    expect(canPackAir({ ...DEFAULT_KIT, drones: blind })).toBe(false)
  })

  /*
   * THE PROPERTY THE ONE-WAY BUG VIOLATED. Owning a drone is a fact about the
   * bag. Nothing about what is currently ticked can change it, which is why
   * the AIR segment asks this and not the selection.
   */
  it('does not depend on any selection, because nothing can be passed to it', () => {
    expect(canPackAir.length).toBe(1)
    expect(canPackAir(DEFAULT_KIT)).toBe(canPackAir(DEFAULT_KIT))
  })
})
