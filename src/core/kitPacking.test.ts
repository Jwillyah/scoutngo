import { describe, expect, it } from 'vitest'
import { DEFAULT_KIT } from './kit.ts'
import {
  canPackAir,
  holdToggle,
  NO_HOLDS,
  packForPlatform,
  packingLine,
  type PackedIds,
} from './kitPacking.ts'

const ALL: PackedIds = {
  bodyIds: DEFAULT_KIT.bodies.map((b) => b.id),
  lensIds: DEFAULT_KIT.lenses.map((l) => l.id),
  droneIds: DEFAULT_KIT.drones.map((d) => d.id),
}

const pack = (filter: 'air' | 'ground' | 'both', holds = NO_HOLDS, from = ALL) =>
  packForPlatform(filter, DEFAULT_KIT, from, holds)

/*
 * WHAT WAS REPORTED. "Drone selected, and the kit row has a7IV, a7III, 28-75
 * and 200-600 all ticked."
 */
describe('the Drone chip packs the aircraft and nothing else', () => {
  const packed = pack('air')

  it('packs every aircraft', () => {
    expect(packed.droneIds).toEqual(ALL.droneIds)
    expect(packed.droneIds.length).toBeGreaterThan(0)
  })

  it('unticks the bodies and the glass, by name', () => {
    expect(packed.bodyIds).toEqual([])
    expect(packed.lensIds).toEqual([])
    /* The four the report named. */
    for (const id of ['a7iv', 'a7iii', 'sigma-28-75', 'sony-200-600']) {
      expect([...packed.bodyIds, ...packed.lensIds], id).not.toContain(id)
    }
  })
})

describe('the Ground chip does the reverse', () => {
  const packed = pack('ground')

  it('packs the bodies and the glass', () => {
    expect(packed.bodyIds).toEqual(ALL.bodyIds)
    expect(packed.lensIds).toEqual(ALL.lensIds)
  })

  it('leaves the aircraft behind', () => {
    expect(packed.droneIds).toEqual([])
  })
})

/*
 * BOTH HAS NOT COMMITTED TO ANYTHING, so it packs nothing. A chip that
 * repacked here would be deciding something nobody asked it to, which is the
 * mistake the Daytime chip made when it reset the platform filter.
 */
describe('Both leaves it alone', () => {
  it('returns the selection untouched', () => {
    const odd: PackedIds = { bodyIds: ['a7iv'], lensIds: [], droneIds: ['dji-air-3s'] }
    expect(pack('both', NO_HOLDS, odd)).toBe(odd)
  })

  it('does not even make a new object, so a caller can skip the write', () => {
    expect(pack('both')).toBe(ALL)
  })
})

/*
 * "If I then tick something by hand, that is mine and the chip does not undo
 * it." Per item, not a flag that switches the chips off: somebody who tacks
 * the a7IV onto a drone shoot has said something about the a7IV.
 */
describe('a hand-ticked item survives the chip', () => {
  const holds = holdToggle(NO_HOLDS, 'a7iv', true)

  it('keeps it packed on a drone shoot', () => {
    const packed = pack('air', holds)
    expect(packed.bodyIds).toEqual(['a7iv'])
    expect(packed.droneIds).toEqual(ALL.droneIds)
  })

  it('keeps packing everything else the chip says', () => {
    expect(pack('air', holds).lensIds).toEqual([])
  })

  /* And the other direction: a hand UNTICK is also the shooter's. */
  it('keeps a hand-unticked item out on a ground shoot', () => {
    const off = holdToggle(NO_HOLDS, 'sony-200-600', false)
    expect(pack('ground', off).lensIds).not.toContain('sony-200-600')
    expect(pack('ground', off).lensIds).toContain('sigma-28-75')
  })

  it('survives flipping between chips', () => {
    expect(pack('air', holds).bodyIds).toContain('a7iv')
    expect(pack('ground', holds).bodyIds).toContain('a7iv')
  })
})

