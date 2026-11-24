/*
 * THE MAP OPENS CLEAN (Batch SIMPLE-1, Section 0).
 *
 * Usage:  node scripts/audit-clean-map.mjs [screenshot-dir]
 *
 * A friend took twenty minutes to find their way round the app; part of it was
 * sheets that came up by themselves: the planner on a link, the drone's
 * Preflight back with the map after the home. Six ways onto the map, each
 * must land on the map, the marker and the time bar, and nothing else:
 *
 *   home       the home's Map button
 *   menu       Menu › Plan a shoot (the planner, asked for), then its way out
 *   drone      the Drone page's Preflight › Plan a shoot (the planner, asked
 *              for), then its way out; and the Drone page's Airspace tab,
 *              Back, then the home's Map
 *   search     the place pill, a spot picked, then Map
 *   wind       the home's Wind tile (the map's wind), its Back, then the
 *              home's Map: the plain map, no layer left on (SIMPLE-2, S5)
 *   link       a link with a query (no home over it), and a reload
 *
 * Clean: the map's shell, no setup, the sheet's own card (the time bar) at
 * its lowest, no page, no dialog, no 3D.
 */
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { webkit, devices } from './gate/playwright.mjs'
import { ensureApp, guardAudit, startWatchdog, APP_ORIGIN, openMenu } from './preflight.mjs'

guardAudit('clean map')
const watchdog = startWatchdog('clean map', 300_000)
const OUT = process.argv[2] ?? join(process.env.SCOUTNGO_OUT ?? tmpdir(), 'clean-map')
mkdirSync(OUT, { recursive: true })
await ensureApp()

const PIER = { lat: 36.8435575, lon: -75.9713104 }
let problems = 0
let looked = 0
const fail = (why) => {
  console.log('      PROBLEM: ' + why)
  problems += 1
}

const STATE = `JSON.stringify((() => {
  const shell = document.querySelector('.shell')?.className.match(/shell--([a-z]+)/)?.[1] ?? null
  return {
    shell,
    setup: !!document.querySelector('.mode-setup'),
    card: document.querySelector('.sheet [data-card]')?.getAttribute('data-card') ?? null,
    peek: !!document.querySelector('.sheet.sheet--peek'),
    home: !!document.querySelector('.home'),
    page: [...document.querySelectorAll('.page[aria-label]')].map((p) => p.getAttribute('aria-label')),
    dialogs: [...document.querySelectorAll('[role="dialog"][aria-label]')].map((d) => d.getAttribute('aria-label')),
    threeD: !!document.querySelector('.clay3d, [data-clay3d]'),
    layer: document.querySelector('.mode-plan')?.getAttribute('data-weather-layer') ?? null,
    windView: document.querySelector('[data-wind-view]')?.getAttribute('data-wind-view') ?? null,
  }
})())`

