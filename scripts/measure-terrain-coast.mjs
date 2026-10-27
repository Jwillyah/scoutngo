/*
 * VIRGINIA BEACH FISHING PIER: THE 3D GROUND AGAINST 2D, AND THE SHORELINE.
 *
 * Usage:  node scripts/measure-terrain-coast.mjs [--tiles-blocked]   (app on :5173, Chrome on :9222)
 * Writes: measurements/<today>-terrain-virginia-beach-tiles.md: the map tiles
 *         open, so the elevation is cleaned against their ocean polygons
 *         (src/core/oceanMask.ts); or, with --tiles-blocked,
 *         measurements/<today>-terrain-virginia-beach-no-tiles.md: the map
 *         tiles refused too, so it is cleaned from its own shape
 *         (src/core/coastArtefacts.ts).
 *         Every run: every Overpass server refused, as on the iPhone behind
 *         Private Relay, and nothing saved on the phone (local storage and
 *         the tile cache emptied), so the run measures this network and not
 *         an earlier one's leftovers.
 * Exits:  0 every point within 1 m of 2D, no shoreline step over 3 m, and the
 *         tiles cleaned the way the mode says; 1 not; 2 could not look.
 *
 * WHAT WAS WRONG. Terrarium's elevation off this beach carries bumps of 20 to
 * 77 m standing on the water, and its zoom 13 and 14 tiles carry the sea bed
 * where zoom 15 carries 0, so the 3D ground stood up in cliffs and stepped at
 * tile edges. The fix puts every pixel the map tiles' ocean covers at 0 m
 * before either view reads it (src/lib/seaMask.ts). The "raw" column here is
 * the tile as AWS serves it, decoded in this script, so the before and after
 * are side by side.
 *
 * THE COASTLINE THE POINTS ARE PLACED BY is OpenStreetMap's, fetched once
 * and kept in scripts/fixtures/virginia-beach-coastline.json, so the points
 * are the same every run and this script needs no Overpass. The app gets its
 * sea from the map tiles, or none (--tiles-blocked).
 *
 * THE POINTS. Ten along the pier, root to end. Ten along the beach: points on
 * the OSM coastline either side of the pier, moved 25 m inland, which is the
 * sand. 2D is MapLibre's terrain at each point with terrain on; 3D is the clay
 * model's own ground (sampleTerrain on the provider it draws).
 *
 * THE SHORELINE. Along 1 km of coastline either side of the pier, every 5 m,
 * on the line and 15 m to either side of it; and across it every 50 m, from
 * 60 m out to 60 m in, every 5 m. The largest rise or drop between
 * neighbouring samples is the step.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { connect } from './cdp.mjs'
import { goToStage, guardAudit, startWatchdog } from './preflight.mjs'
import { destinationPoint, distanceMeters, bearingBetween } from '../src/core/geo.ts'
import { terrariumMetres } from '../src/core/terrarium.ts'
import { shareLink } from '../src/lib/planShare.ts'
import { parseCoastlines } from '../src/lib/seaMask.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'
import { OVERPASS_SERVERS } from '../src/lib/overpassClient.ts'
import { VECTOR_ZOOMS } from '../src/lib/offlineSources.ts'

guardAudit('terrain coast')
const watchdog = startWatchdog('terrain coast', 600_000)
const PIER = { lat: 36.8435575, lon: -75.9713104 }
const PIER_BEARING = 90
const PIER_LENGTH_M = 380
const WITHIN_M = 1
const MAX_STEP_M = 3

/* --------------------------------------------- the coastline, for the points */
const BLOCKED = process.argv.includes('--tiles-blocked')
const TILE_HOST = 'tiles.openfreemap.org'
const FIXTURE = 'scripts/fixtures/virginia-beach-coastline.json'
const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8'))
const coast = parseCoastlines(fixture)
if (coast.length === 0) {
  console.log(`=== TERRAIN COAST ABORTED: no coastline in ${FIXTURE} ===`)
  process.exit(2)
}

/* The coastline as one walk of points every 5 m, within 1 km of the pier, each with the land side's bearing. */
const shore = []
for (const way of coast) {
  for (let i = 0; i + 1 < way.length; i += 1) {
    const a = { lon: way[i][0], lat: way[i][1] }
    const b = { lon: way[i + 1][0], lat: way[i + 1][1] }
    const len = distanceMeters(a, b)
    const brg = bearingBetween(a, b)
    for (let m = 0; m < len; m += 5) {
      const p = destinationPoint(a, brg, m)
      /* Land is on the left of a coastline way. */
      if (distanceMeters(p, PIER) <= 1000) shore.push({ p, land: (brg + 270) % 360 })
    }
  }
}
shore.sort((x, y) => x.p.lat - y.p.lat)
if (shore.length < 50) {
  console.log(`=== TERRAIN COAST ABORTED: only ${shore.length} shoreline samples near the pier ===`)
  process.exit(2)
}

