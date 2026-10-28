/*
 * THE LIGHT MAP, TWO WAYS, AT THE PIER AND AT BREW RIVER.
 *
 * Usage:  node scripts/measure-light-map.mjs
 * Writes: measurements/<today>-light-map.md
 * Exits:  0 every check within its limit; 1 not; 2 could not look.
 *
 * At each place, from the public lidar scan (as the app downloads it), for
 * "Where golden light lands" on 28 Oct 2026 (the last 45 minutes before
 * sunset), minutes of direct sun per metre of ground over the 300 m square
 * the app draws:
 *
 *   rays       from each cell toward the sun every five minutes
 *              (src/core/lightMap.ts sunMinutesByRays, what the app draws)
 *   skylines   at 60 cells picked at random (seeded), the cell's skyline
 *              against the sun's path (sunMinutesBySkyline)
 *
 * The two can differ by a step where the shadow's edge crosses a cell
 * between the samples; they must agree within one step (5 min) on 90% of
 * the cells and within two on all.
 */
import { writeFileSync } from 'node:fs'
import { createLazPerf } from 'laz-perf'
import { getTimes } from 'suncalc'
import { areaFor, mercator } from '../src/lib/lidar/grid.ts'
import { LIDAR_BUCKET, nodesFor, pickDepth } from '../src/lib/lidar/ept.ts'
import { decodeTile } from '../src/lib/lidar/decode.ts'
import { buildRasters, STRIDE } from '../src/lib/lidar/raster.ts'
import { sunMinutesByRays, sunMinutesBySkyline, sunSteps } from '../src/core/lightMap.ts'
import { getSunPosition } from '../src/core/sun.ts'
import { seeded } from '../src/core/clouds.ts'
import { GOLDEN_MIN, HALF_M, landSurface } from '../src/lib/lightmap/lightMapFor.ts'
import { seaTestAround } from '../src/lib/coast.ts'
import { setVectorLoader } from '../src/lib/vectorTiles.ts'

const mem = new Map()
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) }
setVectorLoader(async (u) => {
  const r = await fetch(u)
  return r.ok ? r.arrayBuffer() : null
})

const realFetch = globalThis.fetch
globalThis.fetch = async (u, o) => {
  for (let i = 0; ; i += 1) {
    try {
      return await realFetch(u, o)
    } catch (e) {
      if (i >= 2) throw e
      await new Promise((r) => setTimeout(r, 1500))
    }
  }
}
const get = async (u) => (await fetch(u)).json()

const PLACES = [
  { name: 'Virginia Beach Fishing Pier', lat: 36.8435575, lon: -75.9713104, project: 'USGS_LPC_VA_Norfolk_2013_LAS_2015' },
  { name: 'Brew River Dock Bar, Salisbury MD', lat: 38.364236, lon: -75.605912, project: 'MD_Southeast_1_2019' },
]
const SAMPLES = 60
const STEP_MIN = 5
const lines = []
let ok = true
const fail = (w) => {
  ok = false
  lines.push(`FAIL: ${w}`, '')
}

