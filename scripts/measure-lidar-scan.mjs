/*
 * A VENUE'S 3D SCAN, END TO END, AS THE PHONE WOULD BUILD IT.
 *
 * Usage:  node scripts/measure-lidar-scan.mjs
 * Writes: measurements/<today>-lidar-scan.md
 * Exits:  0 every check within its limit; 1 not; 2 could not look.
 *
 * At Virginia Beach Fishing Pier and Brew River Dock Bar, with the app's own
 * modules: the offer (src/lib/lidar/offer.ts, worked out with no network),
 * the tile index and depth for 2 points per m² (ept.ts), every chosen tile
 * decoded (decode.ts, laz-perf for Node here, the same decoder the worker
 * loads in the browser), the rasters (raster.ts), and each OpenFreeMap
 * footprint's height from the scan two ways (buildingHeights.ts):
 *
 *   size       the offer's estimate against the bytes really downloaded
 *   heights    by points (95th percentile of the roof points) against by
 *              raster (95th percentile of the surface cells), per building;
 *              the share within HEIGHT_AGREE_M must be at least AGREE_SHARE
 *   the map    where OpenStreetMap carries a height (the tiles' 'tile' source),
 *              the scan's beside it, as a third look
 */
import { writeFileSync } from 'node:fs'
import { createLazPerf } from 'laz-perf'
import { offerFor } from '../src/lib/lidar/offer.ts'
import { LIDAR_BUCKET, nodesFor, pickDepth, DENSITY_DEFAULT } from '../src/lib/lidar/ept.ts'
import { decodeTile } from '../src/lib/lidar/decode.ts'
import { buildRasters, STRIDE, KIND } from '../src/lib/lidar/raster.ts'
import { HEIGHT_AGREE_M, scanHeight } from '../src/lib/lidar/buildingHeights.ts'
import { mercator, unmercator } from '../src/lib/lidar/grid.ts'
import { buildingsFromTiles, setVectorLoader } from '../src/lib/vectorTiles.ts'

const VENUES = [
  { name: 'Virginia Beach Fishing Pier', lat: 36.8435575, lon: -75.9713104 },
  { name: 'Brew River Dock Bar', lat: 38.364236, lon: -75.605912 },
]
/* At least this share of the measured buildings must agree within HEIGHT_AGREE_M. */
const AGREE_SHARE = 0.8
setVectorLoader(async (url) => {
  const r = await fetch(url)
  return r.ok ? r.arrayBuffer() : null
})

