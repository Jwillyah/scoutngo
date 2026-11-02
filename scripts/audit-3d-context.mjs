/*
 * THE 3D VIEW NEVER GOES BLACK (Batch I, Section 4: "didn't work, gave a
 * problem"; "works but flashes black and back").
 *
 * Usage:  node scripts/audit-3d-context.mjs [screenshot-dir]
 * Exits:  0 clean; 1 a problem; 2 could not look.
 *
 * WebKit at 390 x 844, the Virginia Beach pier, the 3D view opened.
 *
 *   lost       the WebGL context is taken away (WEBGL_lose_context, what iOS
 *              does under memory pressure): the view says it is rebuilding,
 *              it is not a black canvas
 *   restored   the context comes back: the scene is built again, the
 *              message goes, and the picture is not black
 *   the pier   Batch I, Section 6: the Virginia Beach Fishing Pier is drawn
 *              as a deck on pilings (OSM's pier, from the map's tiles)
 *   a throw    a frame that throws: the actual message, "Copy error" and
 *              "Try again"; Try again builds the view again
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { webkit, devices } from './gate/playwright.mjs'
import { APP_ORIGIN, goToStage, guardAudit, startWatchdog } from './preflight.mjs'
import { decodePng } from '../src/lib/png.ts'
import { shareLink } from '../src/lib/planShare.ts'
import { placeKey } from '../src/core/venueName.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'

guardAudit('3d context')
const watchdog = startWatchdog('3d context', 300_000)
const OUT = process.argv[2] ?? join(process.env.SCOUTNGO_OUT ?? tmpdir(), '3d-context')
mkdirSync(OUT, { recursive: true })
let problems = 0
let looked = 0
const fail = (why) => {
  console.log('      PROBLEM: ' + why)
  problems += 1
}
const PIER = { lat: 36.8435575, lon: -75.9713104 }
const AT = '2026-11-01T15:07:00Z'

/* Mean luminance of the 3D canvas's box on screen, from a screenshot (the canvas does not keep its buffer). */
async function canvasLuma(page) {
  const box = await page.locator('.clay__canvas canvas').first().boundingBox()
  if (box === null) return null
  const png = await page.screenshot({ clip: { x: box.x, y: box.y + box.height * 0.2, width: box.width, height: box.height * 0.5 } })
  const px = await decodePng(new Uint8Array(png))
  let sum = 0
  for (let i = 0; i < px.data.length; i += 4) sum += 0.2126 * px.data[i] + 0.7152 * px.data[i + 1] + 0.0722 * px.data[i + 2]
  return sum / (px.data.length / 4)
}

