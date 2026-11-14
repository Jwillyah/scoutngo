/*
 * THE WIND MAP AGAINST LIVE TILES (Batch LIVE, Section 1.2). The gate's wind
 * audit (scripts/audit-map-layers.mjs) runs on the fixture's wind; this one
 * asks Open-Meteo itself for the blocks a 390 x 844 phone view asks at zoom
 * 12, 7, 4 and 2 over the spot, through the app's own arithmetic
 * (src/core/windViewport.ts, src/lib/useWindViewport.ts), and fails when:
 *
 *   - any block of any zoom does not load (14 Nov: "Wind didn't load" at
 *     world zoom, every block refused for a latitude past 90°)
 *   - the field leaves the middle of the view empty
 *   - the crosshair's reading (usePointWind: the fine grid at the crosshair)
 *     differs from zoom 12's by more than MAX_KT
 *
 * It is not in the gate (nothing there reaches a live host, docs/gate.md):
 * run it as `npm run audit:wind-live`. Offline, it says so and passes.
 *
 * Usage:  node scripts/audit-wind-live.mjs [lat,lon] [model=blend|hrrr|ecmwf]
 */
import { blocksFor, fromUV, GLOBAL_FROM_STEP, gridStep, KT_PER_MPS, sampleField } from '../src/core/windViewport.ts'
import { blockUrl, fieldAt, parseBlock, POINT_STEP } from '../src/lib/useWindViewport.ts'

const MAX_KT = 3
const ZOOMS = [12, 7, 4, 2]
const arg = process.argv.slice(2).find((a) => /^-?\d/.test(a))
const [LAT, LON] = (arg ?? '36.85,-75.93').split(',').map(Number)
const MODEL = process.argv.find((a) => a.startsWith('model='))?.slice(6) ?? 'blend'
const W = 390
const H = 844
const at = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000)

/* Web Mercator, 512 px tiles (MapLibre's). */
const worldPx = (z) => 512 * 2 ** z
const yOf = (lat, z) => ((1 - Math.log(Math.tan((Math.PI / 4) + (lat * Math.PI) / 360)) / Math.PI) / 2) * worldPx(z)
const latAt = (y, z) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / worldPx(z)))) * 180) / Math.PI
function boundsAt(z) {
  const cy = yOf(LAT, z)
  const top = Math.max(0, cy - H / 2)
  const bottom = Math.min(worldPx(z), cy + H / 2)
  const half = (W / 2) * (360 / worldPx(z))
  return { south: latAt(bottom, z), north: latAt(top, z), west: LON - half, east: LON + half }
}

/* Open-Meteo counts a 25-point request as many calls; a pause between them, and one wait of a minute on its "Minutely API request limit". */
const pause = (ms) => new Promise((r) => setTimeout(r, ms))
async function ask(points, model, again = true) {
  await pause(1500)
  const got = await ask1(points, model)
  if (!got.ok && again && /request limit/i.test(got.reason ?? '')) {
    console.log('  (rate limit: waiting a minute)')
    await pause(61_000)
    return ask(points, model, false)
  }
  return got
}
async function ask1(points, model) {
  try {
    const r = await fetch(blockUrl(points, model), { signal: AbortSignal.timeout(20_000) })
    const body = await r.json().catch(() => null)
    return { ok: r.ok, status: r.status, body, reason: r.ok ? null : (body?.reason ?? `HTTP ${r.status}`) }
  } catch (e) {
    return { ok: false, status: 0, body: null, reason: String(e?.cause?.code ?? e?.message ?? e), network: true }
  }
}

/* Offline: one small question first. */
const probe = await ask([{ lat: Number(LAT.toFixed(2)), lon: Number(LON.toFixed(2)) }], 'blend')
if (probe.network) {
  console.log(`WIND LIVE: skipped, offline (${probe.reason})`)
  process.exit(0)
}

const problems = []
const rows = []
/* The crosshair's reading: the fine grid's block around it, as usePointWind asks. */
const pointModel = MODEL
const pBlocks = blocksFor({ south: LAT, west: LON, north: LAT, east: LON }, POINT_STEP)
const pSeries = []
for (const b of pBlocks) {
  const r = await ask(b.points, pointModel)
  if (!r.ok) problems.push(`crosshair block ${b.south},${b.west}: ${r.reason}`)
  else pSeries.push(...parseBlock(r.body, b.points))
}
const pField = fieldAt(pSeries, POINT_STEP, at)
const pS = pField === null ? null : sampleField(pField, LAT, LON)
const pointKt = pS === null ? null : fromUV(pS.u, pS.v).speedMps * KT_PER_MPS
if (pointKt === null) problems.push('the crosshair read nothing')

for (const z of ZOOMS) {
  const b = boundsAt(z)
  const step = gridStep(b, z)
  const model = step >= GLOBAL_FROM_STEP && MODEL === 'hrrr' ? 'blend' : MODEL
  const blocks = blocksFor(b, step)
  let failed = 0
  const series = []
  for (const k of blocks) {
    const r = await ask(k.points, model)
    if (!r.ok) {
      failed += 1
      problems.push(`z${z} block ${k.south},${k.west}: ${r.reason}`)
    } else series.push(...parseBlock(r.body, k.points))
  }
  const f = fieldAt(series, step, at)
  const s = f === null ? null : sampleField(f, LAT, LON)
  const fieldKt = s === null ? null : fromUV(s.u, s.v).speedMps * KT_PER_MPS
  if (fieldKt === null) problems.push(`z${z}: the field is empty under the crosshair`)
  rows.push({ z, step, blocks: blocks.length, failed, fieldKt, readKt: pointKt })
}
for (const r of rows) if (pointKt !== null && rows[0].readKt !== null && Math.abs(r.readKt - rows[0].readKt) > MAX_KT) problems.push(`z${r.z}: the crosshair read ${r.readKt.toFixed(1)} kt against z12's ${rows[0].readKt.toFixed(1)}`)

console.log(`WIND LIVE at ${LAT},${LON}, ${at.toISOString()}, model ${MODEL}`)
for (const r of rows) console.log(`  z${r.z}: step ${r.step}°, ${r.blocks} blocks, ${r.failed} failed; the colour field ${r.fieldKt === null ? '—' : `${r.fieldKt.toFixed(1)} kt`}; the crosshair reads ${r.readKt === null ? '—' : `${r.readKt.toFixed(1)} kt`}`)
if (problems.length > 0) {
  for (const p of problems) console.log(`  ✗ ${p}`)
  console.log(`WIND LIVE PROBLEMS: ${problems.length}`)
  process.exit(1)
}
console.log('WIND LIVE PROBLEMS: 0')
