/*
 * THE FAA FACILITY MAP GRID, AS A LOOKUP INSTEAD OF A QUERY.
 *
 * This file decodes the extract baked by scripts/bake-faa.mjs and answers one
 * question: which facility-map cell contains this coordinate. It holds no data
 * of its own and makes no network call, which is the point.
 *
 * WHY A GRID AND NOT POLYGONS. Every cell the FAA publishes is a regular
 * square on a fixed lattice, so the polygon outline carries no information the
 * cell's row and column do not already carry. Dropping the geometry turns a
 * point-in-polygon search over 380,860 shapes into two Math.floor calls, and
 * turns a request carrying the venue coordinate into an array index. The
 * coordinate never leaves the device because there is nowhere for it to go.
 *
 * THE CELL IS HALF AN ARC-MINUTE, WHICH IS NOT WHAT THE SPEC SAID. The maps
 * are commonly described as one arc-minute. They are not: 720 geometries
 * sampled across every ceiling value and three offsets came back as closed
 * quads measuring exactly 0.5 x 0.5 arc-minutes. The stored centroids land on
 * a quarter and three quarters of a minute, which is a corner plus half a
 * cell and only makes sense at 0.5. At one arc-minute every lookup would
 * silently return a NEIGHBOURING cell's ceiling, with every number on screen
 * still looking entirely plausible. UASFM_CELLS_PER_DEGREE is imported from
 * the generated file rather than written here so the two cannot drift apart.
 */

/** A facility-map cell, decoded. Feet are above ground level. */
export interface FacilityCell {
  /** Maximum AGL altitude the map carries for this cell, in feet. */
  ceilingFeet: number
  /**
   * Surface-area airspace classes this cell lies under, as letters.
   *
   * Usually one. A cell inside a Class C surface area that also underlies a
   * Class D can carry both, which is why the service has five columns for it.
   * Empty when the extract carries none.
   */
  classes: readonly string[]
  /** ICAO identifier of the controlling facility, or null when absent. */
  icao: string | null
  /** Plain name of the controlling facility, or null when absent. */
  facility: string | null
  /**
   * The LAANC routes the FAA lists as enabled at that facility, verbatim:
   * 107-AA is Part 107 auto-approval, 107-FC is further coordination, and
   * 44809-AA is the recreational route, which is not Part 107 and is not used
   * for a paid shoot. Empty when the facility has none.
   */
  routes: readonly string[]
}

/** Decoded rows, keyed by latitude index. Runs are sorted by column. */
export interface FacilityGrid {
  rows: Map<number, { starts: Int32Array; lens: Int32Array; profiles: Int32Array }>
  profiles: readonly string[]
  cellsPerDegree: number
}

/**
 * Which row and column a coordinate falls in.
 *
 * FLOOR, NOT ROUND. A cell spans from its index to the next, so the containing
 * cell is the floor of the scaled coordinate. Rounding would snap to the
 * nearest cell CENTRE and would hand back the neighbour for every coordinate
 * in the outer half of a cell.
 */
export function cellIndex(
  lat: number,
  lon: number,
  cellsPerDegree: number,
): { latIdx: number; lonIdx: number } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null
  return {
    latIdx: Math.floor(lat * cellsPerDegree),
    lonIdx: Math.floor(lon * cellsPerDegree),
  }
}

/** One profile string back into fields. See the bake script for the shape. */
export function parseProfile(profile: string): FacilityCell {
  const [ceiling = '0', classes = '', icao = '', facility = '', routes = ''] = profile.split('|')
  return {
    /* Stored as a fiftieth, because the FAA publishes only multiples of 50. */
    ceilingFeet: (Number.parseInt(ceiling, 36) || 0) * 50,
    classes: classes === '' ? [] : [...classes],
    icao: icao === '' ? null : icao,
    facility: facility === '' ? null : facility,
    routes: routes === '' ? [] : routes.split(','),
  }
}

/**
 * Decode the baked grid string.
 *
 * Deliberately eager over the whole string rather than per row: the decode is
 * a single pass over 670,000 characters and runs in a few milliseconds, and a
 * lazy per-row decoder would need the row offsets, which would cost more
 * bytes in the file than the decode costs in time.
 */
export function decodeGrid(
  grid: string,
  profiles: readonly string[],
  cellsPerDegree: number,
): FacilityGrid {
  const rows = new Map<number, { starts: Int32Array; lens: Int32Array; profiles: Int32Array }>()
  if (grid === '') return { rows, profiles, cellsPerDegree }

  let latIdx = 0
  for (const rowText of grid.split(';')) {
    const bar = rowText.indexOf('|')
    if (bar === -1) continue
    /* Rows are delta-encoded against the previous row, ascending. */
    latIdx += Number.parseInt(rowText.slice(0, bar), 36)

    const runText = rowText.slice(bar + 1)
    if (runText === '') continue
    const parts = runText.split(',')
    const starts = new Int32Array(parts.length)
    const lens = new Int32Array(parts.length)
    const profileIdx = new Int32Array(parts.length)

    /* Columns are delta-encoded against the END of the previous run. */
    let cursor = 0
    for (let i = 0; i < parts.length; i += 1) {
      const [dStart = '0', len = '1', profile = '0'] = parts[i].split(':')
      const start = cursor + Number.parseInt(dStart, 36)
      const length = Number.parseInt(len, 36)
      starts[i] = start
      lens[i] = length
      profileIdx[i] = Number.parseInt(profile, 36)
      cursor = start + length
    }
    rows.set(latIdx, { starts, lens, profiles: profileIdx })
  }
  return { rows, profiles, cellsPerDegree }
}

/**
 * The cell containing a coordinate, or null when the extract has none there.
 *
 * NULL MEANS THE EXTRACT HAS NO CELL HERE. It does not mean the airspace is
 * uncontrolled and it does not mean a flight needs nothing, and no caller is
 * allowed to render it that way: see src/core/laanc.ts, where the absence
 * becomes a named route rather than an absence of advice.
 */
export function lookupCell(grid: FacilityGrid, lat: number, lon: number): FacilityCell | null {
  const idx = cellIndex(lat, lon, grid.cellsPerDegree)
  if (idx === null) return null
  const row = grid.rows.get(idx.latIdx)
  if (row === undefined) return null

  /* Binary search the runs: rows near a big airport carry hundreds. */
  let lo = 0
  let hi = row.starts.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const start = row.starts[mid]
    if (idx.lonIdx < start) {
      hi = mid - 1
    } else if (idx.lonIdx >= start + row.lens[mid]) {
      lo = mid + 1
    } else {
      const profile = grid.profiles[row.profiles[mid]]
      return profile === undefined ? null : parseProfile(profile)
    }
  }
  return null
}
