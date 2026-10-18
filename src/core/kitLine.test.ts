import { describe, expect, it } from 'vitest'
import { DEFAULT_KIT } from './kit.ts'
import { kitLine } from './kitLine.ts'

const ALL = {
  bodyIds: DEFAULT_KIT.bodies.map((b) => b.id),
  lensIds: DEFAULT_KIT.lenses.map((l) => l.id),
  droneIds: DEFAULT_KIT.drones.map((d) => d.id),
}
const ONE_LENS = { ...ALL, lensIds: ['sigma-28-75'], droneIds: [] }
const ONE_DRONE = { ...ALL, lensIds: [], droneIds: [DEFAULT_KIT.drones[0]?.id ?? ''] }

describe('a ground shoot names the glass', () => {
  it('names the lens when there is one', () => {
    expect(kitLine(DEFAULT_KIT, ONE_LENS, 'ground')).toBe('Sigma 28-75 f2.8')
  })

  it('counts them when there are several', () => {
    const line = kitLine(DEFAULT_KIT, { ...ALL, droneIds: [] }, 'ground')
    expect(line).toMatch(/^\d+ lenses$/)
  })

  it('says nothing with no glass packed', () => {
    expect(kitLine(DEFAULT_KIT, { ...ALL, lensIds: [], droneIds: [] }, 'ground')).toBeNull()
  })
})

describe('a drone shoot names the aircraft and its camera', () => {
  /*
   * THE REPORT: the line named a Sigma on a drone shoot. The lens is staying
   * in the bag; the aircraft's camera has one fixed focal length and that pair
   * is what decides every frame.
   */
  it('names the aircraft and the focal length it actually has', () => {
    const line = kitLine(DEFAULT_KIT, ONE_DRONE, 'air')
    expect(line).not.toBeNull()
    expect(line).toContain(DEFAULT_KIT.drones[0].name)
    expect(line).toMatch(/\d+mm/)
  })

  it('never names a lens on an air shoot', () => {
    const line = kitLine(DEFAULT_KIT, ALL, 'air') ?? ''
    for (const lens of DEFAULT_KIT.lenses) {
      expect(line, `named "${lens.name}" on an air shoot`).not.toContain(lens.name)
    }
  })

  /*
   * NOT "nothing", AND NOT THE LENS. With the Drone chip on and no aircraft
   * packed, falling back to the glass is exactly the reported bug.
   */
  it('says nothing rather than falling back to glass', () => {
    expect(kitLine(DEFAULT_KIT, { ...ALL, droneIds: [] }, 'air')).toBeNull()
  })

  it('counts aircraft rather than naming one camera for several', () => {
    const many = DEFAULT_KIT.drones.length
    if (many > 1) {
      expect(kitLine(DEFAULT_KIT, ALL, 'air')).toBe(`${many} aircraft`)
    } else {
      expect(kitLine(DEFAULT_KIT, ALL, 'air')).toContain(DEFAULT_KIT.drones[0].name)
    }
  })
})

describe('both', () => {
  it('leads with the aircraft, then the glass', () => {
    const line = kitLine(DEFAULT_KIT, { ...ONE_DRONE, lensIds: ['sigma-28-75'] }, 'both') ?? ''
    expect(line).toContain(DEFAULT_KIT.drones[0].name)
    expect(line).toContain('Sigma 28-75 f2.8')
    expect(line.indexOf(DEFAULT_KIT.drones[0].name)).toBeLessThan(line.indexOf('Sigma'))
  })

  it('falls back to whichever side is packed', () => {
    expect(kitLine(DEFAULT_KIT, ONE_LENS, 'both')).toBe('Sigma 28-75 f2.8')
    expect(kitLine(DEFAULT_KIT, ONE_DRONE, 'both')).toContain(DEFAULT_KIT.drones[0].name)
  })

  it('says nothing with an empty bag', () => {
    expect(
      kitLine(DEFAULT_KIT, { bodyIds: [], lensIds: [], droneIds: [] }, 'both'),
    ).toBeNull()
  })
})
