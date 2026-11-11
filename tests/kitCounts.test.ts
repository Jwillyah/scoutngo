import { describe, expect, it } from 'vitest'
import { DEFAULT_KIT, kitCounts } from '../src/core/kit.ts'

/* Batch Polish, Section 4: the menu's Kit row, "1 camera · 3 lenses · Air 3S". */
describe('the Kit row', () => {
  it('counts the cameras and the lenses, and names the drone in the bag (or the first)', () => {
    const k = { ...DEFAULT_KIT, bodies: DEFAULT_KIT.bodies.slice(0, 1), lenses: DEFAULT_KIT.lenses.slice(0, 3) }
    const drone = k.drones[0]
    expect(kitCounts(k, drone === undefined ? [] : [drone.id])).toBe(`1 camera · 3 lenses${drone === undefined ? '' : ` · ${drone.name.replace(/^DJI /, '')}`}`)
  })
  it('one lens is "lens"; an empty kit says so', () => {
    expect(kitCounts({ ...DEFAULT_KIT, bodies: [], lenses: DEFAULT_KIT.lenses.slice(0, 1), drones: [] }, [])).toBe('1 lens')
    expect(kitCounts({ ...DEFAULT_KIT, bodies: [], lenses: [], drones: [] }, [])).toBe('Nothing in the bag')
  })
})

describe('every lens picker offers the whole kit (Batch Polish, Section 4)', () => {
  it('the bag first, then the rest; nothing left out, nothing twice', async () => {
    const { bagFirst } = await import('../src/core/kit.ts')
    const all = DEFAULT_KIT.lenses
    const bag = all.slice(-1).map((l) => l.id)
    const out = bagFirst(all, bag)
    expect(out.length).toBe(all.length)
    expect(new Set(out.map((l) => l.id)).size).toBe(all.length)
    expect(out[0].id).toBe(bag[0])
  })
})