/*
 * A HOLD REPLACES THE OPPOSITE HOLD. Unticking something held on is the
 * shooter changing their mind, and keeping both would make the result depend
 * on which list was read first.
 */
describe('changing your mind', () => {
  it('moves the hold rather than stacking it', () => {
    const on = holdToggle(NO_HOLDS, 'a7iv', true)
    const off = holdToggle(on, 'a7iv', false)
    expect(off.on).not.toContain('a7iv')
    expect(off.off).toContain('a7iv')
    expect(pack('air', off).bodyIds).toEqual([])
  })

  it('never holds one id in both lists', () => {
    let holds = NO_HOLDS
    for (const on of [true, false, true, true, false]) holds = holdToggle(holds, 'x', on)
    expect(holds.on.filter((i) => holds.off.includes(i))).toEqual([])
  })

  it('records each id once however often it is toggled', () => {
    let holds = NO_HOLDS
    for (let i = 0; i < 5; i++) holds = holdToggle(holds, 'a7iv', true)
    expect(holds.on).toEqual(['a7iv'])
  })
})

/* The change is never silent: the chip says what it packed. */
describe('what the chip says it did', () => {
  it('says which way round it packed', () => {
    expect(packingLine('air', pack('air'), NO_HOLDS)).toContain('aircraft')
    expect(packingLine('air', pack('air'), NO_HOLDS)).toContain('left the bodies and glass')
    expect(packingLine('ground', pack('ground'), NO_HOLDS)).toContain('left the aircraft')
  })

  it('counts what is in the bag', () => {
    expect(packingLine('ground', pack('ground'), NO_HOLDS)).toContain(
      `${ALL.bodyIds.length + ALL.lensIds.length} items`,
    )
  })

  it('says when something of the shooter own was kept', () => {
    const holds = holdToggle(NO_HOLDS, 'a7iv', true)
    expect(packingLine('air', pack('air', holds), holds)).toContain('1 you ticked by hand stays')
  })

  it('says nothing on Both, because nothing happened', () => {
    expect(packingLine('both', ALL, NO_HOLDS)).toBeNull()
  })
})

/*
 * A CONTROL MAY NOT DERIVE ITS OWN ENABLED STATE FROM THE THING IT CHANGES.
 *
 * Measured in the browser: Drone packed the aircraft, Ground unpacked it, and
 * Drone was then disabled because nothing was packed. Working once and never
 * again is worse than not working, because it looks like the shooter's fault.
 */
describe('the Drone chip is offerable whatever is currently packed', () => {
  it('is offerable with the aircraft packed', () => {
    expect(canPackAir(DEFAULT_KIT)).toBe(true)
  })

  it('is still offerable after Ground has unpacked it', () => {
    const afterGround = pack('ground')
    expect(afterGround.droneIds).toEqual([])
    /* The question does not look at the selection at all. */
    expect(canPackAir(DEFAULT_KIT)).toBe(true)
  })

  it('round trips: drone, ground, drone', () => {
    const air1 = pack('air')
    expect(air1.droneIds.length).toBeGreaterThan(0)
    const ground = packForPlatform('ground', DEFAULT_KIT, air1, NO_HOLDS)
    expect(ground.droneIds).toEqual([])
    const air2 = packForPlatform('air', DEFAULT_KIT, ground, NO_HOLDS)
    expect(air2.droneIds).toEqual(air1.droneIds)
    expect(air2.bodyIds).toEqual([])
  })

  /* And it is genuinely false when there is no aircraft to pack. */
  it('is not offerable with no aircraft in the profile', () => {
    expect(canPackAir({ ...DEFAULT_KIT, drones: [] })).toBe(false)
  })

  /* An aircraft with no cameras cannot fly anything, so it does not count. */
  it('is not offerable for an aircraft with no cameras', () => {
    const empty = { ...DEFAULT_KIT, drones: [{ ...DEFAULT_KIT.drones[0], cameras: [] }] }
    expect(canPackAir(empty)).toBe(false)
  })
})
