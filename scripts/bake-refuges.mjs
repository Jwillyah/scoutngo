/*
 * BAKE THE NATIONAL WILDLIFE REFUGE BOUNDARIES (Batch SIMPLE-1, Section 3).
 *
 * Usage:   node scripts/bake-refuges.mjs
 * Writes:  src/data/refuges.ts
 *          measurements/<today>-fws-refuges.md   (the source facts of this run)
 *
 * WHY. Near Suffolk, VA another drone app drew the Great Dismal Swamp
 * National Wildlife Refuge where this one said nothing was marked. Operating
 * an aircraft on a refuge without the refuge's permission is prohibited
 * (50 CFR 27.34), and the Fish and Wildlife Service treats a drone as one.
 *
 * THE SOURCE. The U.S. Fish and Wildlife Service's own "National Wildlife
 * Refuge System Boundaries" feature service (layer FWSBoundaries), published
 * by the NWRS Division of Realty: the external boundary of the lands and
 * waters the Service administers, dissolved from its Real Estate Interest
 * tracts, one feature per station. US government work, public domain, asked
 * with no key. Filtered to RSL_TYPE = 'NWR': refuges only (no hatcheries,
 * waterfowl production areas or coordination areas), because the line the
 * app says is about a refuge.
 *
 * INTEREST, NOT APPROVED ACQUISITION. FWS publishes two boundaries. The
 * approved acquisition boundary (FWSApproved_Authoritative) is the line the
 * Service is approved to buy inside, and it takes in private land the refuge
 * neither owns nor manages. The interest boundary is the land the Service
 * actually holds, where the refuge's rules apply. This bakes the interest
 * boundary.
 *
 * WHY BAKED, NOT FETCHED ON THE PHONE. The whole-country answer at the parks'
 * generalisation is about 18 MB of GeoJSON (3.9 MB gzipped), most of it the
 * Alaska coast and its islets; baked, trimmed and delta-encoded it is a
 * lazily imported chunk beside src/data/restrictions.ts, whose NPS units it
 * is drawn with. Nothing about the spot is sent either way; baked, the phone
 * also answers with no signal, and the drone page's one lookup per point
 * (src/lib/airspaceAtPoint.ts) holds every park and refuge at the point.
 * Re-run with bake-restrictions.mjs.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const SOURCE =
  'https://services.arcgis.com/QVENGdaPbd4LUkLV/arcgis/rest/services/National_Wildlife_Refuge_System_Boundaries/FeatureServer/0'
const WHERE = "RSL_TYPE = 'NWR'"
const FIELDS = 'OBJECTID,ORGNAME,ORGCODE,RSL_TYPE,FWSREGION'
const COORD_PRECISION = 1e5
const PAGE = 25

/*
 * TWO PASSES, EACH GENERALISED SERVER-SIDE AT ITS OWN TOLERANCE, both stated in
 * the output and carried on every refuge. Outside Alaska, 0.00025° (about 28 m
 * east-west here): the same as the NPS units (bake-restrictions.mjs). Alaska's
 * 16 refuges are three quarters of the country's points at that tolerance,
 * coast and islands the size of a state, so they are generalised more.
 */
const ALASKA_SIMPLIFY = Number(process.env.ALASKA_SIMPLIFY ?? 0.002)
const PASSES = [
  { label: 'outside Alaska', where: "RSL_TYPE = 'NWR' AND FWSREGION <> '7'", simplify: 0.00025 },
  { label: 'Alaska (FWS region 7)', where: "RSL_TYPE = 'NWR' AND FWSREGION = '7'", simplify: ALASKA_SIMPLIFY },
]

/*
 * RINGS SMALLER THAN THIS ARE LEFT OUT: rocks and islets, tens of thousands of
 * them, most smaller than the tolerance can draw. A refuge always keeps its
 * largest ring. Counted in the measurement file.
 */
const MIN_RING_M2 = Number(process.env.MIN_RING_M2 ?? 1000)

