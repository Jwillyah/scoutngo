/*
 * VDOT'S PUBLIC TRAFFIC CAMS NEAR THE COAST, BAKED (Batch K, Section 7).
 *
 * Usage:  node scripts/bake-vdot-cams.mjs
 * Reads:  https://511.vdot.virginia.gov/services/511/map/array/cameras, the
 *         list the public 511 camera map loads (found by watching that page's
 *         own requests on 3 Nov 2026; its older map/layers/map/cams path and
 *         the Iteris data API refuse without a token)
 * Writes: src/data/vdotCams.ts
 *
 * Kept: active cams in coastal Virginia (36.5-38.1 N, 75.2-77.1 W: Hampton
 * Roads, the Eastern Shore, the Middle Peninsula and the Northern Neck).
 * FACING: VDOT labels each cam with the lanes it watches (NB, SB, EB, WB, or
 * a compass point), not a measured aim. Since Batch M it is kept as the
 * lanes it watches (facingIs: "lanes"), not where the cam looks: on 8 Nov
 * WB-labelled I-264 cams were offered for "Look WSW now" and looked the wrong
 * way. No VDOT cam is offered for "Look west" (src/core/skyCams.ts); a cam
 * labelled "Median", "HB" or nothing has facing null. The link is the cam's own still on
 * vdotcameras.com, opened by the user's tap: nothing is fetched by the app.
 */
import { writeFileSync } from 'node:fs'

const URL_ = 'https://511.vdot.virginia.gov/services/511/map/array/cameras'
const r = await fetch(URL_, { headers: { 'user-agent': 'Mozilla/5.0', referer: 'https://511.vdot.virginia.gov/' } })
const body = await r.json()
const all = body.data ?? body.features ?? []
const FACING = { NB: 0, N: 0, Northbound: 0, NE: 45, EB: 90, E: 90, Eastbound: 90, SE: 135, SB: 180, S: 180, Southbound: 180, SW: 225, WB: 270, W: 270, Westbound: 270, NW: 315 }
const keep = all.filter((f) => {
  const [lon, lat] = f.geometry?.coordinates ?? []
  return f.properties?.active !== false && lat >= 36.5 && lat <= 38.1 && lon >= -77.1 && lon <= -75.2 && /^https:\/\//.test(f.properties?.image_url ?? '')
})
const rows = keep.map((f) => {
  const p = f.properties
  const [lon, lat] = f.geometry.coordinates
  const dir = String(p.direction ?? '').trim()
  const facing = FACING[dir] ?? null
  const name = String(p.description || p.name || p.route || 'VDOT cam').replace(/\s+/g, ' ').trim()
  return `  { id: ${JSON.stringify(`vdot-${p.id}`)}, name: ${JSON.stringify(name)}, operator: "VDOT", at: { lat: ${lat.toFixed(4)}, lon: ${lon.toFixed(4)} }, facing: ${facing}, facingIs: "lanes", label: ${JSON.stringify(dir)}, url: ${JSON.stringify(p.image_url)}, access: "free" },`
})
const withFacing = keep.filter((f) => FACING[String(f.properties.direction ?? '').trim()] !== undefined).length
const today = new Date().toISOString().slice(0, 10)
const out = `/*
 * VDOT TRAFFIC CAMS IN COASTAL VIRGINIA: ${rows.length} (${withFacing} with a direction), GENERATED
 * ${today} by scripts/bake-vdot-cams.mjs from VDOT 511's public camera map
 * (${URL_}).
 *
 * \`facing\` is VDOT's lane label (WB = 270): the lanes the cam watches, not
 * where its lens points (\`facingIs: 'lanes'\`), so none is offered for "Look
 * west" (src/core/skyCams.ts). Null where VDOT gives none ("Median", blank).
 * LINK OUT ONLY (tests/camsLinkOnly.test.ts).
 */
import type { LatLon } from '../core/geo.ts'

export interface VdotCam {
  id: string
  name: string
  operator: string
  at: LatLon
  facing: number | null
  /** The lanes it watches, not where the lens points: never offered as looking toward the sun (src/core/skyCams.ts). */
  facingIs: 'lanes'
  /** VDOT's own direction label, as published. */
  label: string
  url: string
  access: 'free' | 'paid'
}

export const VDOT_CAMS_SOURCE = { url: ${JSON.stringify(URL_)}, read: ${JSON.stringify(today)} }

export const VDOT_CAMS: readonly VdotCam[] = [
${rows.join('\n')}
]
`
writeFileSync('src/data/vdotCams.ts', out)
console.log(`${all.length} cams in the list; ${rows.length} coastal, ${withFacing} with a direction -> src/data/vdotCams.ts`)
