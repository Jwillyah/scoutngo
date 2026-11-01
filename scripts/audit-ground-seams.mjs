/*
 * SEAMS IN THE 3D GROUND, COUNTED (Batch D, Section 2).
 *
 * Usage:  node scripts/audit-ground-seams.mjs [screenshot-dir]
 * Exits:  0 clean; 1 seams over the limit; 2 could not look.
 *
 * On 1 Nov the 3D ground was a patchwork of zoom levels with hard diagonal
 * seams. To count seams and nothing else, every imagery tile, at every zoom,
 * is answered with the SAME smooth colour field: a function of latitude and
 * longitude alone, slow waves a few hundred metres long. Drawn right, the
 * ground is smooth everywhere; a tile at the wrong place, a level that does
 * not match its neighbour, a crack or a skirt showing, is a hard edge. The
 * vector tiles are empty (no buildings, no water) and the elevation flat, so
 * the only things on the ground are the pictures.
 *
 * At the pier from 150, 400 and 800 ft looking 30° down: the 3D canvas's
 * own frame (no HUD on it), below the horizon, is put through a Sobel
 * filter, and a Hough transform counts the straight lines of strong edge at
 * least a quarter of the frame long. The count is the score; a line is a
 * seam. Run against the build before Batch D it gives the before numbers
 * (SCOUTNGO_APP pointing at that build).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { webkit, devices } from './gate/playwright.mjs'
import { APP_ORIGIN, goToStage, guardAudit, startWatchdog } from './preflight.mjs'
import { encodePng, decodePng } from '../src/lib/png.ts'
import { encodeTestTile } from '../src/lib/mvtTestTile.ts'
import { shareLink } from '../src/lib/planShare.ts'
import { placeKey } from '../src/core/venueName.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'
import { OPEN_METEO, fakeAnswer } from './openMeteoFake.mjs'

guardAudit('ground seams')
const watchdog = startWatchdog('ground seams', 400_000)
const OUT = process.argv[2] ?? join(process.env.SCOUTNGO_OUT ?? tmpdir(), 'ground-seams')
mkdirSync(OUT, { recursive: true })
/* At most this many seam lines in a view. */
export const SEAM_LIMIT = 1
let problems = 0
const fail = (why) => {
  console.log('      PROBLEM: ' + why)
  problems += 1
}
const PIER = { lat: 36.8435575, lon: -75.9713104 }

/* ------------------------------------------------- the smooth field */
const latOf = (y, z) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI
const lonOf = (x, z) => (x / 2 ** z) * 360 - 180
const field = (lat, lon) => {
  const a = (lat - PIER.lat) * 111_000
  const b = (lon - PIER.lon) * 89_000
  return [120 + 70 * Math.sin(a / 160 + 0.7), 130 + 60 * Math.sin(b / 210 + 1.3), 110 + 50 * Math.sin((a + b) / 300)]
}
const fieldTile = async (z, x, y) => {
  const data = new Uint8ClampedArray(256 * 256 * 4)
  for (let py = 0; py < 256; py += 1) {
    const lat = latOf(y + (py + 0.5) / 256, z)
    for (let px = 0; px < 256; px += 1) {
      const lon = lonOf(x + (px + 0.5) / 256, z)
      const [r, g, b] = field(lat, lon)
      data.set([r, g, b, 255], (py * 256 + px) * 4)
    }
  }
  return Buffer.from(await encodePng({ width: 256, height: 256, data }))
}
const FLAT = await (async () => {
  const data = new Uint8ClampedArray(256 * 256 * 4)
  for (let i = 0; i < data.length; i += 4) data.set([128, 1, 0, 255], i)
  return Buffer.from(await encodePng({ width: 256, height: 256, data }))
})()
const EMPTY = Buffer.from(encodeTestTile({}))

/* ------------------------------------------------- the line count */
export function seamLines(png) {
  const { width: W, height: H, data } = png
  /* The ground: from 42% to 78% of the height (below the horizon at 30° down, above the time bar), 6% in from the sides. */
  const y0 = Math.floor(H * 0.42), y1 = Math.floor(H * 0.78), x0 = Math.floor(W * 0.06), x1 = Math.floor(W * 0.94)
  const lum = (x, y) => { const i = (y * W + x) * 4; return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2] }
  const edges = []
  for (let y = y0 + 1; y < y1 - 1; y += 1) {
    for (let x = x0 + 1; x < x1 - 1; x += 1) {
      const gx = lum(x + 1, y - 1) + 2 * lum(x + 1, y) + lum(x + 1, y + 1) - lum(x - 1, y - 1) - 2 * lum(x - 1, y) - lum(x - 1, y + 1)
      const gy = lum(x - 1, y + 1) + 2 * lum(x, y + 1) + lum(x + 1, y + 1) - lum(x - 1, y - 1) - 2 * lum(x, y - 1) - lum(x + 1, y - 1)
      if (Math.hypot(gx, gy) > 60) edges.push([x, y])
    }
  }
  /* Hough: theta in 2° steps, rho in 3 px bins; a line needs a quarter of the region's width of edge pixels. */
  const need = Math.floor((x1 - x0) * 0.25)
  const acc = new Map()
  for (const [x, y] of edges) {
    for (let t = 0; t < 90; t += 1) {
      const th = (t * 2 * Math.PI) / 180
      const rho = Math.round((x * Math.cos(th) + y * Math.sin(th)) / 3)
      const k = t * 100000 + rho + 50000
      acc.set(k, (acc.get(k) ?? 0) + 1)
    }
  }
  /* Peaks, each suppressing its neighbours (10° and 15 px), so one seam counts once. */
  const peaks = [...acc].filter(([, n]) => n >= need).sort((a, b) => b[1] - a[1])
  const kept = []
  for (const [k] of peaks) {
    const t = Math.floor(k / 100000)
    const r = (k % 100000) - 50000
    if (kept.some((p) => Math.min(Math.abs(p.t - t), 90 - Math.abs(p.t - t)) <= 5 && Math.abs(p.r - r) <= 5)) continue
    kept.push({ t, r })
  }
  return { lines: kept.length, edgePixels: edges.length }
}

