/*
 * 3D OPENS FIVE TIMES IN A ROW ON AN IPHONE (Batch DRONE, Section 2.6; the
 * 3D reload of Batch CORE, Section 2, most likely iOS killing a tab that holds
 * too much).
 *
 * Usage:  node scripts/audit-3d-five.mjs [screenshot-dir]
 * Exits:  0 clean; 1 a problem; 2 could not look.
 *
 * WebKit as an iPhone 13 at 390 x 844, the Virginia Beach pier. The 3D view
 * is opened and closed five times. Each time it must come up, with no "didn't
 * load" card and no page reload, and the near ground picture must be made at
 * the iOS size (src/core/groundAtlas.ts: 2048 px).
 *
 * THE MEMORY CAP. Playwright's WebKit cannot be given an OS memory limit, so
 * the cap is a budget on what this page holds that grows with the 3D view:
 * the near picture (nearAtlasBytes: canvas + texture + mipmaps) must be within
 * NEAR_BUDGET_MIB, and the JS heap, where WebKit reports one
 * (performance.memory is Chrome's: absent here, said so), within HEAP_CAP_MIB
 * after the fifth open.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { webkit, devices } from './gate/playwright.mjs'
import { APP_ORIGIN, goToStage, guardAudit, startWatchdog } from './preflight.mjs'
import { shareLink } from '../src/lib/planShare.ts'
import { placeKey } from '../src/core/venueName.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'
import { ATLAS_PX_IOS, nearAtlasBytes } from '../src/core/groundAtlas.ts'

const OPENS = 5
const NEAR_BUDGET_MIB = 40
const HEAP_CAP_MIB = 400

guardAudit('3d five')
const watchdog = startWatchdog('3d five', 420_000)
const OUT = process.argv[2] ?? join(process.env.SCOUTNGO_OUT ?? tmpdir(), '3d-five')
mkdirSync(OUT, { recursive: true })
let problems = 0
let looked = 0
const fail = (why) => {
  console.log('      PROBLEM: ' + why)
  problems += 1
}
const PIER = { lat: 36.8435575, lon: -75.9713104 }
const AT = '2026-11-01T15:07:00Z'

const browser = await webkit.launch()
try {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('scoutngo.landing.v1', 'true')
    } catch {
      /* about:blank */
    }
    /* A page load sets this once; a reload would set it again. */
    window.__loads = (Number(sessionStorage.getItem('audit.loads') ?? '0') || 0) + 1
    sessionStorage.setItem('audit.loads', String(window.__loads))
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(AT) })
  await page.clock.resume()
  const wait = (ms) => page.waitForTimeout(ms)
  const ev = (x) => page.evaluate(x)
  const venue = { ...CALIBRATION_VENUE, name: { key: placeKey(String(PIER.lat), String(PIER.lon)), name: 'Virginia Beach Fishing Pier' }, latitude: String(PIER.lat), longitude: String(PIER.lon), date: '2026-11-01', startTime: '09:00', endTime: '12:00' }
  await page.goto(await shareLink(`${APP_ORIGIN}/`, { id: 'five', name: 'Five', savedAt: '2026-10-31T00:00:00Z', venue, kit: { bodyIds: [], lensIds: [], droneIds: [], styleNotes: '' }, positions: [] }))
  await wait(3000)
  await page.getByRole('button', { name: /^open$/i }).click({ timeout: 3000 }).catch(() => {})
  await goToStage(ev, wait, 'plan')
  await wait(1500)
  for (let n = 1; n <= OPENS; n += 1) {
    await ev(`document.querySelector('button[aria-label="Open the 3D clay model"]')?.click()`)
    let up = false
    for (let i = 0; i < 40 && !up; i += 1) {
      await wait(1000)
      up = await ev(`!!window.__clay && !!document.querySelector('.clay--shown') && !!window.__nearAtlas`)
    }
    await wait(1500)
    const s = JSON.parse(await ev(`JSON.stringify({ atlas: window.__nearAtlas ?? null, loads: window.__loads, card: (document.body.innerText.match(/didn['’]t load|restarted|needs a signal/) ?? [null])[0], heap: performance.memory?.usedJSHeapSize ?? null })`))
    console.log(`  open ${n}: up ${up} · ${JSON.stringify(s)}`)
    await page.screenshot({ path: join(OUT, `open-${n}.png`) })
    if (!up) fail(`open ${n}: the 3D view did not come up in 40 s`)
    else looked += 1
    if (s.card !== null) fail(`open ${n}: the screen says "${s.card}"`)
    if (s.loads !== 1) fail(`open ${n}: the page reloaded (${s.loads} loads)`)
    if (s.atlas !== null && s.atlas.px !== ATLAS_PX_IOS) fail(`open ${n}: the near picture is ${s.atlas.px} px, not the iOS ${ATLAS_PX_IOS}`)
    if (s.atlas !== null && nearAtlasBytes(s.atlas.px) / 2 ** 20 > NEAR_BUDGET_MIB) fail(`open ${n}: the near picture holds ${(nearAtlasBytes(s.atlas.px) / 2 ** 20).toFixed(0)} MiB, over ${NEAR_BUDGET_MIB}`)
    if (n === OPENS) {
      if (s.heap === null) console.log('  JS heap: WebKit does not report one (performance.memory is Chrome only); the near picture budget is the cap')
      else if (s.heap / 2 ** 20 > HEAP_CAP_MIB) fail(`after ${OPENS} opens the JS heap is ${(s.heap / 2 ** 20).toFixed(0)} MiB, over ${HEAP_CAP_MIB}`)
    }
    await ev(`document.querySelector('button[aria-label="Back to the 2D map"]')?.click()`)
    let down = false
    for (let i = 0; i < 10 && !down; i += 1) {
      await wait(500)
      down = await ev(`!document.querySelector('.clay--shown')`)
    }
    if (!down) fail(`open ${n}: Back to the 2D map did not close the 3D view`)
    await wait(1000)
  }
  await ctx.close()
  watchdog.note('done')
} finally {
  await browser.close()
}
watchdog.stop()
if (looked === 0) {
  console.log('=== 3D FIVE AUDIT ABORTED: the 3D view never came up ===')
  process.exit(2)
}
console.log(`  screenshots: ${OUT}`)
console.log(`\n=== 3D FIVE PROBLEMS: ${problems} ===`)
process.exit(problems === 0 ? 0 : 1)
