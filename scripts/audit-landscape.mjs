/*
 * THE APP ON ITS SIDE, AT 844 x 390 (Batch F, Section 4).
 *
 * Usage:  node scripts/audit-landscape.mjs [screenshot-dir]
 *
 * In landscape the venue bar, the chips, the tool dock and the bottom sheet
 * were laid out as in portrait and covered most of the map and the 3D view.
 * Now: one column at the left (the bar, the chips in one row, the sheet as a
 * side panel at most 40% of the width), the tool dock a vertical strip at the
 * right edge. In WebKit at 844 x 390 with a phone's landscape insets, at the
 * sheet's peek and half, this checks: the sheet is at most 40% wide and at
 * the left; the chips are one row; the dock is taller than wide and at the
 * right edge; none of the bar, chips, sheet, dock, rail or shadow key covers
 * another; and at least half the screen is left for the view.
 */
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { webkit, devices } from './gate/playwright.mjs'
import { ensureApp, goToStage, guardAudit, startWatchdog, APP_ORIGIN } from './preflight.mjs'
import { shareLink } from '../src/lib/planShare.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'
import { OPEN_METEO, fakeAnswer } from './openMeteoFake.mjs'
import { SETTLE } from './sheetGestures.mjs'

guardAudit('landscape')
const watchdog = startWatchdog('landscape', 240_000)
const OUT = process.argv[2] ?? join(process.env.SCOUTNGO_OUT ?? tmpdir(), 'landscape')
mkdirSync(OUT, { recursive: true })
await ensureApp()
const NOW = new Date('2026-10-30T11:30:00Z')
const venue = { ...CALIBRATION_VENUE, latitude: '36.8435575', longitude: '-75.9713104', date: '2026-10-30', startTime: '07:00', endTime: '08:00' }
const url = await shareLink(`${APP_ORIGIN}/`, { id: 'land', name: 'Landscape check', savedAt: '2026-10-29T00:00:00Z', venue, kit: { bodyIds: [], lensIds: [], droneIds: ['dji-air-3s'], styleNotes: '' }, positions: [] })

let problems = 0
const fail = (why) => {
  console.log('      PROBLEM: ' + why)
  problems += 1
}

const browser = await webkit.launch()
const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 844, height: 390 }, serviceWorkers: 'block' })
await ctx.route(OPEN_METEO, (r) => r.fulfill({ json: fakeAnswer(r.request().url(), NOW) }))
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('scoutngo.landing.v1', 'true')
  } catch {
    /* about:blank */
  }
  /* A phone on its side from the home screen: no top inset, 21 px at the bottom. */
  const add = () => {
    const s = document.createElement('style')
    s.textContent = ':root{--safe-top:0px!important;--safe-bottom:21px!important}'
    document.head.appendChild(s)
  }
  if (document.head) add()
  else document.addEventListener('DOMContentLoaded', add)
})
const page = await ctx.newPage()
await page.clock.install({ time: NOW })
await page.clock.resume()
const wait = (ms) => page.waitForTimeout(ms)
const ev = (x) => page.evaluate(x)
await page.goto(url)
await wait(3000)
await page.getByRole('button', { name: /^open$/i }).click({ timeout: 3000 }).catch(() => {})
await goToStage(ev, wait, 'plan')
await wait(1500)

const MEASURE = `(() => {
  const r = (q) => { const e = document.querySelector(q); if (!e) return null; const b = e.getBoundingClientRect(); if (b.width < 2 || b.height < 2) return null; return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height } }
  const chips = [...document.querySelectorAll('.chips2 > *')].map((c) => Math.round(c.getBoundingClientRect().top))
  return { vw: innerWidth, vh: innerHeight, detent: document.querySelector('.sheet')?.dataset.detent ?? null, parts: { bar: r('.topbar'), chips: r('.chips2'), sheet: r('.sheet'), dock: r('.tooldock'), rail: r('.rail2'), key: r('.shadowkey') }, chipRows: new Set(chips).size }
})()`

for (const detent of ['peek', 'half']) {
  for (let i = 0; i < 4 && (await ev(`document.querySelector('.sheet')?.dataset.detent`)) !== detent; i += 1) {
    await ev(`document.querySelector('.sheet__handle')?.click()`)
    await wait(300)
    await ev(SETTLE)
  }
  await ev(SETTLE)
  const m = await ev(MEASURE)
  console.log(`  ${detent}: ${JSON.stringify(m)}`)
  if (m.detent !== detent) {
    fail(`could not put the sheet at ${detent}`)
    continue
  }
  const { sheet, dock, chips } = m.parts
  if (sheet === null) fail(`${detent}: no sheet on screen`)
  else {
    if (sheet.width > 0.4 * m.vw + 1) fail(`${detent}: the sheet is ${Math.round(sheet.width)} px wide, over 40% of ${m.vw}`)
    if (sheet.left > 0.1 * m.vw) fail(`${detent}: the sheet is not a side panel at the left (left ${Math.round(sheet.left)})`)
  }
  if (chips === null) fail(`${detent}: no chips`)
  else if (m.chipRows !== 1) fail(`${detent}: the chips take ${m.chipRows} rows, not one`)
  /* Batch K addendum: the tool dock is gone (Features is in the rail); one on screen is a regression. */
  if (dock !== null) fail(`${detent}: a tool dock is on screen; it was removed`)
  if (m.parts.rail === null) fail(`${detent}: no map rail (compass, Features, 3D)`)
  const named = Object.entries(m.parts).filter(([, b]) => b !== null)
  for (let i = 0; i < named.length; i += 1)
    for (let j = i + 1; j < named.length; j += 1) {
      const [an, a] = named[i]
      const [bn, b] = named[j]
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left)
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      if (w > 1 && h > 1) fail(`${detent}: ${an} over ${bn} by ${Math.round(w)}x${Math.round(h)}px`)
    }
  /* What is left for the view: the screen less every part (they do not overlap, checked above). */
  const covered = named.reduce((s, [, b]) => s + Math.max(0, Math.min(b.right, m.vw) - Math.max(b.left, 0)) * Math.max(0, Math.min(b.bottom, m.vh) - Math.max(b.top, 0)), 0)
  const free = 1 - covered / (m.vw * m.vh)
  console.log(`  ${detent}: ${Math.round(free * 100)}% of the screen left for the view`)
  if (free < 0.5) fail(`${detent}: only ${Math.round(free * 100)}% of the screen is left for the view`)
  await page.screenshot({ path: join(OUT, `landscape-${detent}.png`) })
}

await browser.close()
watchdog.stop()
console.log(`\n=== LANDSCAPE PROBLEMS: ${problems} ===`)
process.exit(problems === 0 ? 0 : 1)
