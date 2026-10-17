import { describe, expect, it } from 'vitest'
import { cellIndex, decodeGrid, lookupCell, parseProfile } from './faaGrid.ts'

/*
 * A hand-built grid, so the decoder is tested against something whose answers
 * are known by construction rather than against the 900KB extract. The extract
 * gets its own test below, cross-checked at the coordinates the FAA publishes.
 */
const PROFILES = [
  '8|D|KAAA|Alpha Field|107-AA,107-FC',
  '0|C|KBBB|Bravo Intl|',
  '4|E|KCCC|Charlie Muni|107-AA',
]

/*
 * Two rows. Row 100 has a run of 3 cells from column 500 on profile 0, then a
 * run of 2 from 600 on profile 1. Row 103 has one cell at 700 on profile 2.
 * Deltas: rows 100 then +3; columns from the END of the previous run.
 */
const GRID = ['2s|dw:3:0,2p:2:1', '3|jg:1:2'].join(';')

describe('the decoder', () => {
  const grid = decodeGrid(GRID, PROFILES, 120)

  it('reads the rows the deltas describe', () => {
    expect([...grid.rows.keys()].sort((a, b) => a - b)).toEqual([100, 103])
  })

  it('reads runs as start, length and profile', () => {
    const row = grid.rows.get(100)
    expect([...(row?.starts ?? [])]).toEqual([500, 600])
    expect([...(row?.lens ?? [])]).toEqual([3, 2])
    expect([...(row?.profiles ?? [])]).toEqual([0, 1])
  })

  it('finds every cell inside a run and nothing outside it', () => {
    const cellAt = (latIdx: number, lonIdx: number) =>
      lookupCell(grid, (latIdx + 0.5) / 120, (lonIdx + 0.5) / 120)

    for (const col of [500, 501, 502]) {
      expect(cellAt(100, col)?.ceilingFeet, `column ${col}`).toBe(400)
    }
    for (const col of [600, 601]) {
      expect(cellAt(100, col)?.ceilingFeet, `column ${col}`).toBe(0)
    }
    /* The gaps and the edges are genuinely absent, not nearest-matched. */
    expect(cellAt(100, 499)).toBeNull()
    expect(cellAt(100, 503)).toBeNull()
    expect(cellAt(100, 599)).toBeNull()
    expect(cellAt(100, 602)).toBeNull()
    expect(cellAt(101, 500)).toBeNull()
  })

  it('is empty for an empty grid, rather than throwing', () => {
    expect(decodeGrid('', [], 120).rows.size).toBe(0)
    expect(lookupCell(decodeGrid('', [], 120), 36, -76)).toBeNull()
  })
})

describe('the cell index', () => {
  /*
   * FLOOR, NOT ROUND. This is the whole correctness of the lookup. A cell spans
   * from its index to the next, so every coordinate in the cell floors to the
   * same index. Rounding would hand back the neighbour for every coordinate in
   * the outer half of every cell.
   */
  it('floors, so every coordinate in a cell gives that cell', () => {
    const cellsPerDegree = 120
    /* Cell 4407 spans 36.725 to 36.73333 degrees. */
    for (const lat of [36.725, 36.7251, 36.729, 36.73332]) {
      expect(cellIndex(lat, 0, cellsPerDegree)?.latIdx, `lat ${lat}`).toBe(4407)
    }
    expect(cellIndex(36.73334, 0, cellsPerDegree)?.latIdx).toBe(4408)
    expect(cellIndex(36.72499, 0, cellsPerDegree)?.latIdx).toBe(4406)
  })

  it('floors negative longitudes the same way', () => {
    /* -75.94 * 120 = -9112.8, which floors to -9113, not -9112. */
    expect(cellIndex(0, -75.94, 120)?.lonIdx).toBe(-9113)
  })

  it('refuses coordinates that are not coordinates', () => {
    expect(cellIndex(Number.NaN, 0, 120)).toBeNull()
    expect(cellIndex(0, Number.POSITIVE_INFINITY, 120)).toBeNull()
    expect(cellIndex(91, 0, 120)).toBeNull()
    expect(cellIndex(0, -181, 120)).toBeNull()
  })
})

describe('profiles', () => {
  it('reads every field', () => {
    const cell = parseProfile('8|CD|KAAA|Alpha Field|107-AA,107-FC')
    expect(cell.ceilingFeet).toBe(400)
    expect(cell.classes).toEqual(['C', 'D'])
    expect(cell.icao).toBe('KAAA')
    expect(cell.facility).toBe('Alpha Field')
    expect(cell.routes).toEqual(['107-AA', '107-FC'])
  })

  it('distinguishes a zero ceiling from a missing one', () => {
    const cell = parseProfile('0|C|KBBB|Bravo Intl|')
    expect(cell.ceilingFeet).toBe(0)
    expect(cell.routes).toEqual([])
    expect(cell.classes).toEqual(['C'])
  })

  it('reads an absent facility as null rather than an empty string', () => {
    const cell = parseProfile('4|||')
    expect(cell.icao).toBeNull()
    expect(cell.facility).toBeNull()
    expect(cell.classes).toEqual([])
  })
})

/*
 * THE SHIPPED EXTRACT, at coordinates whose answers were read off the FAA's own
 * service. 360 random cell centroids were cross-checked against the live
 * service when the extract was baked and all 360 agreed; these are the ones
 * worth keeping in the repo because each is a different BRANCH of the answer.
 */
describe('the shipped extract', () => {
  it('agrees with the FAA service at known coordinates', async () => {
    const { facilityCellAt } = await import('../lib/uasfm.ts')

    /* Norfolk Intl: Class C surface area, ceiling zero, no LAANC route. */
    const norfolk = facilityCellAt(36.8946, -76.2012)
    expect(norfolk).not.toBeNull()
    expect(norfolk?.ceilingFeet).toBe(0)
    expect(norfolk?.classes).toContain('C')
    expect(norfolk?.icao).toBe('KORF')

    /* San Juan: a workable ceiling at a facility with no Part 107 route. */
    const sanJuan = facilityCellAt(18.4125, -66.0792)
    expect(sanJuan?.ceilingFeet).toBe(150)
    expect(sanJuan?.routes).not.toContain('107-AA')

    /* Guam: a zero ceiling at a facility that does have the routes. */
    const guam = facilityCellAt(13.4708, 144.7708)
    expect(guam?.ceilingFeet).toBe(0)
    expect(guam?.routes).toContain('107-AA')
  })

  it('has no cell where the FAA publishes none', async () => {
    const { facilityCellAt } = await import('../lib/uasfm.ts')
    /* Open ocean and empty desert carry no facility map. */
    expect(facilityCellAt(33, -60)).toBeNull()
    expect(facilityCellAt(39.5, -117)).toBeNull()
    /* And Sandbridge, which is the site the night-window report came from. */
    expect(facilityCellAt(36.726, -75.94)).toBeNull()
  })

  it('carries the chart cycle it was cut from', async () => {
    const { facilityEffective } = await import('../lib/uasfm.ts')
    expect(facilityEffective).toMatch(/^\d{1,2}\/\d{1,2}\/\d{4}$/)
  })
})
