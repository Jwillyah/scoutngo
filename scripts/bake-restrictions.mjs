/*
 * BAKE RESTRICTED AND PROHIBITED AIRSPACE AND NATIONAL PARK BOUNDARIES.
 *
 * Usage:   node scripts/bake-restrictions.mjs
 * Writes:  src/data/restrictions.ts
 *
 * WHY THESE TWO. The class airspace and the facility-map grid (bake-faa.mjs)
 * answer "do I need authorization here". These answer "may I fly here at all":
 *
 *   RESTRICTED (R) AND PROHIBITED (P) AREAS, from the FAA's own Special Use
 *   Airspace layer. P-56 over the Mall, R-4001 at Aberdeen. Not something a
 *   LAANC request unlocks.
 *
 *   NATIONAL PARK SERVICE UNITS, from the NPS Land Resources Division boundary
 *   service. Launching, landing or operating a drone from inside a park unit is
 *   closed under 36 CFR 1.5 by the June 2014 policy memorandum (PM-14-05). The
 *   airspace above is the FAA's; the ground you would launch from is not yours.
 *
 * WHY BAKED, NOT QUERIED. Same reason as the FAA bake: a live query would send
 * the venue coordinate to two more services on every lookup, and the answer has
 * to be there with no signal. Both layers change rarely; re-run on the 56-day
 * chart cycle with bake-faa.mjs.
 *
 * SCOPE: the whole United States, both layers. Measured below, it fits as one
 * lazily imported module, the same way airspace.ts does.
 *
 * GENERALISED SERVER-SIDE at SIMPLIFY_DEGREES, stated in the output, so an edge
 * is never presented as more exact than it is. Near a boundary the card says so.
 */
import { writeFileSync } from 'node:fs'

const FAA = 'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services'
const SUA = `${FAA}/Special_Use_Airspace/FeatureServer/0`
const NPS =
  'https://services1.arcgis.com/fBc8EJBxQRMcHlei/arcgis/rest/services/NPS_Land_Resources_Division_Boundary_and_Tract_Data_Service/FeatureServer/2'

/** About 28 m east-west at these latitudes. The same generalisation as class airspace. */
const SIMPLIFY_DEGREES = 0.00025
const COORD_PRECISION = 1e5
const PAGE = 100

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
      await new Promise((r) => setTimeout(r, 800 * attempt))
    }
  }
  throw new Error('unreachable')
}

async function all(base, where, outFields) {
  const { count } = await page(base, { where, returnCountOnly: 'true' })
  process.stderr.write(`  ${count} features\n`)
  const out = []
  for (let offset = 0; offset < count; offset += PAGE) {
    const body = await page(base, {
      where,
      outFields,
      returnGeometry: 'true',
      outSR: '4326',
      maxAllowableOffset: String(SIMPLIFY_DEGREES),
      orderByFields: 'OBJECTID',
      resultOffset: String(offset),
      resultRecordCount: String(PAGE),
    })
    out.push(...(body.features ?? []))
    process.stderr.write(`\r  ${out.length}/${count}`)
  }
  process.stderr.write('\n')
  if (out.length !== count) throw new Error(`asked for ${count}, got ${out.length}`)
  return out
}

const b36 = (n) => n.toString(36)

/** Same delta, base-36 ring encoding as bake-faa.mjs, so one decoder reads both. */
function encode(rings) {
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
  const bbox = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)].map((v) =>
    Math.round(v * COORD_PRECISION),
  )
  return { rings: encoded, bbox }
}

const num = (v) => {
  const n = Number(v)
  return v !== null && v !== '' && Number.isFinite(n) ? n : null
}

process.stderr.write('Special Use Airspace, restricted and prohibited\n')
const suaRows = await all(
  SUA,
  "TYPE_CODE IN ('R','P')",
  ['NAME', 'TYPE_CODE', 'LOWER_VAL', 'LOWER_UOM', 'LOWER_CODE', 'UPPER_VAL', 'UPPER_UOM', 'UPPER_CODE', 'CONT_AGENT', 'TIMESOFUSE', 'STATE'].join(','),
)
const sua = []
for (const f of suaRows) {
  const rings = f.geometry?.rings
  if (!Array.isArray(rings) || rings.length === 0) continue
  const a = f.attributes
  sua.push({
    type: a.TYPE_CODE,
    name: a.NAME ?? '',
    /* The floor as charted: a value and what it is measured from (SFC, MSL, STD for a flight level). */
    floor: num(a.LOWER_VAL),
    floorUom: a.LOWER_UOM ?? '',
    floorRef: a.LOWER_CODE ?? '',
    ceiling: num(a.UPPER_VAL),
    ceilingUom: a.UPPER_UOM ?? '',
    agency: a.CONT_AGENT ?? '',
    times: a.TIMESOFUSE ?? '',
    state: a.STATE ?? '',
    ...encode(rings),
  })
}

process.stderr.write('National Park Service unit boundaries\n')
const npsRows = await all(NPS, '1=1', ['UNIT_CODE', 'UNIT_NAME', 'UNIT_TYPE', 'STATE', 'PARKNAME'].join(','))
const nps = []
for (const f of npsRows) {
  const rings = f.geometry?.rings
  if (!Array.isArray(rings) || rings.length === 0) continue
  const a = f.attributes
  nps.push({
    code: a.UNIT_CODE ?? '',
    name: a.UNIT_NAME ?? a.PARKNAME ?? '',
    unitType: a.UNIT_TYPE ?? '',
    state: a.STATE ?? '',
    ...encode(rings),
  })
}

const today = new Date().toISOString().slice(0, 10)
const points = (list) => list.reduce((n, s) => n + s.rings.reduce((m, r) => m + r.split(',').length, 0), 0)
process.stderr.write(`  ${sua.length} restricted/prohibited areas (${points(sua)} points), ${nps.length} park units (${points(nps)} points)\n`)

const body = `/*
 * GENERATED BY scripts/bake-restrictions.mjs. DO NOT EDIT BY HAND.
 *
 * Sources, fetched ${today}, public domain US government data, used with no key:
 *   FAA Special Use Airspace (restricted R, prohibited P):
 *     ${SUA}
 *   NPS Land Resources Division unit boundaries:
 *     ${NPS}
 * See docs/airspace-sources.md.
 *
 * Refresh on the 56-day chart cycle:  node scripts/bake-restrictions.mjs
 */

/** Generalisation applied server-side, in degrees. Stated, not hidden. */
export const RESTRICTIONS_SIMPLIFY_DEGREES = ${SIMPLIFY_DEGREES}

/** Coordinates are integers at this scale. */
export const RESTRICTIONS_COORD_PRECISION = ${COORD_PRECISION}

export const RESTRICTIONS_BAKED_AT = ${JSON.stringify(today)}

export interface BakedSpecialUse {
  type: string
  name: string
  floor: number | null
  floorUom: string
  floorRef: string
  ceiling: number | null
  ceilingUom: string
  agency: string
  times: string
  state: string
  bbox: number[]
  rings: string[]
}

export interface BakedParkUnit {
  code: string
  name: string
  unitType: string
  state: string
  bbox: number[]
  rings: string[]
}

export const SPECIAL_USE: readonly BakedSpecialUse[] = ${JSON.stringify(sua)}

export const PARK_UNITS: readonly BakedParkUnit[] = ${JSON.stringify(nps)}
`
writeFileSync('src/data/restrictions.ts', body)
process.stderr.write(`  wrote src/data/restrictions.ts, ${body.length} bytes\n`)
