/*
 * THE LIGHT MAP AGAINST A PHOTOGRAPH: VIRGINIA BEACH OCEANFRONT, 27 OCT 2026,
 * JUST AFTER SUNRISE.
 *
 * Usage:  node scripts/measure-light-map-oceanfront.mjs
 * Writes: measurements/<today>-light-map-oceanfront.md
 * Exits:  0 the map matches what the photo shows; 1 not; 2 could not look.
 *
 * The shooter's drone photo from offshore at 07:37 that morning shows the
 * east-facing fronts of the oceanfront hotels lit pink and the ground at
 * their feet in shade. At 07:25 and at 07:37 EDT, from the public lidar scan
 * as the app downloads it, with the sea taken out as the app does
 * (src/lib/lightmap/lightMapFor.ts landSurface):
 *
 *   fronts   each row's first tall building west of the beach (more than
 *            15 m over the ground): its east wall, as the app draws walls
 *            (src/core/lightMap.ts wallSunMinutes: a point on the wall at
 *            half its height, toward the sun), and again by that point's
 *            skyline (src/core/skyRing.ts)
 *   beach    measured ground between those fronts and the sea
 *   behind   measured ground within 40 m west of the hotels' backs
 *
 * Ground cells two ways: rays (sunMinutesByRays, what the app draws) and
 * each cell's skyline (sunMinutesBySkyline), which must agree.
 */
import { writeFileSync } from 'node:fs'
import { createLazPerf } from 'laz-perf'
import { getTimes } from 'suncalc'
import { areaFor } from '../src/lib/lidar/grid.ts'
import { LIDAR_BUCKET, nodesFor, pickDepth } from '../src/lib/lidar/ept.ts'
import { decodeTile } from '../src/lib/lidar/decode.ts'
import { buildRasters, KIND, STRIDE } from '../src/lib/lidar/raster.ts'
import { litByRay, sunMinutesBySkyline, wallSunMinutes } from '../src/core/lightMap.ts'
import { skylineAt, skylineByMarch } from '../src/core/skyRing.ts'
import { getSunPosition } from '../src/core/sun.ts'
import { builtIn, landSurface } from '../src/lib/lightmap/lightMapFor.ts'
import { seaTestAround } from '../src/lib/coast.ts'
import { setVectorLoader } from '../src/lib/vectorTiles.ts'

const mem = new Map()
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) }
setVectorLoader(async (u) => {
  const r = await fetch(u)
  return r.ok ? r.arrayBuffer() : null
})
const get = async (u) => (await fetch(u)).json()

/* The oceanfront hotels between 9th and 15th Streets, in the photo's foreground. */
const PLACE = { name: 'Virginia Beach Oceanfront', lat: 36.838, lon: -75.9737, project: 'USGS_LPC_VA_Norfolk_2013_LAS_2015' }
const TIMES = [
  { label: '07:25 EDT', at: new Date('2026-10-27T11:25:00Z') },
  { label: '07:37 EDT (the photo)', at: new Date('2026-10-27T11:37:35Z') },
]
const TALL_M = 15
const BEHIND_M = 40
/* What "lit" and "in shade" must mean for the map to match the photo. */
const FRONTS_LIT_MIN = 0.8
const BEHIND_SHADE_MIN = 0.8