const browser = await webkit.launch()
try {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('scoutngo.landing.v1', 'true')
    } catch {
      /* about:blank */
    }
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(AT) })
  await page.clock.resume()
  const wait = (ms) => page.waitForTimeout(ms)
  const ev = (x) => page.evaluate(x)
  const venue = { ...CALIBRATION_VENUE, name: { key: placeKey(String(PIER.lat), String(PIER.lon)), name: 'Virginia Beach Fishing Pier' }, latitude: String(PIER.lat), longitude: String(PIER.lon), date: '2026-11-01', startTime: '09:00', endTime: '12:00' }
  await page.goto(await shareLink(`${APP_ORIGIN}/`, { id: 'ctx', name: 'Context', savedAt: '2026-10-31T00:00:00Z', venue, kit: { bodyIds: [], lensIds: [], droneIds: [], styleNotes: '' }, positions: [] }))
  await wait(3000)
  await page.getByRole('button', { name: /^open$/i }).click({ timeout: 3000 }).catch(() => {})
  await goToStage(ev, wait, 'plan')
  await wait(1500)
  await ev(`document.querySelector('button[aria-label="Open the 3D clay model"]')?.click()`)
  for (let i = 0; i < 40 && !(await ev(`!!window.__clay && !!document.querySelector('.clay--shown')`)); i += 1) await wait(1000)
  if (!(await ev('!!window.__clay'))) {
    console.log('=== 3D CONTEXT AUDIT ABORTED: the 3D view never came up ===')
    process.exit(2)
  }
  looked += 1
  await wait(2000)
  /* Batch I, Section 6: the pier is a deck on pilings, from the map's own tiles. */
  let decks = null
  for (let i = 0; i < 15; i += 1) {
    decks = await ev(`window.__clay.decks()`)
    if (decks.piers > 0) break
    await wait(1000)
  }
  console.log(`  decks at the pier: ${JSON.stringify(decks)}`)
  if (decks === null || decks.piers === 0 || decks.pilings === 0) fail(`no pier deck on pilings at the Virginia Beach pier in 3D (${JSON.stringify(decks)})`)
  const before = await canvasLuma(page)
  console.log(`  up: canvas luminance ${before?.toFixed(1)}`)

  /* Lost. */
  const lostOk = await ev(`(() => { const c = document.querySelector('.clay__canvas canvas'); const gl = c.getContext('webgl2') ?? c.getContext('webgl'); const ext = gl?.getExtension('WEBGL_lose_context'); if (!ext) return false; window.__lose = ext; ext.loseContext(); return true })()`)
  if (!lostOk) {
    console.log('=== 3D CONTEXT AUDIT ABORTED: no WEBGL_lose_context here ===')
    process.exit(2)
  }
  await wait(800)
  const during = await ev(`document.querySelector('.clay__error')?.textContent ?? null`)
  console.log(`  lost: ${JSON.stringify(during)}`)
  if (during === null || !/Rebuilding the 3D view/.test(during)) fail(`the context was lost and the view did not say it is rebuilding (${JSON.stringify(during)})`)
  await page.screenshot({ path: join(OUT, 'lost.png') })

  /* Restored: built again, not black. */
  const first = await ev(`(() => { const s = window.__clay; window.__clayBefore = s; return true })()`)
  void first
  await ev(`window.__lose.restoreContext()`)
  let rebuilt = false
  for (let i = 0; i < 30 && !rebuilt; i += 1) {
    await wait(1000)
    rebuilt = await ev(`window.__clay !== window.__clayBefore && !document.querySelector('.clay__error') && !!document.querySelector('.clay--shown')`)
  }
  await wait(2500)
  const after = await canvasLuma(page)
  console.log(`  restored: rebuilt ${rebuilt}, canvas luminance ${after?.toFixed(1)}`)
  if (!rebuilt) fail('after the context came back the scene was not built again (or the message stayed)')
  if (after === null || after < 12) fail(`after the context came back the picture is black (luminance ${after})`)
  await page.screenshot({ path: join(OUT, 'restored.png') })

  /* A frame that throws: said, with Copy error and Try again. */
  await ev(`(() => { const s = window.__clay; window.__clayBefore = s; s.renderer.render = () => { throw new Error('test: a frame threw') }; s.setTime(new Date('${AT}')) })()`)
  await wait(1500)
  const err = await ev(`JSON.stringify({ text: document.querySelector('.clay__error')?.textContent ?? null, buttons: [...document.querySelectorAll('.clay__error button')].map((b) => b.textContent) })`)
  console.log(`  a throw: ${err}`)
  const e = JSON.parse(err)
  if (e.text === null || !/The 3D view stopped/.test(e.text) || !/test: a frame threw/.test(e.text)) fail(`a frame threw and the message was not shown (${JSON.stringify(e.text)})`)
  if (JSON.stringify(e.buttons) !== JSON.stringify(['Copy error', 'Try again'])) fail(`the error screen's buttons are ${JSON.stringify(e.buttons)}`)
  await page.screenshot({ path: join(OUT, 'error.png') })
  await page.getByRole('button', { name: 'Try again' }).click().catch(() => {})
  let again = false
  for (let i = 0; i < 30 && !again; i += 1) {
    await wait(1000)
    again = await ev(`window.__clay !== window.__clayBefore && !document.querySelector('.clay__error')`)
  }
  console.log(`  try again: built ${again}`)
  if (!again) fail('Try again did not build the view again')
  await ctx.close()
  watchdog.note('done')
} finally {
  await browser.close()
}
watchdog.stop()
if (looked === 0) {
  console.log('=== 3D CONTEXT AUDIT ABORTED: nothing was looked at ===')
  process.exit(2)
}
console.log(`  screenshots: ${OUT}`)
console.log(`\n=== 3D CONTEXT PROBLEMS: ${problems} ===`)
process.exit(problems === 0 ? 0 : 1)
