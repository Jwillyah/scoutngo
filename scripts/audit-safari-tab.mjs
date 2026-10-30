/*
 * EVERY BOTTOM CARD AND SHEET AT A SAFARI TAB'S HEIGHT: each button can be
 * brought onto the glass and a tap there lands on it.
 *
 * Usage:  node scripts/audit-safari-tab.mjs [screenshot-dir]
 *
 * From the field test of 30 Oct: in a Safari tab Setup step 3 ("How") put
 * Back and Done out of reach. A Safari tab with its toolbars leaves about
 * 664 px of page on a 390 x 844 iPhone, and every earlier audit ran at 844.
 *
 * For each surface, in WebKit at 390 x 664: every button in it is scrolled
 * into view the way a finger would (its own scroller), and must then sit
 * inside the window with the point at its centre landing on it, not on
 * something over it. A surface with no buttons found is a failure: nothing
 * was looked at.
 */
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { webkit, devices } from 'playwright'
import { ensureApp, goToStage, guardAudit, startWatchdog } from './preflight.mjs'
import { shareLink } from '../src/lib/planShare.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'
import { OPEN_METEO, fakeAnswer } from './openMeteoFake.mjs'

guardAudit('safari tab')
const watchdog = startWatchdog('safari tab', 420_000)
const OUT = process.argv[2] ?? join(process.env.SCOUTNGO_OUT ?? tmpdir(), 'safari-tab')
mkdirSync(OUT, { recursive: true })
await ensureApp()
const NOW = new Date('2026-10-30T11:30:00Z')
const venue = { ...CALIBRATION_VENUE, latitude: '36.8435575', longitude: '-75.9713104', date: '2026-10-30', startTime: '07:00', endTime: '08:00' }
const url = new URL(await shareLink('http://127.0.0.1:5173/', { id: 'tab', name: 'Tab check', savedAt: '2026-10-29T00:00:00Z', venue, kit: { bodyIds: [], lensIds: [], droneIds: ['dji-air-3s'], styleNotes: '' }, positions: [] }))

let problems = 0
let surfaces = 0
const fail = (why) => {
  console.log('      PROBLEM: ' + why)
  problems += 1
}

/* In the page: every visible button under `sel`, brought into view, then hit-tested. */
const REACH = (sel) => `(() => {
  const root = document.querySelector(${JSON.stringify(sel)})
  if (!root) return null
  const out = []
  for (const b of root.querySelectorAll('button, [role="tab"], a[href]')) {
    const cs = getComputedStyle(b)
    if (cs.visibility === 'hidden' || cs.display === 'none' || b.closest('[hidden], details:not([open]) > :not(summary)')) continue
    if (b.getClientRects().length === 0) continue
    /*
     * BEFORE ANY SCROLL: a button not wholly on show must sit in a box a
     * finger can scroll. scrollIntoView scrolls an overflow:hidden box too,
     * which no finger can; the first version of this check passed the old
     * Setup card on exactly that (30 Oct).
     */
    let trapped = null
    const r0 = b.getBoundingClientRect()
    for (let a = b.parentElement; a !== null && a !== document.body; a = a.parentElement) {
      const cs2 = getComputedStyle(a)
      if (cs2.overflowY === 'visible' && cs2.overflowX === 'visible') continue
      const ar = a.getBoundingClientRect()
      const outside = r0.top < ar.top - 1 || r0.bottom > ar.bottom + 1
      if (outside && !/(auto|scroll)/.test(cs2.overflowY)) { trapped = (a.className?.toString?.() || a.tagName).slice(0, 40); break }
      if (/(auto|scroll)/.test(cs2.overflowY)) break
    }
    b.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    const r = b.getBoundingClientRect()
    const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2))
    const y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2))
    const hit = document.elementFromPoint(x, y)
    const name = (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 40)
    const inside = r.top >= -1 && r.bottom <= innerHeight + 1 && r.width > 0 && r.height > 0
    const lands = hit !== null && (hit === b || b.contains(hit) || hit.contains(b))
    out.push({ name, inside: inside && trapped === null, lands, bottom: Math.round(r.bottom), trapped, over: hit && !lands ? (hit.className?.toString?.() || hit.tagName).slice(0, 40) : null })
  }
  return out
})()`

