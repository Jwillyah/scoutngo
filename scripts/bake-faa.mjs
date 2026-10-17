/*
 * BAKE THE FAA UAS FACILITY MAPS AND CLASS AIRSPACE INTO THIS REPO.
 *
 * Usage:   node scripts/bake-faa.mjs            # both layers
 *          node scripts/bake-faa.mjs uasfm      # one layer
 *          node scripts/bake-faa.mjs airspace
 *
 * RUN THIS ON THE 56-DAY CHART CYCLE. The FAA publishes UAS Facility Maps
 * against the aeronautical chart cycle, so a baked extract goes stale on a
 * known date rather than drifting. The generated files carry the effective
 * date they were cut from and the app prints it; src/core/chartCycle.ts turns
 * that date into "current" or "superseded" so a stale bake announces itself
 * instead of quietly answering with 2026 data in 2027.
 *
 * WHY BAKED AND NOT QUERIED LIVE. Querying means sending the venue coordinate
 * to Esri and the FAA on every lookup. Every cell in the facility map is a
 * regular grid square, so the polygon geometry carries no information the grid
 * index does not already carry: strip it and the lookup becomes two
 * Math.floor calls against a table already in the bundle. No key, no network
 * call, no coordinate leaving the device, and it works with no signal, which
 * is the condition a site survey is actually conducted in.
 *
 * WHAT THE PROBE FOUND, AND WHY THE CONSTANTS BELOW ARE WHAT THEY ARE.
 *
 *   THE CELLS ARE HALF AN ARC-MINUTE, NOT ONE. 720 geometries sampled across
 *   every ceiling value and three offsets came back as closed quads measuring
 *   exactly 0.5 x 0.5 arc-minutes, on a lattice aligned to half arc-minutes.
 *   The stored LATITUDE/LONGITUDE are cell CENTROIDS, which is why they land
 *   on .25 and .75 of an arc-minute: corner plus a quarter. At one arc-minute
 *   the index arithmetic would have returned a NEIGHBOURING cell's ceiling,
 *   which is the worst kind of wrong because every number still looks right.
 *
 *   CROSS-ORIGIN READS ARE ALLOWED, BUT ONLY FOR SIMPLE REQUESTS. The service
 *   answers with access-control-allow-origin: *, and its preflight allows only
 *   Content-Type, Authorization and X-Esri-Authorization. Any custom header
 *   turns a working fetch into "TypeError: Failed to fetch" with the preflight
 *   still returning 200, so nothing here sets one.
 */
import { writeFileSync } from 'node:fs'

const ORG = 'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services'
const UASFM = `${ORG}/FAA_UAS_FacilityMap_Data/FeatureServer/0`
const AIRSPACE = `${ORG}/Class_Airspace/FeatureServer/0`

/*
 * Half an arc-minute, as 1/120 of a degree. Measured, not assumed: see above.
 * The app imports this from the generated file rather than redeclaring it, so
 * a future cycle that changed the grid could not leave the two disagreeing.
 */
const CELLS_PER_DEGREE = 120

/*
 * Rows per request.
 *
 * The facility map has no geometry once the polygons are dropped, so its rows
 * are tiny and the service's own 2000 limit is the right page. The airspace
 * layer carries rings, and a 2000-feature page of those is tens of megabytes
 * in one response: the first attempt at it failed the request outright and
 * then failed its retries the same way. Paging it smaller is not a tuning
 * choice, it is the difference between the bake working and not.
 */
const PAGE_UASFM = 2000
const PAGE_AIRSPACE = 200