try {
  for (const place of PLACES) {
    const area = areaFor(place.lat, place.lon)
    const base = `${LIDAR_BUCKET}/${place.project}`
    const meta = await get(`${base}/ept.json`)
    const pick = pickDepth(await nodesFor(meta, area, async (k) => get(`${base}/ept-hierarchy/${k}.json`)), area, 2)
    const Laz = await createLazPerf()
    let pts = new Float64Array(1 << 22)
    let used = 0
    for (const n of pick.nodes) {
      const data = new Uint8Array(await (await fetch(`${base}/ept-data/${n.key}.laz`)).arrayBuffer())
      decodeTile(Laz, data, area, (x, y, z, c, r) => {
        if (used + STRIDE > pts.length) {
          const b = new Float64Array(pts.length * 2)
          b.set(pts)
          pts = b
        }
        pts.set([x, y, z, c, r], used)
        used += STRIDE
      })
    }
    const r = buildRasters(pts.subarray(0, used), area)
    const cellM = r.cell * Math.cos((place.lat * Math.PI) / 180)
    /* The app's own surface: the scan's DSM with the map's sea out (src/lib/lightmap/lightMapFor.ts). */
    const isSea = await seaTestAround({ lat: place.lat, lon: place.lon }, (Math.hypot(r.width, r.height) * cellM) / 2 + 200)
    const g = { width: r.width, height: r.height, cellM, dsm: landSurface(r, isSea) }
    const m = mercator(place.lat, place.lon)
    const cx = Math.floor((m.x - r.minx) / r.cell)
    const cy = Math.floor((r.maxy - m.y) / r.cell)
    const half = Math.round(HALF_M / cellM)
    const w = { x0: Math.max(0, cx - half), y0: Math.max(0, cy - half), x1: Math.min(r.width, cx + half), y1: Math.min(r.height, cy + half) }
    const sunset = getTimes(new Date(Date.UTC(2026, 9, 28, 16)), place.lat, place.lon).sunset
    const from = new Date(sunset.getTime() - GOLDEN_MIN * 60_000)
    const steps = sunSteps(from, sunset, STEP_MIN, (at) => getSunPosition(at, place.lat, place.lon))
    const t0 = Date.now()
    const rays = sunMinutesByRays(g, w, steps)
    const tRays = Date.now() - t0
    const width = w.x1 - w.x0
    let full = 0
    let none = 0
    let some = 0
    for (const v of rays) {
      if (Number.isNaN(v)) continue
      if (v >= GOLDEN_MIN - 0.01) full += 1
      else if (v <= 0.01) none += 1
      else some += 1
    }
    const total = full + none + some
    const rand = seeded(Math.round(place.lat * 1e4))
    const rows = []
    let within1 = 0
    let worst = 0
    let n = 0
    const t1 = Date.now()
    while (n < SAMPLES) {
      const x = w.x0 + Math.floor(rand() * width)
      const y = w.y0 + Math.floor(rand() * (w.y1 - w.y0))
      const a = rays[(y - w.y0) * width + (x - w.x0)]
      if (Number.isNaN(a)) continue
      const b = sunMinutesBySkyline(g, x, y, steps)
      const d = Math.abs(a - b)
      if (d <= STEP_MIN + 0.01) within1 += 1
      worst = Math.max(worst, d)
      if (n < 12) rows.push(`| ${x - cx}, ${cy - y} | ${a.toFixed(0)} | ${b.toFixed(0)} |`)
      n += 1
    }
    const tSky = Date.now() - t1
    lines.push(
      `## ${place.name}`,
      '',
      `Scan ${place.project}. "Where golden light lands" on 28 Oct 2026: ${from.toISOString().slice(11, 16)} to ${sunset.toISOString().slice(11, 16)} UTC, the sun every ${STEP_MIN} min. ${width} x ${w.y1 - w.y0} cells of ${cellM.toFixed(3)} m around the venue, by rays in ${(tRays / 1000).toFixed(1)} s.`,
      '',
      `Of ${total} cells: ${full} in the sun the whole ${GOLDEN_MIN} min (${((100 * full) / total).toFixed(1)}%), ${none} in shade the whole time (${((100 * none) / total).toFixed(1)}%), ${some} some of it.`,
      '',
      `Rays against skylines at ${SAMPLES} cells (skylines in ${(tSky / 1000).toFixed(1)} s): ${within1} of ${SAMPLES} within one step (${STEP_MIN} min); the largest gap ${worst.toFixed(0)} min.`,
      '',
      '| cell (m east, m north of the venue) | minutes by rays | minutes by its skyline |',
      '|---|---|---|',
      ...rows,
      '',
    )
    if (within1 < SAMPLES * 0.9) fail(`${place.name}: fewer than 90% of cells agree within one step`)
    if (worst > 2 * STEP_MIN + 0.01) fail(`${place.name}: a cell differs by more than two steps`)
  }
} catch (error) {
  console.error(`could not look: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(2)
}

const date = new Date().toISOString().slice(0, 10)
const out = ['# The light map, two ways', '', `Run: ${new Date().toISOString()} · node scripts/measure-light-map.mjs · USGS 3DEP lidar (the app's download, depth 2) · suncalc`, '', ...lines, ok ? 'Pass.' : 'FAIL.', '']
writeFileSync(`measurements/${date}-light-map.md`, out.join('\n'))
console.log(out.join('\n'))
process.exit(ok ? 0 : 1)
