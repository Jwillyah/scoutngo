/*
 * THE SKYLINE, TWO WAYS, AT THE PIER AND AT BREW RIVER.
 *
 * Usage:  node scripts/measure-skyline.mjs
 * Writes: measurements/<today>-skyline.md
 * Exits:  0 every check within its limit; 1 not; 2 could not look.
 *
 * At each place, from the public lidar scan (as the app downloads it) and
 * the map's buildings for names:
 *
 *   the skyline   by marching out along each bearing, and by visiting every
 *                 cell and binning it by bearing (src/core/skyRing.ts):
 *                 the angle per 1 deg bin both ways, how far apart
 *   the sun       when the sun goes behind something on 28 Oct 2026, by each
 *                 skyline, and what it is, in the app's words
 */
import { writeFileSync } from 'node:fs'
import { createLazPerf } from 'laz-perf'
import { getTimes } from 'suncalc'
import { setVectorLoader } from '../src/lib/vectorTiles.ts'
import { buildingsFromTiles } from '../src/lib/vectorTiles.ts'
import { areaFor, mercator } from '../src/lib/lidar/grid.ts'
import { LIDAR_BUCKET, nodesFor, pickDepth } from '../src/lib/lidar/ept.ts'
import { decodeTile } from '../src/lib/lidar/decode.ts'
import { buildRasters, STRIDE } from '../src/lib/lidar/raster.ts'
import { crossings, NEAR_M, skylineByBins, skylineByMarch } from '../src/core/skyRing.ts'
import { getSunPosition } from '../src/core/sun.ts'
import { whatAt } from '../src/lib/skyline/skylineFor.ts'
import { eventLine } from '../src/lib/skyline/words.ts'

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

