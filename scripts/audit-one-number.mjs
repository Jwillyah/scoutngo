/*
 * ONE NUMBER EVERYWHERE (Batch Map A2), IN WEBKIT.
 *
 * Usage:  node scripts/audit-one-number.mjs [screenshot-dir]
 *
 * 9 Nov, Kill Devil Hills, the same minute: home Surf "3–4 ft", the menu's
 * Water card "2–3 ft", the Surf page "2–4 ft". Every value more than one
 * screen shows carries data-shared="<what>" (and data-value when the words
 * on screen are split); this opens the home, the Surf and Wind pages and the
 * menu for one fixture and fails when any two screens show a different value
 * for the same thing, or when a screen that should show one shows none (no
 * comparison is not a pass).
 *
 *   surf   home Today card · menu Surf card · Surf page headline
 *   wind   home Today card · Wind page headline
 */
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { webkit, devices } from './gate/playwright.mjs'
import { ensureApp, goToStage, guardAudit, startWatchdog, APP_ORIGIN } from './preflight.mjs'
import { shareLink } from '../src/lib/planShare.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'
import { placeKey } from '../src/core/venueName.ts'

guardAudit('one number')
const watchdog = startWatchdog('one number', 300_000)
const OUT = process.argv[2] ?? join(process.env.SCOUTNGO_OUT ?? tmpdir(), 'one-number')
mkdirSync(OUT, { recursive: true })

const PIER = { lat: 36.8435575, lon: -75.9713104 }
await ensureApp()
const venue = { ...CALIBRATION_VENUE, name: { key: placeKey(String(PIER.lat), String(PIER.lon)), name: 'Virginia Beach Fishing Pier' }, latitude: String(PIER.lat), longitude: String(PIER.lon), date: '2026-11-02', startTime: '09:00', endTime: '11:00' }
const url = await shareLink(`${APP_ORIGIN}/`, { id: 'one', name: 'One number', savedAt: '2026-10-29T00:00:00Z', venue, kit: { bodyIds: [], lensIds: [], droneIds: [], styleNotes: '' }, positions: [] })

let problems = 0
const fail = (why) => {
  console.log('      PROBLEM: ' + why)
  problems += 1
}

/* Every [data-shared] inside `root` (a selector), as { key: [values] }. */
const READ = (root) => `JSON.stringify((() => {
  const r = document.querySelector(${JSON.stringify(root)})
  if (!r) return null
  const out = {}
  for (const e of r.querySelectorAll('[data-shared]')) {
    const v = (e.dataset.value ?? e.textContent ?? '').trim()
    if (v === '' || v === '—' || v === '…') continue
    ;(out[e.dataset.shared] ??= []).push(v)
  }
  return out
})())`

/* What each screen must show, so a screen that lost its value fails rather than drops out of the comparison. */
const EXPECT = { home: ['surf', 'wind'], surf: ['surf'], wind: ['wind'], menu: ['surf'] }

const browser = await webkit.launch()
try {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } })
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('scoutngo.landing.v1', 'true')
    } catch {
      /* about:blank */
    }
  })
  const page = await ctx.newPage()
  /* 10:30 AM EST on 2 Nov, inside the fixtures' week, in daylight. */
  await page.clock.setFixedTime(new Date('2026-11-02T15:30:00Z'))
  const wait = (ms) => page.waitForTimeout(ms)
  const ev = (x) => page.evaluate(x)
  /* Polls until every expected key has a value, or 20 s. */
  const read = async (screen, root) => {
    let got = null
    for (let i = 0; i < 40; i += 1) {
      got = JSON.parse(await ev(READ(root)))
      if (got !== null && EXPECT[screen].every((k) => (got[k] ?? []).length > 0)) break
      await wait(500)
    }
    return got ?? {}
  }
  await page.goto(url)
  await wait(3500)
  await page.getByRole('button', { name: /^open$/i }).click({ timeout: 4000 }).catch(() => {})
  await goToStage(ev, wait, 'plan')
  await wait(1500)

  const seen = {}
  const take = (screen, values) => {
    console.log(`  ${screen}: ${JSON.stringify(values)}`)
    seen[screen] = values
    for (const k of EXPECT[screen]) if ((values[k] ?? []).length === 0) fail(`${screen} shows no ${k} value (data-shared="${k}")`)
  }

  /* The menu, over the map (a shared plan's link opens the map). */
  await page.locator('button[aria-label="Menu"]').first().click()
  take('menu', await read('menu', 'nav[aria-label="Stage"]'))
  await page.screenshot({ path: join(OUT, 'menu.png') })

  /* Menu › Today: the home, Today. */
  await page.locator('.mcard--today').first().click({ timeout: 4000 }).catch(() => fail('no Today card in the menu'))
  await wait(1500)
  take('home', await read('home', '.home__page[aria-label="Today"]'))
  await page.screenshot({ path: join(OUT, 'home.png') })

  /* The Surf page from the home's Surf card, then the Wind page from its tabs. */
  await page.locator('.home__page[aria-label="Today"] .hcard--surf').first().click({ timeout: 4000 }).catch(() => fail('no Surf card on the home'))
  take('surf', await read('surf', '.dpage--surf'))
  await page.screenshot({ path: join(OUT, 'surf.png') })
  await page.locator('.dpage__tab', { hasText: 'Wind' }).first().click({ timeout: 4000 }).catch(() => fail('no Wind tab on the detail page'))
  take('wind', await read('wind', '.dpage--wind'))
  await page.screenshot({ path: join(OUT, 'wind.png') })

  /* Each shared value: one answer across every screen that shows it. */
  const keys = new Set(Object.values(seen).flatMap((v) => Object.keys(v)))
  for (const k of keys) {
    const by = Object.entries(seen).flatMap(([screen, v]) => (v[k] ?? []).map((x) => ({ screen, x })))
    const distinct = [...new Set(by.map((b) => b.x))]
    console.log(`  ${k}: ${by.map((b) => `${b.screen} "${b.x}"`).join(' · ')}`)
    if (by.length < 2) fail(`${k} is on ${by.length} screen(s): nothing to compare`)
    if (distinct.length > 1) fail(`${k} differs: ${by.map((b) => `${b.screen} "${b.x}"`).join(', ')}`)
  }
  await ctx.close()
} catch (error) {
  fail(`ABORTED: ${error instanceof Error ? error.message : String(error)}`)
} finally {
  await browser.close()
  watchdog.stop()
}

console.log(`\n=== ONE NUMBER PROBLEMS: ${problems} ===`)
process.exit(problems === 0 ? 0 : 1)