/* ------------------------------------------------------- the run */
const venue = { ...CALIBRATION_VENUE, name: { key: placeKey(String(PIER.lat), String(PIER.lon)), name: 'Virginia Beach Fishing Pier' }, latitude: String(PIER.lat), longitude: String(PIER.lon), date: '2026-11-01', startTime: '11:00', endTime: '13:00' }
const url = await shareLink(`${APP_ORIGIN}/`, { id: 'seams', name: 'Seams', savedAt: '2026-10-31T00:00:00Z', venue, kit: { bodyIds: [], lensIds: [], droneIds: ['dji-air-3s'], styleNotes: '' }, positions: [] })
const results = []
const browser = await webkit.launch()
try {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
  await ctx.route(/arcgisonline\.com|arcgis\.com|nconemap|vdem\.virginia|mdgeodata|firstmap|nationalmap/, async (r) => {
    const m = /\/(\d+)\/(\d+)\/(\d+)(?:\.\w+)?(?:\?|$)/.exec(r.request().url())
    if (m === null) return r.fulfill({ status: 404, body: '' })
    /* Esri's tiles are z/y/x. */
    return r.fulfill({ body: await fieldTile(+m[1], +m[3], +m[2]), contentType: 'image/png', headers: { 'access-control-allow-origin': '*' } })
  })
  await ctx.route(/elevation-tiles-prod/, (r) => r.fulfill({ body: FLAT, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' } }))
  await ctx.route(/tiles\.openfreemap\.org/, (r) => r.fulfill({ body: EMPTY, contentType: 'application/x-protobuf', headers: { 'access-control-allow-origin': '*' } }))
  await ctx.route(OPEN_METEO, (r) => r.fulfill({ json: fakeAnswer(r.request().url(), new Date('2026-11-01T16:00:00Z')) }))
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('scoutngo.landing.v1', 'true')
    } catch {
      /* about:blank */
    }
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date('2026-11-01T16:00:00Z') })
  await page.clock.resume()
  const wait = (ms) => page.waitForTimeout(ms)
  const ev = (x) => page.evaluate(x)
  await page.goto(url)
  await wait(3000)
  await page.getByRole('button', { name: /^open$/i }).click({ timeout: 3000 }).catch(() => {})
  await page.getByText('Open the map', { exact: true }).click({ timeout: 3000 }).catch(() => {})
  await goToStage(ev, wait, 'plan')
  await wait(2000)
  await ev(`document.querySelector('button[aria-label="Open the 3D clay model"]')?.click()`)
  for (let i = 0; i < 40 && !(await ev('!!window.__clay')); i += 1) await wait(1000)
  if (!(await ev('!!window.__clay'))) {
    console.log('=== GROUND SEAMS AUDIT ABORTED: the 3D view never came up ===')
    process.exit(2)
  }
  await ev(`document.querySelector('.sheet__handle') && window.__clay.setSkyShown?.(false)`)
  for (const ft of [150, 400, 800]) {
    await ev(`(() => { const c = window.__clay; window.__pose = () => c.droneView(${JSON.stringify(PIER)}, ${ft} * 0.3048, 300, -30, 24); window.__pose() })()`)
    for (let i = 0; i < 40; i += 1) {
      await wait(1000)
      await ev('window.__pose()')
      const done = await ev(`(() => { const c = window.__clay; return typeof c.loaded === 'function' ? c.loaded() : c.widget?.scene?.globe?.tilesLoaded === true })()`)
      if (done && i > 3) break
    }
    await wait(1500)
    const file = join(OUT, `seams-${ft}ft.png`)
    /* The 3D canvas alone (the scene's own snapshot), so no HUD, chip or pill is counted as an edge. */
    const b64 = await ev(`(async () => (await window.__clay.snapshot()).toDataURL('image/png').split(',')[1])()`)
    const buf = Buffer.from(b64, 'base64')
    writeFileSync(file, buf)
    const got = seamLines(await decodePng(buf))
    results.push({ ft, ...got })
    console.log(`  ${ft} ft: ${got.lines} straight seam lines, ${got.edgePixels} hard-edge pixels  (${file})`)
    if (got.lines > SEAM_LIMIT) fail(`${got.lines} straight seams in the ground at ${ft} ft (at most ${SEAM_LIMIT})`)
  }
  await ctx.close()
} finally {
  await browser.close()
  watchdog.stop()
}
writeFileSync(join(OUT, 'seams.json'), JSON.stringify(results, null, 2))
console.log(`\n=== GROUND SEAMS PROBLEMS: ${problems} ===`)
process.exit(problems === 0 ? 0 : 1)
