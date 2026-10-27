/*
 * WHAT ONE OPENFREEMAP VECTOR TILE WEIGHS, FOR THE SIZE SHOWN BEFORE A DOWNLOAD.
 *
 * Usage:  node scripts/measure-vector-tiles.mjs
 * Writes: measurements/<today>-vector-tiles.md
 *
 * WHY. A saved area now holds the map tiles its buildings and sea come from
 * (src/lib/vectorTiles.ts). Their server answers HEAD with no length, so the
 * app cannot measure them before downloading, the same as terrain: it
 * multiplies a count by the mean recorded here, and the size line says the
 * share is an estimate.
 *
 * THE SAME TILE LISTS THE APP SAVES: a venue ring (elevation 14 to 15, so
 * vector 14) at 400 m and 2000 m, and the 3D overview (1500 m, elevation 0
 * to 15, so vector 12 to 14), over forest and over a beach town. Bytes are
 * the body as stored, after the transfer's own compression is undone.
 */
import { writeFileSync } from 'node:fs'
import { boxAround, tilesForRange, tileUrl } from '../src/lib/tileRange.ts'
import { TERRAIN_ZOOMS, VECTOR_TEMPLATE, vectorZoomsFor } from '../src/lib/offlineSources.ts'
import { OVERVIEW_RADIUS_M, OVERVIEW_TERRAIN_ZOOMS } from '../src/lib/offline3d.ts'

const VENUES = [
  { name: 'Big Meadow, Shenandoah', at: { lat: 38.5195, lon: -78.444 } },
  { name: 'Virginia Beach Fishing Pier', at: { lat: 36.8435575, lon: -75.9713104 } },
]
const AREAS = [
  { what: 'venue ring 400 m', radius: 400, zooms: vectorZoomsFor(TERRAIN_ZOOMS) },
  { what: 'venue ring 2000 m', radius: 2000, zooms: vectorZoomsFor(TERRAIN_ZOOMS) },
  { what: '3D overview', radius: OVERVIEW_RADIUS_M, zooms: vectorZoomsFor(OVERVIEW_TERRAIN_ZOOMS) },
]

async function weigh(url) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20_000) })
      return { status: response.status, bytes: response.ok ? (await response.arrayBuffer()).byteLength : 0 }
    } catch {
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
  return { status: 0, bytes: 0 }
}

const rows = []
const weighed = new Map()
for (const venue of VENUES) {
  for (const area of AREAS) {
    const urls = tilesForRange(boxAround(venue.at, area.radius), area.zooms[0], area.zooms[1]).map((t) => tileUrl(VECTOR_TEMPLATE, t))
    let bytes = 0
    let failed = 0
    for (const url of urls) {
      if (!weighed.has(url)) weighed.set(url, await weigh(url))
      const w = weighed.get(url)
      if (w.status !== 200) failed += 1
      bytes += w.bytes
    }
    rows.push({ venue: venue.name, ...area, tiles: urls.length, bytes, failed })
    console.log(venue.name, area.what, urls.length, bytes, failed)
  }
}
const all = [...weighed.values()].filter((w) => w.status === 200)
const mean = Math.round(all.reduce((s, w) => s + w.bytes, 0) / all.length)
const out = [
  '# What one OpenFreeMap vector tile weighs',
  '',
  `Run: ${new Date().toISOString()} · node scripts/measure-vector-tiles.mjs · ${VECTOR_TEMPLATE}`,
  '',
  '| venue | area | vector zooms | tiles | bytes | failed |',
  '|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.venue} | ${r.what} | ${r.zooms[0]} to ${r.zooms[1]} | ${r.tiles} | ${r.bytes} | ${r.failed} |`),
  '',
  `Distinct tiles weighed: ${all.length} of ${weighed.size}. Mean bytes per tile: ${mean}.`,
  '',
]
const file = `measurements/${new Date().toISOString().slice(0, 10)}-vector-tiles.md`
writeFileSync(file, out.join('\n'))
console.log(out.join('\n'))