const browser = await webkit.launch()
try {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 664 }, serviceWorkers: 'block' })
  await ctx.route(/^https:\/\/api\.weather\.gov|\/api\/(buoy|metar)/, (r) => r.fulfill({ status: 503, body: 'not in this audit' }))
  await ctx.route(OPEN_METEO, (r) => r.fulfill({ json: fakeAnswer(r.request().url(), NOW) }))
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('scoutngo.landing.v1', 'true')
    } catch {
      /* about:blank */
    }
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: NOW })
  await page.clock.resume()
  const wait = (ms) => page.waitForTimeout(ms)
  const ev = (x) => page.evaluate(x)
  await page.goto(url.href)
  await wait(3000)
  await page.getByRole('button', { name: /^open$/i }).click({ timeout: 3000 }).catch(() => {})
  await page.getByText('Open the map', { exact: true }).click({ timeout: 3000 }).catch(() => {})

  /* A sheet's body scrolls at its top stop; at half it is pulled up, which is how a finger gets to the rest. */
  const toFull = async () => {
    for (let i = 0; i < 4; i += 1) {
      if ((await ev(`document.querySelector('.sheet')?.dataset.detent ?? null`)) === 'full') return true
      await ev(`document.querySelector('.sheet__handle')?.click()`)
      await wait(600)
    }
    return false
  }
  const check = async (name, sel, shot) => {
    if (sel === '.sheet' && !(await toFull())) fail(`${name}: the sheet would not go to its top stop`)
    const rows = await ev(REACH(sel))
    if (rows === null) return fail(`${name}: "${sel}" is not on the page, so nothing was looked at`)
    surfaces += 1
    const bad = rows.filter((r) => !r.inside || !r.lands)
    console.log(`  ${name}: ${rows.length} buttons, ${bad.length} out of reach`)
    if (rows.length === 0) fail(`${name}: no buttons found in "${sel}"`)
    for (const b of bad) fail(`${name}: "${b.name}" ${b.trapped !== null ? `is cut off inside "${b.trapped}", which no finger can scroll` : b.inside ? `is under ${b.over}` : `ends at ${b.bottom} px, past the window's ${664}`}`)
    if (shot) await page.screenshot({ path: join(OUT, `${shot}.png`) })
  }

  /* Setup, steps 1 to 3. */
  await goToStage(ev, wait, 'setup')
  await wait(1500)
  for (const step of [1, 2, 3]) {
    await check(`Setup step ${step}`, '.wiz', `tab-setup-${step}`)
    if (step < 3) {
      await page.locator('.wiz__next').first().tap()
      await wait(700)
    }
  }
  await page.locator('.wiz__next').first().tap()
  await wait(1500)
  await goToStage(ev, wait, 'plan')
  await wait(2000)

  /* The plan sheet at each stop. */
  await check('Plan sheet', '.sheet', 'tab-sheet')
  /* The Tides page, from its chip. */
  await page.locator('.chip2', { hasText: 'TIDE' }).first().tap()
  await wait(1500)
  await check('Tides page', '.page', 'tab-tides')
  await page.keyboard.press('Escape')
  await goToStage(ev, wait, 'plan')
  await wait(800)
  /* Sky, from the menu. */
  await page.locator('button[aria-label="Menu"]').first().tap()
  await wait(500)
  await check('Menu', '.sidemenu__panel', 'tab-menu')
  await page.getByText('Sky', { exact: true }).first().tap()
  await wait(1200)
  await check('Sky card', '.sheet', 'tab-sky')
  watchdog.note('done')
  await ctx.close()
} finally {
  await browser.close()
}
watchdog.stop()
if (surfaces === 0) {
  console.log('=== SAFARI TAB AUDIT ABORTED: nothing was looked at ===')
  process.exit(2)
}
console.log(`  screenshots: ${OUT}`)
console.log(`\n=== SAFARI TAB PROBLEMS: ${problems} ===`)
process.exit(problems === 0 ? 0 : 1)