const browser = await webkit.launch()
try {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } })
  await ctx.addInitScript(([at]) => {
    try {
      localStorage.setItem('scoutngo.landing.v1', 'true')
      localStorage.setItem('scoutngo.nearMe.v1', 'off')
      localStorage.setItem('scoutngo.activities.v1', JSON.stringify(['shoot', 'drone', 'surf']))
      if (localStorage.getItem('scoutngo.lastSetup.v1') === null) localStorage.setItem('scoutngo.lastSetup.v1', JSON.stringify({ at, name: { key: 'x', name: 'Virginia Beach Fishing Pier' }, shootKind: 'sunset', platform: 'both', reachMeters: 2000 }))
    } catch {
      /* about:blank */
    }
    /* A person, not a driver: the home opens on a bare front door (src/lib/briefingOpen.ts). */
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false })
  }, [PIER])
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date('2026-11-02T15:00:00Z') })
  await page.clock.resume()
  const wait = (ms) => page.waitForTimeout(ms)
  const ev = (x) => page.evaluate(x)
  const tap = async (locator, what) => {
    try {
      await locator.first().click({ timeout: 5000 })
      return true
    } catch {
      fail(`could not tap ${what}`)
      return false
    }
  }
  const openMap = () => tap(page.getByRole('button', { name: /^open the map$/i }), 'the Map button')
  const front = async () => {
    await page.goto(`${APP_ORIGIN}/`)
    for (let i = 0; i < 20 && !(await ev(`!!document.querySelector('.home')`)); i += 1) await wait(500)
    await wait(800)
  }
  const clean = async (way, { layersOff = false } = {}) => {
    await wait(1800)
    const s = JSON.parse(await ev(STATE))
    looked += 1
    console.log(`  ${way}: ${JSON.stringify(s)}`)
    await page.screenshot({ path: join(OUT, `${way.replace(/\W+/g, '-')}.png`) })
    if (s.shell !== 'plan' || s.home) fail(`${way}: not on the map (${s.shell}${s.home ? ', the home over it' : ''})`)
    if (s.setup) fail(`${way}: the planner opened by itself`)
    if (s.card !== 'shoot') fail(`${way}: the sheet shows the ${s.card} card, not just the time bar`)
    if (!s.peek) fail(`${way}: the sheet is up, not at its lowest`)
    if (s.page.length > 0) fail(`${way}: a page is over the map (${s.page.join(', ')})`)
    if (s.dialogs.length > 0) fail(`${way}: a dialog is up (${s.dialogs.join(', ')})`)
    if (s.threeD) fail(`${way}: the 3D view is up`)
    if (layersOff && (s.layer !== 'off' || s.windView !== null)) fail(`${way}: a weather layer is still on (${s.layer}${s.windView === null ? '' : `, the wind view on ${s.windView}`})`)
  }

  console.log('\n### home')
  await front()
  if (await openMap()) await clean('home')

  console.log('\n### menu › Plan a shoot, then out of it')
  await openMenu(ev, wait)
  if (await tap(page.locator('.mrow', { hasText: 'Plan a shoot' }), 'Menu › Plan a shoot')) {
    await wait(1500)
    /* Batch SIMPLE-3, Section 4: Plan a shoot is the Day sheet; the planner is its "Add positions ›". */
    if (await ev(`!!document.querySelector('.dsheet')`)) {
      await tap(page.locator('.dsheet [data-add-positions]'), 'Add positions ›')
      await wait(1500)
    }
    if (!(await ev(`!!document.querySelector('.mode-setup')`))) fail('menu: Plan a shoot did not open the planner')
    if (await tap(page.getByRole('button', { name: /^same as last time$/i }), "the planner's Same as last time")) await clean('menu')
  }

  console.log('\n### drone')
  await front()
  /* Batch SIMPLE-1, Section 1: the Drone page's door to the planner is Preflight › Plan a shoot. */
  if (await tap(page.locator('.home button', { hasText: /^Drone/ }), "the home's Drone card")) {
    await wait(1500)
    await tap(page.locator('button[role="tab"]', { hasText: /^Preflight$/ }), "the Drone page's Preflight tab")
    await wait(800)
    if (await tap(page.getByRole('button', { name: /^plan a shoot ›$/i }), "Preflight's Plan a shoot")) {
      await wait(1500)
      if (!(await ev(`!!document.querySelector('.mode-setup')`))) fail('drone: Plan a shoot did not open the planner')
      if (await tap(page.getByRole('button', { name: /^same as last time$/i }), "the planner's Same as last time")) await clean('drone, Plan a shoot, out')
    }
  }
  /*
   * Batch SIMPLE-2, Section 4: the tap-in Drone page has no Map button of its
   * own; its way to the map is Back, then the home's Map. Through the
   * Airspace tab first, so a map the page drew cannot leave a layer, a card or
   * a raised sheet on the plain map.
   */
  await front()
  if (await tap(page.locator('.home button', { hasText: /^Drone/ }), "the home's Drone card")) {
    await wait(1500)
    if (await ev(`!!document.querySelector('[aria-label="Drone"] button[aria-label="Open the map"]')`)) fail('drone: the tap-in Drone page still has a Map button of its own')
    await tap(page.locator('.tipage__tabs [role="tab"]', { hasText: /^Airspace$/ }), "the Drone page's Airspace tab")
    await wait(1500)
    if (await tap(page.locator('.ppage__back'), "the Drone page's Back")) {
      for (let i = 0; i < 20 && !(await ev(`!!document.querySelector('.home')`)); i += 1) await wait(250)
      if (!(await ev(`!!document.querySelector('.home')`))) fail("drone: the Drone page's Back did not land on the home")
      else if (await openMap()) await clean('drone, Airspace, Back, then Map', { layersOff: true })
    }
  }

  console.log('\n### search')
  if (await tap(page.locator('button.pill-venue'), 'the place pill')) {
    await wait(800)
    await page.locator('.spick__search').fill('Croatan')
    await wait(1500)
    if (await tap(page.locator('.spick button', { hasText: 'Croatan' }), 'the Croatan result')) {
      await wait(1500)
      if (await ev(`!!document.querySelector('.home')`)) await openMap()
      await clean('search pick')
    }
  }

  /*
   * Batch SIMPLE-2, Section 5: the Wind tile is the map on its wind layer;
   * Back is the home, and the map the home's Map button opens next is the
   * plain map again (no layer, no Map | Charts).
   */
  console.log('\n### wind, then the map')
  await front()
  if (await tap(page.locator('.home [data-tile="wind"]'), "the home's Wind tile")) {
    await wait(2500)
    const w = JSON.parse(await ev(STATE))
    console.log(`  wind tile: ${JSON.stringify(w)}`)
    if (w.layer !== 'wind' || w.windView !== 'map') fail(`wind: the Wind tile did not open the map's wind (${w.layer}, ${w.windView})`)
    if (w.setup) fail('wind: the planner opened with the wind')
    if (await tap(page.locator('.topbar__back'), "the wind view's Back")) {
      for (let i = 0; i < 20 && !(await ev(`!!document.querySelector('.home')`)); i += 1) await wait(250)
      if (await openMap()) await clean('wind, Back, then Map', { layersOff: true })
    }
  }

  console.log('\n### link')
  await page.goto(`${APP_ORIGIN}/?from=link`)
  await wait(3500)
  await clean('link with a query')
  await page.reload()
  await wait(3500)
  await clean('reload')
  await ctx.close()
  watchdog.note('clean map')
} finally {
  await browser.close()
}
watchdog.stop()
if (looked < 8) {
  console.log(`=== CLEAN MAP AUDIT ABORTED: ${looked} of 8 ways looked at ===`)
  process.exit(2)
}
console.log(`  screenshots: ${OUT}`)
console.log(`\n=== CLEAN MAP PROBLEMS: ${problems} ===`)
process.exit(problems === 0 ? 0 : 1)
