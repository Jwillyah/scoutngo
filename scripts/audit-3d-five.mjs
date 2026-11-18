/*
 * 3D AND FLY OPEN AGAIN AND AGAIN ON AN IPHONE (Batch DRONE, Section 2.6:
 * five opens of 3D; Batch FIX, Section 0.5: ten of 3D and ten of Fly,
 * alternating, because the phone crashed on 16 Nov at 7:01 and 8:00 PM
 * while the five passed here).
 *
 * Usage:  node scripts/audit-3d-five.mjs [screenshot-dir]
 * Exits:  0 clean; 1 a problem; 2 could not look.
 *
 * WebKit as an iPhone 13 at 390 x 844, the Virginia Beach pier. 3D, then
 * Fly, then 3D... twenty opens, each closed before the next. Each time the
 * view must come up, with no "didn't load" card and no page reload; the app
 * must hold one renderer at most (src/three/world/sharedRenderer.ts); the
 * near ground picture must be lite (src/core/lite3d.ts: 1024 px, or 2048
 * once this phone has stepped up).
 *
 * THE MEMORY CAP. Playwright's WebKit cannot be given an OS memory limit (an
 * iPhone 13 tab is killed near 1 GB of process memory), so the cap is our own
 * count of what the 3D view puts on the GPU (src/core/gpuBudget.ts, read
 * from window.__gpuMemory): its peak over the twenty opens must stay at or
 * under BUDGET_IOS_BYTES (150 MB). The JS heap, where WebKit reports one
 * (performance.memory is Chrome's: absent here, said so), within HEAP_CAP_MIB.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { webkit, devices } from './gate/playwright.mjs'
import { APP_ORIGIN, goToStage, guardAudit, openMenu, startWatchdog } from './preflight.mjs'
import { shareLink } from '../src/lib/planShare.ts'
import { placeKey } from '../src/core/venueName.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'
import { BUDGET_IOS_BYTES, LITE_PX, STEPPED_PX } from '../src/core/lite3d.ts'

const ROUNDS = 10
const HEAP_CAP_MIB = 400

guardAudit('3d five')
const watchdog = startWatchdog('3d five', 900_000)
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
  const STATE = `JSON.stringify({ atlas: window.__nearAtlas ?? null, mem: window.__gpuMemory ?? null, renderers: window.__renderers ?? null, loads: window.__loads, card: (document.body.innerText.match(/didn['’]t load|restarted|needs a signal|repeatedly/) ?? [null])[0], heap: performance.memory?.usedJSHeapSize ?? null })`
  const look = async (label, n) => {
    await wait(1500)
    const s = JSON.parse(await ev(STATE))
    console.log(`  ${label} ${n}: ${JSON.stringify({ ...s, mem: s.mem === null ? null : { ...s.mem, bytes: Math.round(s.mem.bytes / 1e6) + ' MB', peak: Math.round(s.mem.peak / 1e6) + ' MB' } })}`)
    if (s.card !== null) fail(`${label} ${n}: the screen says "${s.card}"`)
    if (s.loads !== 1) fail(`${label} ${n}: the page reloaded (${s.loads} loads)`)
    if (s.renderers !== null && s.renderers > 1) fail(`${label} ${n}: ${s.renderers} renderers held at once`)
    if (s.atlas !== null && s.atlas.px !== LITE_PX && s.atlas.px !== STEPPED_PX) fail(`${label} ${n}: the near picture is ${s.atlas.px} px, not lite (${LITE_PX}, or ${STEPPED_PX} stepped up)`)
    if (s.mem === null) fail(`${label} ${n}: the 3D view made no GPU count (window.__gpuMemory)`)
    else {
      if (s.mem.cap !== BUDGET_IOS_BYTES) fail(`${label} ${n}: the GPU cap is ${s.mem.cap}, not the iPhone's ${BUDGET_IOS_BYTES} (not taken for an iPhone?)`)
      if (s.mem.peak > BUDGET_IOS_BYTES) fail(`${label} ${n}: the 3D view put ${Math.round(s.mem.peak / 1e6)} MB on the GPU by our own count, over ${BUDGET_IOS_BYTES / 1e6}`)
    }
    return s
  }
  const flyButton = `[...document.querySelectorAll('.drp__buttons button, .pf button, button')].find(b => /^(Plan the flight|Fly it yourself)$/.test(b.textContent.trim()))`
  let last = null
  for (let n = 1; n <= ROUNDS; n += 1) {
    /* 3D from the 2D map. */
    await ev(`document.querySelector('button[aria-label="Open the 3D clay model"]')?.click()`)
    let up = false
    for (let i = 0; i < 40 && !up; i += 1) {
      await wait(1000)
      up = await ev(`!!window.__clay && !!document.querySelector('.clay--shown') && !!window.__nearAtlas`)
    }
    if (!up) fail(`3D ${n}: the 3D view did not come up in 40 s`)
    else looked += 1
    last = await look('3D', n)
    if (n === 1 || n === ROUNDS) await page.screenshot({ path: join(OUT, `3d-${n}.png`) })
    await ev(`document.querySelector('button[aria-label="Back to the 2D map"]')?.click()`)
    let down = false
    for (let i = 0; i < 10 && !down; i += 1) {
      await wait(500)
      down = await ev(`!document.querySelector('.clay--shown')`)
    }
    if (!down) fail(`3D ${n}: Back to the 2D map did not close the 3D view`)
    await wait(1000)

    /* Then Fly, from the 2D map: the Drone page's "Plan the flight" the first time, the drone card's "Fly it yourself" after. */
    let can = await ev(`!!${flyButton}`)
    if (!can) {
      await openMenu(ev, wait)
      await page.locator('.mcard--drone').first().tap({ timeout: 4000 }).catch(() => {})
      await wait(1500)
      /* Batch SIMPLE-1, Section 1: on the Preflight tab, while Labs is on. */
      await ev(`[...document.querySelectorAll('button[role="tab"]')].find(b => b.textContent.trim() === 'Preflight')?.click()`)
      await wait(600)
      can = await ev(`!!${flyButton}`)
    }
    if (!can) {
      fail(`Fly ${n}: no "Plan the flight" or "Fly it yourself" button to start Fly from`)
      continue
    }
    await ev(`${flyButton}?.click()`)
    let flying = false
    for (let i = 0; i < 60 && !flying; i += 1) {
      await wait(1000)
      flying = await ev(`!!document.querySelector('.fly__stick') && !!document.querySelector('.clay--shown')`)
    }
    if (!flying) fail(`Fly ${n}: the fly screen did not come up in 60 s`)
    else looked += 1
    last = await look('Fly', n)
    if (n === 1 || n === ROUNDS) await page.screenshot({ path: join(OUT, `fly-${n}.png`) })
    await ev(`document.querySelector('button[aria-label="Land and keep this flight"]')?.click()`)
    await wait(400)
    await ev(`[...document.querySelectorAll('.fly__confirm button')].find(b => b.textContent.trim() === 'Land')?.click()`)
    let landed = false
    for (let i = 0; i < 12 && !landed; i += 1) {
      await wait(500)
      landed = await ev(`!document.querySelector('.fly__stick')`)
    }
    if (!landed) fail(`Fly ${n}: Land did not close the fly screen`)
    /* Back to the 2D map for the next 3D open. */
    await ev(`document.querySelector('button[aria-label="Back to the 2D map"]')?.click()`)
    await wait(1200)
  }
  if (last !== null) {
    if (last.heap === null) console.log('  JS heap: WebKit does not report one (performance.memory is Chrome only); our own GPU count is the cap')
    else if (last.heap / 2 ** 20 > HEAP_CAP_MIB) fail(`after ${ROUNDS} rounds the JS heap is ${(last.heap / 2 ** 20).toFixed(0)} MiB, over ${HEAP_CAP_MIB}`)
    if (last.mem !== null) console.log(`  peak GPU by our own count over ${ROUNDS * 2} opens: ${Math.round(last.mem.peak / 1e6)} MB of ${BUDGET_IOS_BYTES / 1e6}`)
  }
  await ctx.close()
  watchdog.note('done')
} finally {
  await browser.close()
}
watchdog.stop()
if (looked === 0) {
  console.log('=== 3D FIVE AUDIT ABORTED: neither 3D nor Fly ever came up ===')
  process.exit(2)
}
console.log(`  screenshots: ${OUT}`)
console.log(`\n=== 3D FIVE PROBLEMS: ${problems} ===`)
process.exit(problems === 0 ? 0 : 1)
