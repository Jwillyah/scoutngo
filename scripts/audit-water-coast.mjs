/*
 * THE COASTLINE IS SMOOTH AND THE WATER COVERS THE PHOTO'S SEA (Batch D, Section 3).
 *
 * Usage:  node scripts/audit-water-coast.mjs [screenshot-dir]
 * Exits:  0 clean; 1 a problem; 2 could not look.
 *
 * 1 Nov, the 3D view: the coastline a pixel staircase with a dotted edge, and
 * a dark slab of ocean over the photo's water. At the Virginia Beach pier and
 * Wrightsville Beach, from the recorded map tiles:
 *
 *   STAIRS   straight down from 400 ft, the water drawn flat magenta (its
 *            geometry alone); along the coast, the water's edge as x for
 *            each row (and y for each column). A raster mask's staircase is
 *            a run of rows with no change and then a jump of several pixels,
 *            again and again; a drawn line moves a little every few rows.
 *            Counted: jumps of 4 px or more after 3 rows still. At most
 *            STAIRS_LIMIT a view.
 *   SLAB     over a 60 x 60 grid 1.2 km either side of the venue, a ray
 *            straight down: where it meets water, ground above it. At most
 *            SLAB_SHARE of the water points: the ground's mesh cell at the
 *            water's edge (about 15 m near) slopes from the beach to the sea
 *            floor and can stand a little above the water within it.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { webkit, devices } from './gate/playwright.mjs'
import { APP_ORIGIN, goToStage, guardAudit, startWatchdog } from './preflight.mjs'
import { decodePng } from '../src/lib/png.ts'
import { shareLink } from '../src/lib/planShare.ts'
import { placeKey } from '../src/core/venueName.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'
import { stairs } from './gate/coastMetric.mjs'

guardAudit('water coast')
const watchdog = startWatchdog('water coast', 400_000)
const OUT = process.argv[2] ?? join(process.env.SCOUTNGO_OUT ?? tmpdir(), 'water-coast')
mkdirSync(OUT, { recursive: true })
export const STAIRS_LIMIT = 3
export const SLAB_SHARE = 0.01
let problems = 0
const fail = (why) => {
  console.log('      PROBLEM: ' + why)
  problems += 1
}

const PLACES = [
  { name: 'pier', lat: 36.8435575, lon: -75.9713104, label: 'Virginia Beach Fishing Pier' },
  { name: 'wrightsville', lat: 34.2132, lon: -77.7865, label: 'Wrightsville Beach' },
]
const browser = await webkit.launch()
try {
  for (const p of PLACES) {
    console.log(`\n### ${p.label}`)
    const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem('scoutngo.landing.v1', 'true')
      } catch {
        /* about:blank */
      }
    })
    const page = await ctx.newPage()
    const wait = (ms) => page.waitForTimeout(ms)
    const ev = (x) => page.evaluate(x)
    const venue = { ...CALIBRATION_VENUE, name: { key: placeKey(String(p.lat), String(p.lon)), name: p.label }, latitude: String(p.lat), longitude: String(p.lon), date: '2026-11-01', startTime: '11:00', endTime: '13:00' }
    await page.goto(await shareLink(`${APP_ORIGIN}/`, { id: 'wc', name: 'Water', savedAt: '2026-10-31T00:00:00Z', venue, kit: { bodyIds: [], lensIds: [], droneIds: [], styleNotes: '' }, positions: [] }))
    await wait(3000)
    await page.getByRole('button', { name: /^open$/i }).click({ timeout: 3000 }).catch(() => {})
    await page.getByText('Open the map', { exact: true }).click({ timeout: 3000 }).catch(() => {})
    await goToStage(ev, wait, 'plan')
    await wait(1500)
    await ev(`document.querySelector('button[aria-label="Open the 3D clay model"]')?.click()`)
    for (let i = 0; i < 40 && !(await ev('!!window.__clay')); i += 1) await wait(1000)
    if (!(await ev('!!window.__clay'))) {
      console.log('=== WATER COAST AUDIT ABORTED: the 3D view never came up ===')
      process.exit(2)
    }
    await ev(`window.__clay.setSkyShown(false)`)
    for (let i = 0; i < 40; i += 1) {
      await wait(1000)
      await ev(`window.__clay.lookDown(${JSON.stringify({ lat: p.lat, lon: p.lon })}, 122)`)
      if ((await ev('window.__clay.loaded()')) && i > 3) break
    }
    await wait(2000)
    await ev('window.__clay.setWaterMask(true)')
    await wait(500)
    const b64 = await ev(`(async () => (await window.__clay.snapshot()).toDataURL('image/png').split(',')[1])()`)
    await ev('window.__clay.setWaterMask(false)')
    const buf = Buffer.from(b64, 'base64')
    writeFileSync(join(OUT, `coast-${p.name}.png`), buf)
    const st = stairs(await decodePng(buf))
    const slab = await ev('window.__clay.slabPoints(60, 1200)')
    console.log(`  staircase steps along the coast: ${st.steps}; water in the frame: ${st.wetSample > 0 ? 'yes' : 'NO'}; slab: ${slab.slab} of ${slab.water} water points have ground above the water ${JSON.stringify(Object.entries(slab.by ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 4))}`)
    if (st.wetSample === 0) fail(`${p.label}: no water in the frame from 400 ft, so the coast was not looked at`)
    if (st.steps > STAIRS_LIMIT) fail(`${p.label}: ${st.steps} stair-steps along the coastline (at most ${STAIRS_LIMIT})`)
    if (slab.water === 0) fail(`${p.label}: no water under the 1.2 km grid, so the slab was not looked at`)
    if (slab.slab > slab.water * SLAB_SHARE) fail(`${p.label}: at ${slab.slab} of ${slab.water} points ground stands above the water: a slab over the sea (at most ${SLAB_SHARE * 100}%, the cell at the shore)`)
    await ctx.close()
  }
} finally {
  await browser.close()
  watchdog.stop()
}
console.log(`\n=== WATER COAST PROBLEMS: ${problems} ===`)
process.exit(problems === 0 ? 0 : 1)
