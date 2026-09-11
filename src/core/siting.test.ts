import { describe, expect, it } from 'vitest'
import {
  checkSite,
  isInRoadway,
  isInWater,
  pathCrossesStructure,
  type Landcover,
  type Ring,
} from './siting.ts'

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

const LAND: Landcover = { water: [RIVER], roads: [ROAD], structures: [] }

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

describe('pathCrossesStructure, the drone check', () => {
  /** A building sitting between the launch point and the subject. */
  const BUILDING: Ring[] = [
    [
      [-75.6058, 38.3648],
      [-75.6052, 38.3648],
      [-75.6052, 38.3652],
      [-75.6058, 38.3652],
      [-75.6058, 38.3648],
    ],
  ]

  it('flags a flight path that crosses a building', () => {
    expect(
      pathCrossesStructure(
        { lat: 38.3660, lon: -75.6055 },
        { lat: 38.3640, lon: -75.6055 },
        [BUILDING],
      ),
    ).toBe(true)
  })

  it('clears a path that goes around it', () => {
    expect(
      pathCrossesStructure(
        { lat: 38.3660, lon: -75.6030 },
        { lat: 38.3640, lon: -75.6030 },
        [BUILDING],
      ),
    ).toBe(false)
  })

  it('flags a path that starts inside the footprint', () => {
    expect(
      pathCrossesStructure(
        { lat: 38.3650, lon: -75.6055 },
        { lat: 38.3600, lon: -75.6055 },
        [BUILDING],
      ),
    ).toBe(true)
  })

  it('is false when there is no structure data', () => {
    expect(
      pathCrossesStructure({ lat: 38.366, lon: -75.6055 }, { lat: 38.364, lon: -75.6055 }, []),
    ).toBe(false)
  })

  it('judges an air position on its path, not on the ground beneath it', () => {
    const land: Landcover = { water: [RIVER], roads: [ROAD], structures: [BUILDING] }
    const overWater = { lat: 38.3638, lon: -75.6055 }
    // Same spot: a person standing there is in the river, a drone is not.
    expect(checkSite(overWater, land)).toEqual(['in-water'])
    expect(
      checkSite(overWater, land, { platform: 'air', subject: { lat: 38.3639, lon: -75.6056 } }),
    ).toEqual([])
  })

  it('flags an air position whose path crosses a building', () => {
    const land: Landcover = { water: [], roads: [], structures: [BUILDING] }
    expect(
      checkSite({ lat: 38.366, lon: -75.6055 }, land, {
        platform: 'air',
        subject: { lat: 38.364, lon: -75.6055 },
      }),
    ).toEqual(['over-structure'])
  })
})
