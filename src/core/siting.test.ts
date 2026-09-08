import { describe, expect, it } from 'vitest'
import { checkSite, isInRoadway, isInWater, type Landcover, type Ring } from './siting.ts'

/** A square of water around the Wicomico, in [lon, lat]. */
const RIVER: Ring[] = [
  [
    [-75.607, 38.363],
    [-75.604, 38.363],
    [-75.604, 38.3645],
    [-75.607, 38.3645],
    [-75.607, 38.363],
  ],
]

/** Riverside Drive running roughly east to west along the south bank. */
const ROAD = {
  positions: [
    [-75.608, 38.3625],
    [-75.603, 38.3625],
  ] as [number, number][],
  halfWidthMeters: 6,
}

const LAND: Landcover = { water: [RIVER], roads: [ROAD] }

describe('isInWater', () => {
  it('catches a position dropped in the river', () => {
    expect(isInWater({ lat: 38.3638, lon: -75.6055 }, [RIVER])).toBe(true)
  })

  it('leaves a position on the bank alone', () => {
    expect(isInWater({ lat: 38.3655, lon: -75.6055 }, [RIVER])).toBe(false)
  })

  it('is false when there is no water data at all', () => {
    expect(isInWater({ lat: 38.3638, lon: -75.6055 }, [])).toBe(false)
  })

  it('ignores a malformed ring instead of throwing', () => {
    const broken: Ring[] = [[[-75.6, 38.3]]]
    expect(isInWater({ lat: 38.3638, lon: -75.6055 }, [broken])).toBe(false)
  })
})

describe('isInRoadway', () => {
  it('catches a position on the centreline', () => {
    expect(isInRoadway({ lat: 38.3625, lon: -75.6055 }, [ROAD])).toBe(true)
  })

  it('catches a position within half a carriageway of it', () => {
    // About 4m north of the centreline.
    expect(isInRoadway({ lat: 38.36254, lon: -75.6055 }, [ROAD])).toBe(true)
  })

  it('clears the pavement well off the road', () => {
    expect(isInRoadway({ lat: 38.3635, lon: -75.6055 }, [ROAD])).toBe(false)
  })

  it('ignores a degenerate way with a single point', () => {
    expect(
      isInRoadway({ lat: 38.3625, lon: -75.6055 }, [
        { positions: [[-75.6055, 38.3625]], halfWidthMeters: 6 },
      ]),
    ).toBe(false)
  })
})

describe('checkSite', () => {
  it('reports nothing for a good spot', () => {
    expect(checkSite({ lat: 38.3655, lon: -75.6055 }, LAND)).toEqual([])
  })

  it('reports water', () => {
    expect(checkSite({ lat: 38.3638, lon: -75.6055 }, LAND)).toEqual(['in-water'])
  })

  it('reports roadway', () => {
    expect(checkSite({ lat: 38.3625, lon: -75.6055 }, LAND)).toEqual(['in-roadway'])
  })

  it('never moves the position, it only reports', () => {
    // The function returns warnings and nothing else. There is no corrected
    // coordinate anywhere in the result, by design.
    const result = checkSite({ lat: 38.3638, lon: -75.6055 }, LAND)
    expect(Array.isArray(result)).toBe(true)
    expect(result.every((w) => typeof w === 'string')).toBe(true)
  })
})