const lines = []
let ok = true
try {
  const area = areaFor(PLACE.lat, PLACE.lon)
  const base = `${LIDAR_BUCKET}/${PLACE.project}`
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
  const cellM = r.cell * Math.cos((PLACE.lat * Math.PI) / 180)
  const isSea = await seaTestAround({ lat: PLACE.lat, lon: PLACE.lon }, (Math.hypot(r.width, r.height) * cellM) / 2 + 200)
  const dsm = landSurface(r, isSea)
  const g = { width: r.width, height: r.height, cellM, dsm }
  let top = -Infinity
  for (const z of dsm) if (!Number.isNaN(z) && z > top) top = z
  /* A building: classified as one, or (this 2013 scan classifies none) unclassified and standing tall, as the app reads it. */
  const built = builtIn(r)
  const tall = (i) => built(i) && !Number.isNaN(dsm[i]) && dsm[i] - r.dtm[i] > TALL_M
  const bare = (i) => !Number.isNaN(dsm[i]) && r.ground?.[i] === 1 && r.kind[i] === KIND.ground

  /* Per row: walk west from the sea to the first tall building (the front); the beach is the bare ground passed on the way; then on to the building's back. */
  const fronts = []
  const beach = []
  const behind = []
  const behindCells = Math.round(BEHIND_M / cellM)
  for (let y = 0; y < r.height; y += 1) {
    let x = r.width - 1
    while (x >= 0 && Number.isNaN(dsm[y * r.width + x])) x -= 1
    const passed = []
    while (x > 0 && !tall(y * r.width + x)) {
      if (bare(y * r.width + x)) passed.push(x)
      x -= 1
    }
    if (x <= 0 || x >= r.width - 1) continue
    /* Only a hotel facing open beach: at least 20 m of bare ground between it and the sea. */
    if (passed.length * cellM < 20) continue
    const i = y * r.width + x
    fronts.push({ x, y, wallTop: dsm[i], foot: r.dtm[i] })
    for (const bx of passed) beach.push({ x: bx, y })
    let w = x
    while (w > 0 && built(y * r.width + w)) w -= 1
    for (let k = w; k > Math.max(0, w - behindCells); k -= 1) if (bare(y * r.width + k)) behind.push({ x: k, y })
  }
  if (fronts.length < 50) throw new Error(`found ${fronts.length} hotel fronts facing the beach; expected the oceanfront's`)

  lines.push(`## ${PLACE.name}`, '', `Scan ${PLACE.project}, ${r.width} x ${r.height} cells of ${cellM.toFixed(3)} m around ${PLACE.lat}, ${PLACE.lon}; sea taken out as the app does. ${fronts.length} rows meet a hotel more than ${TALL_M} m tall facing at least 20 m of beach; ${beach.length} beach cells; ${behind.length} ground cells within ${BEHIND_M} m behind the hotels.`, '')
  const sunrise = getTimes(new Date('2026-10-27T16:00:00Z'), PLACE.lat, PLACE.lon).sunrise
  lines.push(`Sunrise (suncalc): ${sunrise.toISOString().slice(11, 16)} UTC.`, '')
  lines.push('| time | sun azimuth, altitude | east fronts lit (the app walls) | east fronts lit (skylines) | beach lit (rays) | beach lit (skylines, 200 cells) | ground behind in shade (rays) | behind in shade (skylines, 200 cells) |', '|---|---|---|---|---|---|---|---|')

  const sample = (list, n) => list.filter((_, i) => i % Math.max(1, Math.floor(list.length / n)) === 0).slice(0, n)
  const results = []
  const blockerLines = []
  for (const t of TIMES) {
    const sun = getSunPosition(t.at, PLACE.lat, PLACE.lon)
    const steps = [{ at: t.at, azimuth: sun.azimuth, altitude: sun.altitude, minutes: 1 }]
    /* The app's walls, and the same point's skyline: the east face, half way up, a little outside it. */
    const walls = wallSunMinutes({ ...g, dtm: r.dtm }, built, { x0: 0, y0: 0, x1: r.width, y1: r.height }, steps)
    let litFronts = 0
    let litSky = 0
    let wallless = 0
    const blockers = []
    for (const f of fronts) {
      /* The front's east wall as the app finds it: the first cell from the front eastward (two at most: a lidar edge pixel stands a little lower) with a wall. */
      let wx = -1
      for (let k = 0; k <= 2 && wx < 0; k += 1) if (!Number.isNaN(walls[f.y * r.width + f.x + k])) wx = f.x + k
      if (wx < 0) {
        wallless += 1
        continue
      }
      const v = walls[f.y * r.width + wx]
      if (v > 0) litFronts += 1
      /* The same point by its skyline: half way up that wall, a little outside it. */
      const i = f.y * r.width + wx
      const j = i + 1
      const foot = Math.max(dsm[j], r.dtm[i])
      const midZ = foot + (dsm[i] - foot) / 2
      const sky = skylineByMarch(g, wx + 1.1, f.y + 0.5, midZ, 0.1, Infinity, 0.75)
      const skyLit = sun.altitude > 0 && sun.altitude > skylineAt(sky, sun.azimuth)
      if (skyLit) litSky += 1
      /* What stands in the way of an unlit one: walk the ray to the first cell above it. */
      if (v === 0) {
        const e = Math.sin((sun.azimuth * Math.PI) / 180)
        const n = Math.cos((sun.azimuth * Math.PI) / 180)
        const tanAlt = Math.tan((sun.altitude * Math.PI) / 180)
        for (let c = 0.5; c < 1500; c += 0.5) {
          const px = Math.floor(wx + 1.1 + e * c)
          const py = Math.floor(f.y + 0.5 - n * c)
          if (px < 0 || py < 0 || px >= r.width || py >= r.height) break
          const z = dsm[py * r.width + px]
          if (!Number.isNaN(z) && z > midZ + c * cellM * tanAlt) {
            blockers.push({ d: c * cellM, built: built(py * r.width + px), rise: z - midZ })
            break
          }
        }
      }
    }
    const withWall = fronts.length - wallless
    const litShare = (list) => list.filter((c) => litByRay(g, c.x, c.y, sun.azimuth, sun.altitude, top)).length / list.length
    const skyShare = (list) => {
      const s = sample(list, 200)
      return s.filter((c) => sunMinutesBySkyline(g, c.x, c.y, steps) > 0).length / s.length
    }
    const fr = litFronts / withWall
    const frs = litSky / withWall
    blockers.sort((a, b) => a.d - b.d)
    const byBuilt = blockers.filter((b) => b.built).length
    const median = blockers.length === 0 ? null : blockers[Math.floor(blockers.length / 2)]
    const bl = litShare(beach)
    const bls = skyShare(beach)
    const bh = 1 - litShare(behind)
    const bhs = 1 - skyShare(behind)
    results.push({ t, fr, bl, bh })
    const pct = (v) => `${(100 * v).toFixed(1)}%`
    lines.push(`| ${t.label} | ${sun.azimuth.toFixed(1)}°, ${sun.altitude.toFixed(2)}° | ${pct(fr)} of ${withWall}${wallless > 0 ? ` (${wallless} rows with no wall found)` : ''} | ${pct(frs)} | ${pct(bl)} | ${pct(bls)} | ${pct(bh)} | ${pct(bhs)} |`)
    blockerLines.push(`At ${t.label}, the ${blockers.length} unlit fronts: ${byBuilt} shaded by a building${blockers.length - byBuilt > 0 ? `, ${blockers.length - byBuilt} by something else the scan measured (trees, posts)` : ''}; the nearest blocker a median ${median === null ? '-' : median.d.toFixed(0)} m away toward the sun, standing ${median === null ? '-' : median.rise.toFixed(0)} m over the point on the wall.`)
    if (Math.abs(bl - bls) > 0.07 || Math.abs(bh - bhs) > 0.05 || Math.abs(fr - frs) > 0.05) {
      ok = false
      lines.push('', `FAIL: at ${t.label} the two ways disagree (beach by more than 7 points, or fronts or behind by more than 5)`)
    }
  }
  lines.push('', ...blockerLines.flatMap((l) => [l, '']))
  const photo = results[1]
  const matches = photo.fr >= FRONTS_LIT_MIN && photo.bh >= BEHIND_SHADE_MIN
  lines.push(
    `What the photo shows at 07:37: the east fronts lit, and the ground at the hotels' feet in shade. The map: ${(100 * photo.fr).toFixed(1)}% of fronts lit, ${(100 * photo.bh).toFixed(1)}% of the ground behind the hotels in shade, ${(100 * photo.bl).toFixed(1)}% of the beach in front of them lit. ${matches ? 'It matches: fronts lit, behind them shade.' : 'It does NOT match.'}`,
    '',
  )
  if (!matches) ok = false
} catch (error) {
  console.error(`could not look: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(2)
}

const date = new Date().toISOString().slice(0, 10)
const out = ['# The light map against the sunrise photo', '', `Run: ${new Date().toISOString()} · node scripts/measure-light-map-oceanfront.mjs · USGS 3DEP lidar (the app's download, depth 2) · suncalc · photo DJI_20261027073735_0094_D (07:37:35 EDT, from offshore, looking north-northwest)`, '', ...lines, ok ? 'Pass.' : 'FAIL.', '']
writeFileSync(`measurements/${date}-light-map-oceanfront.md`, out.join('\n'))
console.log(out.join('\n'))
process.exit(ok ? 0 : 1)
