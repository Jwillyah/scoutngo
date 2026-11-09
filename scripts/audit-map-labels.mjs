/*
 * THE MAP'S OWN LABELS (Batch Map, Section 3), IN WEBKIT.
 *
 * Usage:  node scripts/audit-map-labels.mjs [screenshot-dir]
 *
 * 9 Nov: the labels were Esri's reference overlay (mixed fonts, blue italic
 * water names, route shields). Now the app draws OpenFreeMap's names itself.
 * With Labels on, at zoom 9, 12 and 15 over Virginia Beach (the fixture
 * proxy answers recorded OpenFreeMap tiles):
 *
 *   count      at least one label, at most 12
 *   font       Archivo, never monospace; white
 *   apart      no two labels overlap; none within 30 px of the spot's pin
 *   no Esri    no request for Esri's reference (label) tiles
 *
 * The counts at the three zooms are printed for the report.
 */
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { webkit, devices } from './gate/playwright.mjs'
import { ensureApp, goToStage, guardAudit, startWatchdog, APP_ORIGIN } from './preflight.mjs'
import { shareLink } from '../src/lib/planShare.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'
import { placeKey } from '../src/core/venueName.ts'

guardAudit('map labels')
const watchdog = startWatchdog('map labels', 300_000)
const OUT = process.argv[2] ?? join(process.env.SCOUTNGO_OUT ?? tmpdir(), 'map-labels')
mkdirSync(OUT, { recursive: true })

const PIER = { lat: 36.8435575, lon: -75.9713104 }
await ensureApp()
const venue = { ...CALIBRATION_VENUE, name: { key: placeKey(String(PIER.lat), String(PIER.lon)), name: 'Virginia Beach Fishing Pier' }, latitude: String(PIER.lat), longitude: String(PIER.lon), date: '2026-10-30', startTime: '09:00', endTime: '11:00' }
const shared = await shareLink(`${APP_ORIGIN}/`, { id: 'labels', name: 'Labels', savedAt: '2026-10-29T00:00:00Z', venue, kit: { bodyIds: [], lensIds: [], droneIds: [], styleNotes: '' }, positions: [] })
/* The map on window.__probe (MapView.tsx): only with ?probe=1. */
const u = new URL(shared)
u.searchParams.set('probe', '1')
const url = u.href

let problems = 0
const fail = (why) => {
  console.log('      PROBLEM: ' + why)
  problems += 1
}

const READ = `JSON.stringify((() => {
  const ls = [...document.querySelectorAll('.mlabel')].map((l) => { const r = l.getBoundingClientRect(); const s = getComputedStyle(l); return { t: l.textContent, l: r.left, r: r.right, top: r.top, b: r.bottom, font: s.fontFamily, colour: s.color } })
  const m = window.__probe?.map
  const pin = m && ${JSON.stringify(PIER)} ? m.project([${PIER.lon}, ${PIER.lat}]) : null
  return { ls, pin: pin ? { x: pin.x, y: pin.y } : null, zoom: m ? m.getZoom() : null }
})())`

const counts = {}
const browser = await webkit.launch()
try {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } })
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('scoutngo.landing.v1', 'true')
      localStorage.setItem('scoutngo.settings', JSON.stringify({ showNumbers: false, showLabels: true, showTerrain: false, showBuildings: false, units: { wind: 'kt', distance: 'ft', temperature: 'F', clock: 12 } }))
    } catch {
      /* about:blank */
    }
  })
  const esri = []
  const page = await ctx.newPage()
  page.on('request', (r) => {
    if (/Reference\/World_(Boundaries_and_Places|Transportation)/.test(r.url())) esri.push(r.url())
  })
  await page.clock.setFixedTime(new Date('2026-10-30T15:00:00Z'))
  const wait = (ms) => page.waitForTimeout(ms)
  const ev = (x) => page.evaluate(x)
  await page.goto(url)
  await wait(3500)
  await page.getByRole('button', { name: /^open$/i }).click({ timeout: 4000 }).catch(() => {})
  await goToStage(ev, wait, 'plan')
  await wait(2500)
  for (const zoom of [9, 12, 15]) {
    await ev(`window.__probe?.map?.jumpTo({ center: [${PIER.lon}, ${PIER.lat}], zoom: ${zoom} })`)
    let got = null
    for (let i = 0; i < 20; i += 1) {
      await wait(500)
      got = JSON.parse(await ev(READ))
      if (got.ls.length > 0) break
    }
    counts[zoom] = `${got.ls.length} (map at zoom ${Math.round((got.zoom ?? zoom) * 10) / 10})`
    console.log(`  zoom ${zoom} asked, map at ${got.zoom?.toFixed(1)}: ${got.ls.length} labels: ${got.ls.map((l) => l.t).join(', ')}`)
    await page.screenshot({ path: join(OUT, `labels-z${zoom}.png`) })
    if (got.ls.length === 0) fail(`zoom ${zoom}: no labels`)
    if (got.ls.length > 12) fail(`zoom ${zoom}: ${got.ls.length} labels, more than 12`)
    for (const l of got.ls) {
      if (/monospace|menlo|sf ?mono/i.test(l.font) || !/archivo/i.test(l.font)) fail(`zoom ${zoom}: "${l.t}" is in ${l.font}, not Archivo`)
      if (!/rgba?\(255, 255, 255/.test(l.colour)) fail(`zoom ${zoom}: "${l.t}" is ${l.colour}, not white`)
      if (got.pin !== null && got.pin.x > l.l - 30 && got.pin.x < l.r + 30 && got.pin.y > l.top - 30 && got.pin.y < l.b + 30) fail(`zoom ${zoom}: "${l.t}" sits on the spot's pin`)
    }
    for (const [i, a] of got.ls.entries()) for (const b of got.ls.slice(i + 1)) if (a.l < b.r && b.l < a.r && a.top < b.b && b.top < a.b) fail(`zoom ${zoom}: "${a.t}" overlaps "${b.t}"`)
  }
  if (esri.length > 0) fail(`${esri.length} requests for Esri's reference labels`)
  await ctx.close()
} catch (error) {
  fail(`ABORTED: ${error instanceof Error ? error.message : String(error)}`)
} finally {
  await browser.close()
  watchdog.stop()
}
console.log(`\nlabels at zoom 9 / 12 / 15: ${counts[9]} / ${counts[12]} / ${counts[15]}`)
console.log(`\n=== MAP LABELS PROBLEMS: ${problems} ===`)
process.exit(problems === 0 ? 0 : 1)