const DAY_UTC = Date.UTC(2026, 9, 28, 4, 0) /* local midnight, Eastern Daylight Time */
const TZ = 'America/New_York'
const PLACES = [
  { name: 'Virginia Beach Fishing Pier', lat: 36.8435575, lon: -75.9713104, project: 'USGS_LPC_VA_Norfolk_2013_LAS_2015' },
  { name: 'Brew River Dock Bar, Salisbury MD', lat: 38.364236, lon: -75.605912, project: 'MD_Southeast_1_2019' },
]
const EYE_M = 1.6
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
    const m = mercator(place.lat, place.lon)
    const x = (m.x - r.minx) / r.cell
    const y = (r.maxy - m.y) / r.cell
    /* On foot, on what is there: the deck, the roof, the ground (src/lib/skyline/skylineFor.ts). */
    const cellAt = Math.floor(y) * r.width + Math.floor(x)
    const ground = Number.isNaN(r.dsm[cellAt]) ? r.dtm[cellAt] : r.dsm[cellAt]
    const eye = ground + EYE_M
    const cellM = r.cell * Math.cos((place.lat * Math.PI) / 180)
    const grid = { width: r.width, height: r.height, cellM, dsm: r.dsm }
    const t0 = Date.now()
    const a = skylineByMarch(grid, x, y, eye)
    const tA = Date.now() - t0
    const b = skylineByBins(grid, x, y, eye)
    const tB = Date.now() - t0 - tA
    const diffs = Array.from(a.angle, (v, i) => Math.abs(v - b.angle[i])).sort((p, q) => p - q)
    const median = diffs[diffs.length >> 1]
    const p95 = diffs[Math.floor(diffs.length * 0.95)]
    const worst = diffs[diffs.length - 1]
    const worstBin = Array.from(a.angle, (v, i) => Math.abs(v - b.angle[i])).indexOf(worst)

    const sw = { lat: place.lat - 0.008, lon: place.lon - 0.01 }
    const ne = { lat: place.lat + 0.008, lon: place.lon + 0.01 }
    const bl = await buildingsFromTiles({ south: sw.lat, west: sw.lon, north: ne.lat, east: ne.lon })
    const buildings = bl.status === 'ok' ? bl.buildings : []

    const path = []
    for (let t = DAY_UTC; t <= DAY_UTC + 86_400_000; t += 60_000) {
      const s = getSunPosition(new Date(t), place.lat, place.lon)
      path.push({ at: new Date(t), azimuth: s.azimuth, altitude: s.altitude })
    }
    const sunset = getTimes(new Date(DAY_UTC + 12 * 3_600_000), place.lat, place.lon).sunset
    const ea = crossings(a, path)
    const eb = crossings(b, path)

    lines.push(
      `## ${place.name}`,
      '',
      `Scan ${place.project}, ${r.width} x ${r.height} cells of ${cellM.toFixed(3)} m. Eye ${EYE_M} m above the scan's surface there (${ground.toFixed(2)} m; the ground under it ${r.dtm[cellAt].toFixed(2)} m). Things within ${NEAR_M} m are left out, both ways. ${buildings.length} mapped buildings for names.`,
      '',
      `The skyline by marching (${tA} ms) and by binning every cell (${tB} ms), 360 bins of 1 deg: median gap ${median.toFixed(3)} deg, 95% within ${p95.toFixed(3)} deg, the largest ${worst.toFixed(3)} deg at ${worstBin} deg (march ${a.angle[worstBin].toFixed(2)}, bins ${b.angle[worstBin].toFixed(2)}).`,
      '',
      '| bearing | march (deg) | bins (deg) | what stands there |',
      '|---|---|---|---|',
      ...[0, 45, 90, 135, 180, 225, 250, 270, 290, 315].map((d) => `| ${d} | ${a.angle[d].toFixed(2)} | ${b.angle[d].toFixed(2)} | ${a.cell[d] < 0 ? '—' : `${whatAt(r, a.cell[d], buildings)}, ${a.distanceM[d].toFixed(0)} m`} |`),
      '',
      `The sun on 28 Oct 2026, sunset ${sunset.toISOString().slice(11, 16)} UTC:`,
      '',
      '| by the march | by the bins | apart |',
      '|---|---|---|',
    )
    const n = Math.max(ea.length, eb.length)
    let worstMin = 0
    for (let i = 0; i < n; i += 1) {
      const p = ea[i]
      const q = eb[i]
      const say = (e) => (e === undefined ? '—' : eventLine({ ...e, body: 'sun', what: a.cell[e.bin] < 0 ? 'the ground' : whatAt(r, a.cell[e.bin], buildings) }, sunset, TZ))
      const apart = p !== undefined && q !== undefined && p.kind === q.kind ? Math.abs(p.at.getTime() - q.at.getTime()) / 60_000 : null
      if (apart === null) worstMin = Infinity
      else worstMin = Math.max(worstMin, apart)
      lines.push(`| ${say(p)} | ${say(q)} | ${apart === null ? 'not matched' : `${apart.toFixed(1)} min`} |`)
    }
    if (n === 0) lines.push('| nothing the scan measured stands in front of the sun | the same | — |')
    lines.push('')
    if (p95 > 0.5) fail(`${place.name}: the two skylines are more than 0.5 deg apart on more than 5% of bearings`)
    if (worstMin > 3) fail(`${place.name}: a sun event differs by more than 3 min between the two skylines, or is found by one only`)
  }
} catch (error) {
  console.error(`could not look: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(2)
}

const date = new Date().toISOString().slice(0, 10)
const out = ['# The skyline, two ways', '', `Run: ${new Date().toISOString()} · node scripts/measure-skyline.mjs · USGS 3DEP lidar (the app's download, depth 2) · OpenFreeMap buildings · suncalc`, '', ...lines, ok ? 'Pass.' : 'FAIL.', '']
writeFileSync(`measurements/${date}-skyline.md`, out.join('\n'))
console.log(out.join('\n'))
process.exit(ok ? 0 : 1)