/** Simple requests only. No custom headers: the preflight would reject them. */
async function page(base, params) {
  const qs = new URLSearchParams({ f: 'json', ...params })
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const res = await fetch(`${base}/query?${qs}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.json()
      if (body.error !== undefined) throw new Error(JSON.stringify(body.error))
      return body
    } catch (err) {
      if (attempt === 4) throw err
      await new Promise((r) => setTimeout(r, 400 * attempt))
    }
  }
  throw new Error('unreachable')
}

async function countOf(base, where) {
  const body = await page(base, { where, returnCountOnly: 'true' })
  return body.count
}

async function* allRows(base, where, outFields, extra = {}, pageSize = PAGE_UASFM) {
  const total = await countOf(base, where)
  process.stderr.write(`  ${total} rows to fetch\n`)
  for (let offset = 0; offset < total; offset += pageSize) {
    const body = await page(base, {
      where,
      outFields,
      returnGeometry: extra.returnGeometry ?? 'false',
      orderByFields: 'OBJECTID',
      resultOffset: String(offset),
      resultRecordCount: String(pageSize),
      ...extra,
    })
    const rows = body.features ?? []
    if (rows.length === 0) break
    yield rows
    const done = Math.min(offset + pageSize, total)
    process.stderr.write(`\r  ${done}/${total}`)
  }
  process.stderr.write('\n')
}

/** base36 keeps the generated file a third the size of decimal. */
const b36 = (n) => n.toString(36)

/* ------------------------------------------------------------------ UASFM */

/*
 * CEILINGS ARE ONE OF NINE VALUES: 0, 50, 100 ... 400 feet. Stored as a
 * fiftieth so a ceiling is a single base36 digit rather than three characters.
 */
const ceilingCode = (feet) => {
  if (!Number.isFinite(feet)) return null
  const code = Math.round(feet / 50)
  return code >= 0 && code <= 8 ? code : null
}

async function bakeUasfm() {
  process.stderr.write('UAS Facility Maps\n')

  /*
   * Cells grouped by latitude row. Each row becomes runs of adjacent columns
   * that share a profile, because facility maps are drawn as blocks around an
   * airport and adjacent cells overwhelmingly agree.
   */
  const rows = new Map()
  const profiles = new Map()
  let effective = null
  let cells = 0

  const fields = [
    'CEILING',
    'LATITUDE',
    'LONGITUDE',
    'MAP_EFF',
    'AIRSPACE_1',
    'AIRSPACE_2',
    'AIRSPACE_3',
    'APT1_ICAO',
    'APT1_NAME',
    'APT1_Enabled',
  ].join(',')

  for await (const batch of allRows(UASFM, '1=1', fields)) {
    for (const { attributes: a } of batch) {
      const ceiling = ceilingCode(a.CEILING)
      if (ceiling === null) continue
      if (!Number.isFinite(a.LATITUDE) || !Number.isFinite(a.LONGITUDE)) continue
      effective ??= a.MAP_EFF ?? null

      /*
       * The centroid is the cell's south-west corner plus a quarter of a
       * minute, so subtracting half an index recovers the corner exactly.
       */
      const latIdx = Math.round(a.LATITUDE * CELLS_PER_DEGREE - 0.5)
      const lonIdx = Math.round(a.LONGITUDE * CELLS_PER_DEGREE - 0.5)

      /*
       * The surface-area classes this cell lies under, deduped. A cell can sit
       * in more than one, which is why the service carries five columns.
       */
      const classes = [...new Set([a.AIRSPACE_1, a.AIRSPACE_2, a.AIRSPACE_3])]
        .filter((c) => typeof c === 'string' && c.trim() !== '')
        .join('')

      /*
       * APT1_Enabled is the FAA's own statement of which LAANC routes exist at
       * the controlling facility: 107-AA is Part 107 auto-approval, 107-FC is
       * further coordination, 44809-AA is recreational. Carried verbatim and
       * read in src/core/laanc.ts, because 22,213 cells have a workable
       * ceiling at a facility with no Part 107 LAANC route at all, and
       * inferring the route from the ceiling alone gets every one of them
       * wrong in the direction of promising minutes.
       */
      const key = `${ceiling}|${classes}|${a.APT1_ICAO ?? ''}|${a.APT1_NAME ?? ''}|${a.APT1_Enabled ?? ''}`
      let profile = profiles.get(key)
      if (profile === undefined) {
        profile = profiles.size
        profiles.set(key, profile)
      }

      let row = rows.get(latIdx)
      if (row === undefined) {
        row = []
        rows.set(latIdx, row)
      }
      row.push([lonIdx, profile])
      cells += 1
    }
  }

  /* Run-length encode each row, then delta-encode rows and runs. */
  const latKeys = [...rows.keys()].sort((x, y) => x - y)
  const out = []
  let prevLat = 0
  let runs = 0
  for (const latIdx of latKeys) {
    const row = rows.get(latIdx).sort((x, y) => x[0] - y[0])
    const parts = []
    let cursor = 0
    let i = 0
    while (i < row.length) {
      const start = row[i][0]
      const profile = row[i][1]
      let len = 1
      while (i + len < row.length && row[i + len][0] === start + len && row[i + len][1] === profile) {
        len += 1
      }
      parts.push(`${b36(start - cursor)}:${b36(len)}:${b36(profile)}`)
      cursor = start + len
      i += len
      runs += 1
    }
    out.push(`${b36(latIdx - prevLat)}|${parts.join(',')}`)
    prevLat = latIdx
  }

  const profileList = [...profiles.keys()]
  process.stderr.write(
    `  ${cells} cells -> ${runs} runs, ${profileList.length} profiles, effective ${effective}\n`,
  )

  return {
    effective,
    cells,
    runs,
    profiles: profileList,
    grid: out.join(';'),
  }
}

/* --------------------------------------------------------------- airspace */

/*
 * ONLY THE AIRSPACE THAT REACHES THE SURFACE, because that is the only
 * airspace 107.41 asks about for an aircraft a few hundred feet up.
 *
 * LOWER_CODE IS A DATUM, NOT A CLAIM THAT THE AIRSPACE TOUCHES THE GROUND.
 * The service contains rows reading LOWER_VAL 700 with LOWER_CODE SFC and
 * LOWER_VAL 1200 with LOWER_CODE SFC: Class E5 transition areas, which begin
 * 700 or 1200 feet UP and need no authorization for a 107 flight. Filtering on
 * LOWER_CODE alone would have pulled in every transition area in the country
 * and reported authorization required on essentially every rural shoot. The
 * surface test is LOWER_VAL = 0 AND LOWER_CODE = 'SFC', both parts.
 */
const SURFACE_WHERE =
  "(CLASS IN ('B','C','D')) OR (CLASS='E' AND LOWER_VAL=0 AND LOWER_CODE='SFC')"

/*
 * Server-side generalisation, in degrees. The raw rings are drawn as airport
 * arcs at about 1,160 points each, which is 100MB across the set and cannot
 * ship. At this tolerance they are about 70 points each.
 *
 * THE TOLERANCE IS PART OF THE ANSWER, so it is carried into the generated
 * file and the app states it rather than implying a boundary is exact.
 */
const SIMPLIFY_DEGREES = 0.00025

/** About 1.1m. Finer than the generalisation above, so it costs nothing. */
const COORD_PRECISION = 1e5

async function bakeAirspace() {
  process.stderr.write('Class Airspace\n')

  const shapes = []
  const fields = ['CLASS', 'LOCAL_TYPE', 'NAME', 'UPPER_VAL', 'UPPER_UOM'].join(',')

  for await (const batch of allRows(
    AIRSPACE,
    SURFACE_WHERE,
    fields,
    { returnGeometry: 'true', outSR: '4326', maxAllowableOffset: String(SIMPLIFY_DEGREES) },
    PAGE_AIRSPACE,
  )) {
    for (const f of batch) {
      const rings = f.geometry?.rings
      if (!Array.isArray(rings) || rings.length === 0) continue
      const a = f.attributes

      /* Delta-encoded, quantised rings. One string per ring. */
      const encoded = rings.map((ring) => {
        let px = 0
        let py = 0
        const parts = []
        for (const [lon, lat] of ring) {
          const x = Math.round(lon * COORD_PRECISION)
          const y = Math.round(lat * COORD_PRECISION)
          parts.push(`${b36(x - px)}:${b36(y - py)}`)
          px = x
          py = y
        }
        return parts.join(',')
      })

      const lons = rings.flat().map((p) => p[0])
      const lats = rings.flat().map((p) => p[1])

      shapes.push({
        cls: a.CLASS ?? '',
        local: a.LOCAL_TYPE ?? '',
        name: a.NAME ?? '',
        upper: Number.isFinite(a.UPPER_VAL) ? a.UPPER_VAL : null,
        upperUom: a.UPPER_UOM ?? '',
        bbox: [
          Math.min(...lons),
          Math.min(...lats),
          Math.max(...lons),
          Math.max(...lats),
        ].map((v) => Math.round(v * COORD_PRECISION)),
        rings: encoded,
      })
    }
  }

  const points = shapes.reduce(
    (n, s) => n + s.rings.reduce((m, r) => m + r.split(',').length, 0),
    0,
  )
  process.stderr.write(`  ${shapes.length} shapes, ${points} points\n`)
  return { shapes, points }
}

/* ----------------------------------------------------------------- output */

const BANNER = `/*
 * GENERATED BY scripts/bake-faa.mjs. DO NOT EDIT BY HAND.
 *
 * Source: the FAA's UAS Facility Maps and Class Airspace, published as public
 * domain feature services and used here with no key and no account.
 *
 * Acknowledgement: this data is published by the Federal Aviation
 * Administration. This product is not endorsed by and carries no FAA
 * marks: see FAA_SOURCE_NOTE in src/core/faaSource.ts.
 *
 * Refresh on the 56-day chart cycle:  node scripts/bake-faa.mjs
 */`

const want = process.argv[2] ?? 'both'

if (want === 'uasfm' || want === 'both') {
  const baked = await bakeUasfm()
  const body = `${BANNER}

/** The chart cycle this extract was cut from, as the FAA published it. */
export const UASFM_EFFECTIVE = ${JSON.stringify(baked.effective)}

/** When the bake ran, so a stale extract can say how stale. */
export const UASFM_BAKED_AT = ${JSON.stringify(new Date().toISOString().slice(0, 10))}

/** Grid cells per degree. Half an arc-minute, measured from the geometry. */
export const UASFM_CELLS_PER_DEGREE = ${CELLS_PER_DEGREE}

export const UASFM_CELL_COUNT = ${baked.cells}

/** ceiling/50 | surface classes | ICAO | facility name | LAANC routes */
export const UASFM_PROFILES: readonly string[] = ${JSON.stringify(baked.profiles)}

/** Rows of runs, base36 and delta-encoded. Decoded by src/core/faaGrid.ts. */
export const UASFM_GRID =
  ${JSON.stringify(baked.grid)}
`
  writeFileSync('src/data/uasfm.ts', body)
  process.stderr.write(`  wrote src/data/uasfm.ts (${(body.length / 1e6).toFixed(2)} MB)\n`)
}

if (want === 'airspace' || want === 'both') {
  const baked = await bakeAirspace()
  const body = `${BANNER}

/** Generalisation applied server-side, in degrees. Stated, not hidden. */
export const AIRSPACE_SIMPLIFY_DEGREES = ${SIMPLIFY_DEGREES}

/** Coordinates are integers at this scale. */
export const AIRSPACE_COORD_PRECISION = ${COORD_PRECISION}

export const AIRSPACE_BAKED_AT = ${JSON.stringify(new Date().toISOString().slice(0, 10))}

export interface BakedAirspace {
  cls: string
  local: string
  name: string
  upper: number | null
  upperUom: string
  bbox: number[]
  rings: string[]
}

export const AIRSPACE_SHAPES: readonly BakedAirspace[] = ${JSON.stringify(baked.shapes)}
`
  writeFileSync('src/data/airspace.ts', body)
  process.stderr.write(`  wrote src/data/airspace.ts (${(body.length / 1e6).toFixed(2)} MB)\n`)
}
