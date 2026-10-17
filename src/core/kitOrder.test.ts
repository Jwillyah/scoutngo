import { describe, expect, it } from 'vitest'
import { DEFAULT_KIT } from './kit.ts'
import { kitRowOrder } from './kitOrder.ts'

const names = (filter: 'air' | 'ground' | 'both') =>
  kitRowOrder(filter, DEFAULT_KIT).map((e) => e.name)

/*
 * "With Drone selected, Air 3S is last and off the right edge. Whatever the
 * chip packed goes first."
 */
describe('the packed gear leads the row', () => {
  it('puts the aircraft first on a drone shoot', () => {
    expect(names('air')[0]).toBe('DJI Air 3S')
  })

  it('puts the bodies first on a ground shoot', () => {
    expect(names('ground')[0]).toBe(DEFAULT_KIT.bodies[0].name)
    expect(names('ground').at(-1)).toBe('DJI Air 3S')
  })

  it('leaves profile order alone on Both, which has not committed', () => {
    expect(names('both')).toEqual([
      ...DEFAULT_KIT.bodies.map((b) => b.name),
      ...DEFAULT_KIT.lenses.map((l) => l.name),
      ...DEFAULT_KIT.drones.map((d) => d.name),
    ])
  })
})

/*
 * NOTHING IS HIDDEN. The shooter who wants a body on a drone shoot has to be
 * able to reach it; that is what the holds exist for.
 */
describe('reordering never drops anything', () => {
  for (const filter of ['air', 'ground', 'both'] as const) {
    it(`keeps every item on ${filter}`, () => {
      const out = kitRowOrder(filter, DEFAULT_KIT)
      expect(out).toHaveLength(
        DEFAULT_KIT.bodies.length + DEFAULT_KIT.lenses.length + DEFAULT_KIT.drones.length,
      )
      expect(new Set(out.map((e) => e.id)).size).toBe(out.length)
    })
  }

  it('keeps the unpacked gear in its own order behind the packed', () => {
    const air = names('air')
    const tail = air.slice(DEFAULT_KIT.drones.length)
    expect(tail).toEqual([
      ...DEFAULT_KIT.bodies.map((b) => b.name),
      ...DEFAULT_KIT.lenses.map((l) => l.name),
    ])
  })
})
