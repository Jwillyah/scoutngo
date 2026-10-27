/*
 * THE ELEVATION CLEANED WITH NO COASTLINE: WHAT IT FIXES, AND WHAT IT LEAVES.
 *
 * Usage:  node scripts/measure-coast-artefacts.mjs
 * Writes: measurements/<today>-coast-artefacts.md
 * Exits:  0 the pier's shoreline within the limit at every zoom and no
 *         control coast cleared; 1 not; 2 could not look.
 *
 * No browser and no Overpass: raw Terrarium tiles from AWS, decoded here and
 * cleaned by the app's own code (src/core/coastArtefacts.ts), one tile at a
 * time with its neighbours' margin, exactly as src/lib/seaMask.ts does.
 *
 * THE PIER. The 3 x 3 tiles around Virginia Beach Fishing Pier at zooms 15,
 * 14 and 13, cleaned tile by tile and stitched, then the same shoreline
 * check as scripts/measure-terrain-coast.mjs: along the OpenStreetMap
 * coastline (scripts/fixtures/virginia-beach-coastline.json) and 15 m either
 * side every 5 m, and across it from 60 m out to 60 m in. Margins of 128 and
 * 64 pixels, so the margin the app uses is shown against one too small.
 *
 * THE CONTROLS, real coasts that must come through: Dover's chalk cliffs, Big
 * Sur at Bixby Creek, Point Lobos, Jockey's Ridge (the tallest dune on the
 * east coast), Cape Hatteras, and the Brew River venue on the Wicomico. For
 * each, how many pixels the wall rule drew at sea level and how many of
 * those stood over 10 m: the wall rule must not clear a cliff or a dune.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { cleanTileInContext, CONTEXT_MARGIN_PX, metresPerPixel } from '../src/core/coastArtefacts.ts'
import { bearingBetween, destinationPoint, distanceMeters } from '../src/core/geo.ts'
import { parseCoastlines } from '../src/lib/seaMask.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'

const PIER = { lat: 36.8435575, lon: -75.9713104 }
const MAX_STEP_M = 3
const FIXTURE = 'scripts/fixtures/virginia-beach-coastline.json'
const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8'))

function png(buf) {
  let off = 8, w = 0, h = 0, ct = 0
  const idat = []
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString('latin1', off + 4, off + 8), data = buf.subarray(off + 8, off + 8 + len)
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9] }
    if (type === 'IDAT') idat.push(data)
    off += 12 + len
  }
  const bpp = ct === 6 ? 4 : 3
  const raw = inflateSync(Buffer.concat(idat)), out = Buffer.alloc(w * h * bpp), stride = w * bpp
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0, b = y > 0 ? out[(y - 1) * stride + x] : 0, c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f]
      out[y * stride + x] = (line[x] + pred) & 255
    }
  }
  const metres = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) metres[i] = out[i * bpp] * 256 + out[i * bpp + 1] + out[i * bpp + 2] / 256 - 32768
  return metres
}

const tileOf = (p, z) => {
  const n = 2 ** z
  return {
    x: Math.floor(((p.lon + 180) / 360) * n),
    y: Math.floor(((1 - Math.log(Math.tan((p.lat * Math.PI) / 180) + 1 / Math.cos((p.lat * Math.PI) / 180)) / Math.PI) / 2) * n),
  }
}

/* K x K raw tiles around a point, as one grid. */
async function mosaic(p, z, K) {
  const t = tileOf(p, z), r = (K - 1) / 2, S = 256 * K, grid = new Float32Array(S * S)
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const res = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${t.x + dx}/${t.y + dy}.png`)
      if (!res.ok) throw new Error(`HTTP ${res.status} for terrarium ${z}/${t.x + dx}/${t.y + dy}`)
      const m = png(Buffer.from(await res.arrayBuffer()))
      for (let y = 0; y < 256; y++) grid.set(m.subarray(y * 256, (y + 1) * 256), ((dy + r) * 256 + y) * S + (dx + r) * 256)
    }
  }
  return { grid, S, x0: t.x - r, y0: t.y - r }
}

/* The middle (K-2) x (K-2) tiles cleaned one at a time, each with its eight neighbours, as the app does. */
function cleanTiles(m, K, lat, z, margin) {
  const { grid, S } = m
  const out = Float32Array.from(grid)
  let cleared = 0, spikes = 0, ms = 0, tiles = 0
  for (let ty = 1; ty < K - 1; ty++) {
    for (let tx = 1; tx < K - 1; tx++) {
      const nine = []
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const t = new Float32Array(256 * 256)
        for (let y = 0; y < 256; y++) t.set(grid.subarray(((ty + dy) * 256 + y) * S + (tx + dx) * 256, ((ty + dy) * 256 + y) * S + (tx + dx) * 256 + 256), y * 256)
        nine.push(t)
      }
      const started = performance.now()
      const { heights, result } = cleanTileInContext(nine, 256, metresPerPixel(lat, z), margin)
      ms += performance.now() - started
      tiles += 1
      cleared += result.cleared
      spikes += result.spikes
      for (let y = 0; y < 256; y++) out.set(heights.subarray(y * 256, (y + 1) * 256), (ty * 256 + y) * S + tx * 256)
    }
  }
  return { out, cleared, spikes, msPerTile: ms / tiles }
}

/* ------------------------------------------------------------ the pier */
const coast = parseCoastlines(fixture)
const shore = []
for (const way of coast) {
  for (let i = 0; i + 1 < way.length; i++) {
    const a = { lon: way[i][0], lat: way[i][1] }, b = { lon: way[i + 1][0], lat: way[i + 1][1] }
    const len = distanceMeters(a, b), brg = bearingBetween(a, b)
    for (let m = 0; m < len; m += 5) {
      const p = destinationPoint(a, brg, m)
      if (distanceMeters(p, PIER) <= 1000) shore.push({ p, land: (brg + 270) % 360 })
    }
  }
}
shore.sort((x, y) => x.p.lat - y.p.lat)
if (shore.length < 50) {
  console.log(`=== COAST ARTEFACTS ABORTED: only ${shore.length} shoreline samples ===`)
  process.exit(2)
}
const lines = [-15, 0, 15].map((off) => shore.map((s) => destinationPoint(s.p, s.land, off)))
const profiles = []
for (let i = 0; i < shore.length; i += 10) profiles.push(Array.from({ length: 25 }, (_, k) => destinationPoint(shore[i].p, shore[i].land, -60 + k * 5)))

function sampler(m, z) {
  const n = 2 ** z
  return (g, p) => {
    const fx = ((p.lon + 180) / 360) * n
    const fy = ((1 - Math.log(Math.tan((p.lat * Math.PI) / 180) + 1 / Math.cos((p.lat * Math.PI) / 180)) / Math.PI) / 2) * n
    const x = (fx - m.x0) * 256 - 0.5, y = (fy - m.y0) * 256 - 0.5
    const x0 = Math.floor(x), y0 = Math.floor(y), u = x - x0, v = y - y0
    const G = (a, b) => Math.max(0, g[b * m.S + a])
    return (G(x0, y0) * (1 - u) + G(x0 + 1, y0) * u) * (1 - v) + (G(x0, y0 + 1) * (1 - u) + G(x0 + 1, y0 + 1) * u) * v
  }
}
const maxStep = (at, g, ls) => ls.reduce((worst, l) => {
  const hs = l.map((p) => at(g, p))
  for (let i = 1; i < hs.length; i++) worst = Math.max(worst, Math.abs(hs[i] - hs[i - 1]))
  return worst
}, 0)

const pierRows = []
let pass = true
try {
  for (const z of [15, 14, 13]) {
    const m = await mosaic(PIER, z, 5)
    const at = sampler(m, z)
    for (const margin of [CONTEXT_MARGIN_PX, 64]) {
      const c = cleanTiles(m, 5, PIER.lat, z, margin)
      const row = {
        z, margin,
        rawAlong: maxStep(at, m.grid, lines), rawAcross: maxStep(at, m.grid, profiles),
        along: maxStep(at, c.out, lines), across: maxStep(at, c.out, profiles),
        cleared: c.cleared, spikes: c.spikes, ms: c.msPerTile,
      }
      pierRows.push(row)
      if (margin === CONTEXT_MARGIN_PX && (row.along > MAX_STEP_M || row.across > MAX_STEP_M)) pass = false
      console.log(`pier z${z} margin ${margin}: along ${row.along.toFixed(2)} across ${row.across.toFixed(2)} (raw ${row.rawAlong.toFixed(2)} / ${row.rawAcross.toFixed(2)})`)
    }
  }
} catch (error) {
  console.log(`=== COAST ARTEFACTS ABORTED: ${error instanceof Error ? error.message : String(error)} ===`)
  process.exit(2)
}

/* ------------------------------------------------------------ controls */
const CONTROLS = [
  ['Dover, the chalk cliffs', { lat: 51.1295, lon: 1.3389 }],
  ['Big Sur, Bixby Creek', { lat: 36.3715, lon: -121.9017 }],
  ['Point Lobos', { lat: 36.5167, lon: -121.95 }],
  ["Jockey's Ridge", { lat: 35.964, lon: -75.633 }],
  ['Cape Hatteras', { lat: 35.2509, lon: -75.5288 }],
  ['Brew River (calibration venue)', { lat: Number(CALIBRATION_VENUE.latitude), lon: Number(CALIBRATION_VENUE.longitude) }],
]
const controlRows = []
try {
  for (const [name, p] of CONTROLS) {
    for (const z of [15, 13]) {
      const m = await mosaic(p, z, 3)
      const c = cleanTiles(m, 3, p.lat, z, CONTEXT_MARGIN_PX)
      let changed = 0, over10 = 0, worst = 0
      for (let ty = 1; ty < 2; ty++) for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
        const i = (ty * 256 + y) * m.S + 256 + x
        const drop = Math.max(0, m.grid[i]) - c.out[i]
        if (drop > 0.01) { changed++; worst = Math.max(worst, drop); if (m.grid[i] > 10) over10++ }
      }
      controlRows.push({ name, z, cleared: c.cleared, spikes: c.spikes, changed, over10, worst })
      console.log(`${name} z${z}: wall rule ${c.cleared}, spikes ${c.spikes}, changed ${changed}, over 10 m ${over10}`)
    }
  }
} catch (error) {
  console.log(`=== COAST ARTEFACTS ABORTED: ${error instanceof Error ? error.message : String(error)} ===`)
  process.exit(2)
}
/* A cliff or a dune cleared by the wall rule fails: Dover, Big Sur and Point Lobos must have none at all. */
for (const r of controlRows) if (/Dover|Big Sur|Point Lobos/.test(r.name) && r.cleared > 0) pass = false

const f = (n) => n.toFixed(2)
const out = [
  '# The elevation cleaned with no coastline (src/core/coastArtefacts.ts)',
  '',
  `Run: ${new Date().toISOString()} · node scripts/measure-coast-artefacts.mjs · raw Terrarium tiles from AWS, cleaned one tile at a time with its neighbours`,
  `Pier: ${PIER.lat}, ${PIER.lon}; ${shore.length} shoreline samples within 1 km, every 5 m, placed by the OpenStreetMap coastline in ${FIXTURE}.`,
  `Limit: no step over ${MAX_STEP_M} m along or across the shoreline, at the margin the app uses (${CONTEXT_MARGIN_PX} px).`,
  '',
  '## Virginia Beach Fishing Pier',
  '',
  '| zoom | margin (px) | raw along (m) | raw across (m) | cleaned along (m) | cleaned across (m) | wall rule (px) | spikes (px) | ms per tile |',
  '|---|---|---|---|---|---|---|---|---|',
  ...pierRows.map((r) => `| ${r.z} | ${r.margin} | ${f(r.rawAlong)} | ${f(r.rawAcross)} | ${f(r.along)} | ${f(r.across)} | ${r.cleared} | ${r.spikes} | ${Math.round(r.ms)} |`),
  '',
  'Raw is the tile as served with only the sea bed drawn at 0. The ms per tile are this laptop, not a phone.',
  '',
  '## Real coasts that must come through',
  '',
  'The middle tile of 3 x 3 at each place. Changed counts every pixel lowered by any rule; over 10 m counts those that stood over 10 m.',
  '',
  '| place | zoom | wall rule (px) | spikes (px) | changed (px) | over 10 m (px) | largest drop (m) |',
  '|---|---|---|---|---|---|---|',
  ...controlRows.map((r) => `| ${r.name} | ${r.z} | ${r.cleared} | ${r.spikes} | ${r.changed} | ${r.over10} | ${f(r.worst)} |`),
  '',
  `${pass ? 'Pass.' : 'FAIL.'}`,
  '',
]
const file = `measurements/${new Date().toISOString().slice(0, 10)}-coast-artefacts.md`
writeFileSync(file, out.join('\n'))
console.log(out.join('\n'))
process.exit(pass ? 0 : 1)