async function page(params) {
  const qs = new URLSearchParams({ f: 'json', ...params })
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const res = await fetch(`${SOURCE}/query?${qs}`)
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

/** "GREAT DISMAL SWAMP NATIONAL WILDLIFE REFUGE" → "Great Dismal Swamp National Wildlife Refuge". */
function titleCase(upper) {
  const small = new Set(['of', 'and', 'the', 'de', 'del', 'la', 'at', 'on', 'for'])
  return upper
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && small.has(w) ? w : w.replace(/(^|[-.'"(/])([a-z])/g, (_, a, b) => a + b.toUpperCase())))
    .join(' ')
}

/** A ring's area, square metres, on a local flat projection: enough to sort out an islet. */
function ringM2(ring) {
  const lat0 = (ring.reduce((m, p) => m + p[1], 0) / ring.length) * (Math.PI / 180)
  const kx = 111_320 * Math.cos(lat0)
  const ky = 110_574
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) a += ring[j][0] * kx * (ring[i][1] * ky) - ring[i][0] * kx * (ring[j][1] * ky)
  return Math.abs(a) / 2
}

const b36 = (n) => n.toString(36)

/** Same delta, base-36 ring encoding as bake-restrictions.mjs, so one decoder reads both. */
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
  let w = Infinity
  let s = Infinity
  let e = -Infinity
  let n = -Infinity
  for (const r of rings) {
    for (const [lon, lat] of r) {
      w = Math.min(w, lon)
      e = Math.max(e, lon)
      s = Math.min(s, lat)
      n = Math.max(n, lat)
    }
  }
  return { rings: encoded, bbox: [w, s, e, n].map((v) => Math.round(v * COORD_PRECISION)) }
}

const startedAt = new Date().toISOString()
const today = startedAt.slice(0, 10)

process.stderr.write('FWS National Wildlife Refuge System Boundaries, refuges\n')
const { count } = await page({ where: WHERE, returnCountOnly: 'true' })
const { count: allCount } = await page({ where: '1=1', returnCountOnly: 'true' })
process.stderr.write(`  ${count} refuges of ${allCount} FWS stations\n`)

const refuges = []
const passFacts = []
let points = 0
let noGeometry = 0
let droppedRings = 0
let droppedM2 = 0
let fetched = 0
for (const pass of PASSES) {
  const { count: n } = await page({ where: pass.where, returnCountOnly: 'true' })
  const rows = []
  for (let offset = 0; offset < n; offset += PAGE) {
    const body = await page({
      where: pass.where,
      outFields: FIELDS,
      returnGeometry: 'true',
      outSR: '4326',
      maxAllowableOffset: String(pass.simplify),
      orderByFields: 'OBJECTID',
      resultOffset: String(offset),
      resultRecordCount: String(PAGE),
    })
    rows.push(...(body.features ?? []))
    process.stderr.write(`\r  ${pass.label}: ${rows.length}/${n}`)
  }
  process.stderr.write('\n')
  if (rows.length !== n) throw new Error(`asked for ${n}, got ${rows.length}`)
  fetched += rows.length
  let passPoints = 0
  for (const f of rows) {
    const all = (f.geometry?.rings ?? []).filter((r) => Array.isArray(r) && r.length >= 4)
    if (all.length === 0) {
      noGeometry += 1
      continue
    }
    const sized = all.map((r) => ({ r, m2: ringM2(r) }))
    const largest = sized.reduce((a, b) => (b.m2 > a.m2 ? b : a))
    const kept = []
    for (const x of sized) {
      if (x === largest || x.m2 >= MIN_RING_M2) kept.push(x.r)
      else {
        droppedRings += 1
        droppedM2 += x.m2
      }
    }
    const k = kept.reduce((m, r) => m + r.length, 0)
    points += k
    passPoints += k
    const a = f.attributes
    refuges.push({ code: String(a.ORGCODE ?? ''), name: titleCase(String(a.ORGNAME ?? '').trim()), simplify: pass.simplify, ...encode(kept) })
  }
  passFacts.push({ ...pass, n, points: passPoints })
}
if (fetched !== count) throw new Error(`the passes asked for ${fetched} refuges, the filter has ${count}`)
refuges.sort((x, y) => x.name.localeCompare(y.name))

const body = `/*
 * GENERATED BY scripts/bake-refuges.mjs. DO NOT EDIT BY HAND.
 *
 * Source, fetched ${today}, public domain US government data, used with no key:
 *   U.S. Fish and Wildlife Service, National Wildlife Refuge System Boundaries
 *   (the Service's Real Estate Interest, dissolved; RSL_TYPE 'NWR'):
 *     ${SOURCE}
 * See docs/airspace-sources.md and measurements/${today}-fws-refuges.md.
 *
 * Refresh with the restrictions:  node scripts/bake-refuges.mjs
 */
import type { EncodedRefuge } from '../core/restrictions.ts'

/** Coordinates are integers at this scale. Each refuge carries the generalisation applied to it, degrees. */
export const REFUGES_COORD_PRECISION = ${COORD_PRECISION}

/** Rings smaller than this, square metres, were left out (a refuge keeps its largest). */
export const REFUGES_MIN_RING_M2 = ${MIN_RING_M2}

export const REFUGES_BAKED_AT = ${JSON.stringify(today)}

export const REFUGES: EncodedRefuge[] = ${JSON.stringify(refuges)}
`
writeFileSync('src/data/refuges.ts', body)
const bytes = Buffer.byteLength(body)
const gz = gzipSync(body).length
process.stderr.write(`  ${refuges.length} refuges, ${points} points, ${droppedRings} rings left out, ${bytes} bytes, ${gz} gzipped\n`)

mkdirSync('measurements', { recursive: true })
writeFileSync(
  `measurements/${today}-fws-refuges.md`,
  `# FWS refuge boundaries, baked (Batch SIMPLE-1, Section 3)

Run: node scripts/bake-refuges.mjs, ${startedAt}.

| fact | value |
|---|---|
| source | ${SOURCE} |
| publisher | U.S. Fish and Wildlife Service, National Wildlife Refuge System, Division of Realty |
| licence | US government work, public domain; no key |
| filter | \`${WHERE}\` (no geometry, no place in any request) |
| FWS stations in the layer | ${allCount} |
| refuges asked for | ${count} |
| refuges kept (with geometry) | ${refuges.length} |
| refuges with no geometry | ${noGeometry} |
| points kept | ${points} |
${passFacts.map((p) => `| ${p.label} | ${p.n} refuges, \`${p.where}\`, maxAllowableOffset ${p.simplify}° server-side, ${p.points} points |`).join('\n')}
| rings left out, each under ${MIN_RING_M2} m² | ${droppedRings} rings, ${Math.round(droppedM2)} m² in all |
| coordinates | outSR 4326, integers at 1/${COORD_PRECISION}° |
| src/data/refuges.ts | ${bytes} bytes, ${gz} gzipped |
`,
)