const pierPoints = Array.from({ length: 10 }, (_, i) => ({ what: `pier ${i * Math.round(PIER_LENGTH_M / 9)} m`, p: destinationPoint(PIER, PIER_BEARING, (i * PIER_LENGTH_M) / 9) }))
const beachPoints = [-250, -200, -150, -100, -50, 50, 100, 150, 200, 250].map((m) => {
  /* The shoreline sample nearest m metres north (+) or south (-) of the pier, moved 25 m inland. */
  const target = destinationPoint(PIER, m > 0 ? 0 : 180, Math.abs(m))
  const s = shore.reduce((best, x) => (distanceMeters(x.p, target) < distanceMeters(best.p, target) ? x : best))
  return { what: `beach ${m > 0 ? m + ' m N' : -m + ' m S'}`, p: destinationPoint(s.p, s.land, 25) }
})
const points = [...beachPoints, ...pierPoints]

const lines = []
for (const off of [-15, 0, 15]) lines.push(shore.map((s) => destinationPoint(s.p, s.land, off)))
const profiles = []
for (let i = 0; i < shore.length; i += 10) {
  const s = shore[i]
  profiles.push(Array.from({ length: 25 }, (_, k) => destinationPoint(s.p, s.land, -60 + k * 5)))
}

/* ------------------------------------------------- raw Terrarium, decoded here */
const rawTiles = new Map()
function pngRgb(buf) {
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
  return { w, bpp, out }
}
async function rawAt(p, z = 15) {
  const n = 2 ** z, x = ((p.lon + 180) / 360) * n
  const y = ((1 - Math.log(Math.tan((p.lat * Math.PI) / 180) + 1 / Math.cos((p.lat * Math.PI) / 180)) / Math.PI) / 2) * n
  const key = `${Math.floor(x)}/${Math.floor(y)}`
  if (!rawTiles.has(key)) {
    const res = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${key}.png`)
    rawTiles.set(key, pngRgb(Buffer.from(await res.arrayBuffer())))
  }
  const t = rawTiles.get(key)
  const i = (Math.floor((y % 1) * 256) * t.w + Math.floor((x % 1) * 256)) * t.bpp
  return terrariumMetres(t.out[i], t.out[i + 1], t.out[i + 2])
}

/* ------------------------------------------------------------- in the app */
const venue = { ...CALIBRATION_VENUE, name: null, latitude: String(PIER.lat), longitude: String(PIER.lon), date: '2026-10-26', startTime: '16:00', endTime: '18:00' }
const link = await shareLink('http://127.0.0.1:5173/', { id: 'vb', name: 'Virginia Beach Fishing Pier', savedAt: '2026-10-26T00:00:00Z', venue, kit: { bodyIds: [], lensIds: [], droneIds: [], styleNotes: '' }, positions: [] })
const { send, ev, wait, dispose, onEvent } = await connect()
let result = null
let seaTiles = null
const overpassAsked = []
const tilesAsked = []
try {
  await send('Network.enable', {})
  onEvent('Network.requestWillBeSent', (p) => {
    const host = new URL(p.request.url).host
    if (OVERPASS_SERVERS.some((u) => new URL(u).host === host)) overpassAsked.push(host)
    if (host === TILE_HOST) tilesAsked.push(p.request.url)
  })
  await send('Network.setBlockedURLs', { urls: [...OVERPASS_SERVERS.map((u) => `*${new URL(u).host}*`), ...(BLOCKED ? [`*${TILE_HOST}*`] : [])] })
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/' })
  await wait(2000)
  await ev(`localStorage.setItem('scoutngo.landing.v1','true')`)
  /* Nothing to fall back on: no buildings, trees, saved areas or saved tiles from an earlier run. */
  await ev(`(async () => { localStorage.clear(); localStorage.setItem('scoutngo.landing.v1','true'); await caches.delete('scoutngo-tiles-v1'); return 1 })()`)
  await send('Page.navigate', { url: 'about:blank' })
  /* The probe the audits read the map through only exists with ?probe=1; shareLink keeps the query empty. */
  await send('Page.navigate', { url: link.replace('/#plan=', '/?probe=1#plan=') })
  let opened = false
  for (let i = 0; i < 40 && !opened; i += 1) {
    await wait(500)
    opened = await ev(`(() => { const b = document.querySelector('.confirm__yes'); if (!b) return false; b.click(); return true })()`)
  }
  if (!opened) throw new Error('the shared plan for the pier was not offered')
  await wait(2500)
  await goToStage(ev, wait, 'plan')
  await wait(2000)

  /* 2D: terrain on, framed on the points, and wait until the sea reads 0 (the coastline has arrived). */
  const pierEnd = pierPoints[pierPoints.length - 1].p
  /* Terrain on, the way a person turns it on: the Terrain tile in Layers. */
  const terrainOn = await ev(`(async () => {
    document.querySelector('button[aria-label="Map and layers"]')?.click()
    await new Promise((r) => setTimeout(r, 1200))
    const tile = [...document.querySelectorAll('button')].find((b) => /^Terrain/.test(b.textContent.trim()))
    if (!tile) return 'no Terrain tile in Layers'
    if (!/ON|PAUSED/.test(tile.textContent)) tile.click()
    return 'on'
  })()`)
  if (terrainOn !== 'on') throw new Error(String(terrainOn))
  await wait(2000)
  const all = JSON.stringify(points.map((x) => [x.p.lon, x.p.lat]))
  let seaReady = false
  for (let i = 0; i < 90 && !seaReady; i += 1) {
    await ev(`(() => { const m = window.__probe.map; const pts = ${all}; const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); m.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: 40, duration: 0, maxZoom: 16 }); return 'ok' })()`)
    await wait(2000)
    const sea = await ev(`window.__probe.map.queryTerrainElevation([${pierEnd.lon}, ${pierEnd.lat}])`)
    if (i % 5 === 0) console.log("  2D at the pier end:", sea, await ev(`!!window.__probe.map.getTerrain()`), await ev(`window.__probe.map.getZoom().toFixed(1)`))
    seaReady = typeof sea === "number" && Math.abs(sea) < 0.5
  }
  if (!seaReady) throw new Error(`2D never read sea level at the pier end${BLOCKED ? ' with the map tiles blocked' : ''}`)
  await ev(`new Promise((r) => { const m = window.__probe.map; if (m.loaded() && !m.isMoving()) return r(1); m.once('idle', () => r(1)); setTimeout(() => r(0), 20000) })`)
  const twoD = await ev(`JSON.stringify(${all}.map((p) => window.__probe.map.queryTerrainElevation(p)))`)

  /* 3D. */
  await ev(`document.querySelector('button[aria-label="Open the 3D clay model"]')?.click()`)
  for (let i = 0; i < 60; i += 1) {
    await wait(2000)
    if (await ev(`!!window.__clay && window.__clay.widget.scene.globe.tilesLoaded`)) break
  }
  await wait(3000)
  const sample = (list) => ev(`(async () => JSON.stringify(await Promise.all(${JSON.stringify(list)}.map((p) => window.__clay.groundAt(p)))))()`).then(JSON.parse)
  const threeD = await sample(points.map((x) => x.p))
  const lineHeights = []
  for (const l of lines) lineHeights.push(await sample(l))
  const profileHeights = []
  for (const pr of profiles) profileHeights.push(await sample(pr))
  result = { twoD: JSON.parse(twoD), threeD, lineHeights, profileHeights }
  seaTiles = JSON.parse(await ev(`JSON.stringify(window.__probe.seaTiles?.() ?? null)`))
} catch (error) {
  console.log(`=== TERRAIN COAST ABORTED: ${error instanceof Error ? error.message : String(error)} ===`)
  watchdog.stop()
  await dispose()
  process.exit(2)
}
watchdog.stop()
await dispose()

const raw = []
for (const x of points) raw.push(await rawAt(x.p))
const rawLines = []
for (const l of lines) {
  const hs = []
  for (const p of l) hs.push(Math.max(0, await rawAt(p)))
  rawLines.push(hs)
}

const maxStep = (series) => series.reduce((m, hs) => {
  for (let i = 1; i < hs.length; i += 1) if (hs[i] !== null && hs[i - 1] !== null) m = Math.max(m, Math.abs(hs[i] - hs[i - 1]))
  return m
}, 0)
/* Where the steps over the limit are, for the record and for the next fix. */
const worst = []
result.lineHeights.forEach((hs, li) => hs.forEach((h, i) => {
  if (i > 0 && h !== null && hs[i - 1] !== null && Math.abs(h - hs[i - 1]) > MAX_STEP_M) worst.push({ where: `line ${[-15, 0, 15][li]} m inland`, p: lines[li][i], from: hs[i - 1], to: h })
}))
result.profileHeights.forEach((hs, pi) => hs.forEach((h, i) => {
  if (i > 0 && h !== null && hs[i - 1] !== null && Math.abs(h - hs[i - 1]) > MAX_STEP_M) worst.push({ where: `profile ${pi}, ${-60 + i * 5} m inland`, p: profiles[pi][i], from: hs[i - 1], to: h })
}))
for (const w of worst) w.raw = await rawAt(w.p)
const alongStep = maxStep(result.lineHeights)
const acrossStep = maxStep(result.profileHeights)
const rawStep = maxStep(rawLines)
const rows = points.map((x, i) => {
  const d2 = result.twoD[i], d3 = result.threeD[i]
  const diff = typeof d2 === 'number' && typeof d3 === 'number' ? Math.abs(d2 - d3) : null
  return { ...x, raw: raw[i], d2, d3, diff }
})
const off = rows.filter((r) => r.diff === null || r.diff > WITHIN_M)
/*
 * The check must be on the path it names (docs/failure-modes.md, C). Blocked:
 * nothing against the ocean. Open: something against the ocean, and nothing
 * from the shape at the zooms the map tiles cover.
 */
const total = (byZ, from = 0) => Object.entries(byZ).reduce((n, [z, c]) => (Number(z) >= from ? n + c : n), 0)
const byZoom = (byZ) => (Object.keys(byZ).length === 0 ? 'none' : Object.entries(byZ).map(([z, c]) => `z${z} ${c}`).join(', '))
const pathOk = seaTiles !== null && (BLOCKED ? total(seaTiles.ocean) === 0 && total(seaTiles.shape) > 0 : total(seaTiles.ocean) > 0 && total(seaTiles.shape, VECTOR_ZOOMS[0]) === 0)
const pass = off.length === 0 && alongStep <= MAX_STEP_M && acrossStep <= MAX_STEP_M && pathOk
const f = (n) => (typeof n === 'number' ? n.toFixed(2) : '—')

const out = [
  '# Virginia Beach Fishing Pier: 3D ground against 2D, and the shoreline',
  '',
  `Run: ${new Date().toISOString()} · node scripts/measure-terrain-coast.mjs · pier root ${PIER.lat}, ${PIER.lon}`,
  `Coastline: ${coast.length} OpenStreetMap ways; ${shore.length} shoreline samples within 1 km of the pier, every 5 m.`,
  'Raw is the Terrarium tile as AWS serves it at zoom 15, decoded in this script, before the sea is put at sea level. 2D is MapLibre terrain; 3D is the clay model.',
  `Points placed by the OpenStreetMap coastline in ${FIXTURE} (${fixture.source}).`,
  `Elevation tiles cleaned in this run, by zoom: ${seaTiles === null ? 'not reported' : `against the map tiles' ocean ${byZoom(seaTiles.ocean)}; from their own shape ${byZoom(seaTiles.shape)}. Below zoom ${VECTOR_ZOOMS[0]} (the 3D view's distant ground) there are no map tiles to read, and the shape is used by design`}.`,
  `Overpass: BLOCKED in the browser (${OVERPASS_SERVERS.map((u) => new URL(u).host).join(', ')}); the app asked ${overpassAsked.length} time(s). Nothing saved on the phone at the start.`,
  BLOCKED
    ? `Map tiles (${TILE_HOST}): BLOCKED too; the app asked ${tilesAsked.length} time(s). The elevation was cleaned from its own shape (src/core/coastArtefacts.ts).`
    : `Map tiles (${TILE_HOST}): open; the app fetched ${tilesAsked.length}. The elevation was cleaned against their ocean polygons (src/core/oceanMask.ts).`,
  `Cleaned the way this run says: ${pathOk ? 'yes' : 'NO'}.`,
  '',
  '| point | lat | lon | raw (m) | 2D (m) | 3D (m) | 3D − 2D |',
  '|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.what} | ${r.p.lat.toFixed(6)} | ${r.p.lon.toFixed(6)} | ${f(r.raw)} | ${f(r.d2)} | ${f(r.d3)} | ${f(r.diff)} |`),
  '',
  `Points within ${WITHIN_M} m of 2D: ${rows.length - off.length} of ${rows.length}.`,
  `Largest step along the shoreline in 3D (on it and 15 m either side, 5 m apart): ${alongStep.toFixed(2)} m. The same lines in the raw tiles, with the sea bed at 0: ${rawStep.toFixed(2)} m.`,
  `Largest step across the shoreline in 3D (${profiles.length} profiles, 60 m out to 60 m in, 5 m apart): ${acrossStep.toFixed(2)} m.`,
  `Limit: ${MAX_STEP_M} m. ${pass ? 'Pass.' : 'FAIL.'}`,
  '',
  ...(worst.length === 0 ? [] : ['Steps over the limit:', '', '| where | lat | lon | from (m) | to (m) | raw here (m) |', '|---|---|---|---|---|---|', ...worst.map((w) => `| ${w.where} | ${w.p.lat.toFixed(6)} | ${w.p.lon.toFixed(6)} | ${f(w.from)} | ${f(w.to)} | ${f(w.raw)} |`), '']),
]
const file = `measurements/${new Date().toISOString().slice(0, 10)}-terrain-virginia-beach${BLOCKED ? '-no-tiles' : '-tiles'}.md`
writeFileSync(file, out.join('\n'))
console.log(out.join('\n'))
process.exit(pass ? 0 : 1)