const lines = []
let ok = true
const fail = (why) => {
  ok = false
  lines.push(`FAIL: ${why}`)
}
try {
  const Laz = await createLazPerf()
  for (const v of VENUES) {
    const offer = await offerFor(v.lat, v.lon, DENSITY_DEFAULT)
    if (offer === null) {
      fail(`${v.name}: no lidar offered`)
      continue
    }
    const base = `${LIDAR_BUCKET}/${offer.project}`
    const t0 = Date.now()
    const meta = await (await fetch(`${base}/ept.json`)).json()
    const nodes = await nodesFor(meta, offer.area, async (key) => (await fetch(`${base}/ept-hierarchy/${key}.json`)).json())
    const pick = pickDepth(nodes, offer.area, DENSITY_DEFAULT)
    let pts = new Float64Array(1 << 22)
    let used = 0
    let bytes = 0
    for (const n of pick.nodes) {
      const data = new Uint8Array(await (await fetch(`${base}/ept-data/${n.key}.laz`)).arrayBuffer())
      bytes += data.length
      decodeTile(Laz, data, offer.area, (x, y, z, cls, ret) => {
        if (used + STRIDE > pts.length) {
          const b = new Float64Array(pts.length * 2)
          b.set(pts)
          pts = b
        }
        pts.set([x, y, z, cls, ret], used)
        used += STRIDE
      })
    }
    const points = pts.subarray(0, used)
    const r = buildRasters(points, offer.area)
    const seconds = (Date.now() - t0) / 1000
    const kinds = {}
    for (const k of r.kind) kinds[k] = (kinds[k] ?? 0) + 1
    const sw = unmercator(offer.area.minx, offer.area.miny)
    const ne = unmercator(offer.area.maxx, offer.area.maxy)
    const tiles = await buildingsFromTiles({ south: sw.lat, west: sw.lon, north: ne.lat, east: ne.lon })
    const buildings = tiles.status === 'ok' ? tiles.buildings : []
    let measured = 0
    let newer = 0
    let agree = 0
    const mapRows = []
    let worstAgree = 0
    for (const b of buildings) {
      const ring = b.ring.map(([lon, lat]) => mercator(lat, lon))
      const h = scanHeight(ring, points, r)
      if (h.kind === 'newer-than-scan') newer += 1
      if (h.kind !== 'measured') continue
      measured += 1
      const d = Math.abs(h.metres - h.byRaster)
      if (d <= HEIGHT_AGREE_M) agree += 1
      worstAgree = Math.max(worstAgree, d)
      if (b.height.metres !== null && mapRows.length < 12) mapRows.push(`| ${b.id} | ${b.height.metres.toFixed(0)} | ${h.metres.toFixed(1)} | ${h.byRaster.toFixed(1)} |`)
    }
    const share = measured === 0 ? 0 : agree / measured
    lines.push(
      `## ${v.name}`,
      '',
      `Project ${offer.project} (scanned ${offer.year ?? '?'}). Patch ${offer.area.id}, ${Math.round((offer.area.maxx - offer.area.minx) * offer.area.metresPerUnit)} m square on the ground.`,
      `Offer, worked out with no network: about ${(offer.bytes / 1e6).toFixed(1)} MB at ${offer.density.toFixed(2)} points per m². Downloaded: ${pick.nodes.length} tiles to depth ${pick.depth}, ${(bytes / 1e6).toFixed(1)} MB, ${used / STRIDE} points in the patch (${pick.density.toFixed(2)} per m² by the index), in ${seconds.toFixed(0)} s on this Mac.`,
      `Rasters ${r.width} x ${r.height} at 1 m: ground ${kinds[KIND.ground] ?? 0} cells, tall and unclassified (roofs, trees) ${kinds[KIND.tall] ?? 0}, classified building ${kinds[KIND.building] ?? 0}, classified vegetation ${kinds[KIND.vegetation] ?? 0}, water ${kinds[KIND.water] ?? 0}, nothing measured ${kinds[KIND.none] ?? 0}.`,
      '',
      `Footprints from the map tiles: ${buildings.length}. Measured by the scan: ${measured}. Newer than the scan (no roof returns): ${newer}.`,
      `Heights two ways (95th percentile of roof points, and of surface cells, minus the ground): ${agree} of ${measured} within ${HEIGHT_AGREE_M} m (${(share * 100).toFixed(0)}%, limit ${AGREE_SHARE * 100}%); largest difference ${worstAgree.toFixed(1)} m.`,
      '',
      '| building | map height (m, OSM via the tiles) | scan, by points (m) | scan, by surface (m) |',
      '|---|---|---|---|',
      ...(mapRows.length === 0 ? ['| (none in the patch carries an OSM height) | — | — | — |'] : mapRows),
      '',
    )
    if (measured < 10) fail(`${v.name}: only ${measured} buildings measured`)
    if (share < AGREE_SHARE) fail(`${v.name}: only ${(share * 100).toFixed(0)}% of buildings agree two ways`)
  }
} catch (error) {
  console.log(`=== LIDAR SCAN ABORTED: ${error instanceof Error ? error.message : String(error)} ===`)
  process.exit(2)
}
const out = ['# A venue\'s 3D scan, end to end', '', `Run: ${new Date().toISOString()} · node scripts/measure-lidar-scan.mjs · USGS 3DEP via ${LIDAR_BUCKET} · footprints from OpenFreeMap · density asked for ${DENSITY_DEFAULT} per m²`, '', ...lines, ok ? 'Pass.' : 'FAIL.', '']
writeFileSync(`measurements/${new Date().toISOString().slice(0, 10)}-lidar-scan.md`, out.join('\n'))
console.log(out.join('\n'))
process.exit(ok ? 0 : 1)
