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
 *   sky    the colour call (Batch QA, Section 0: the home said "possible"
 *          and Color detail "likely"): home Sky card · menu Sky card · Sky
 *          page headline · Color detail headline, one word set (colorWords)
 *   tide   the next turn (Batch QA, Section 3): home Tide card · Tide page ·
 *          menu Tide card · the map's tide chip
 *   sunset home Sky card · Sky page · menu Sky card (while it is to come)
 *   temp   home · Weather page
 *
 * Three spots at three times each (SPOTS, TIMES below).
 */
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { webkit, devices } from './gate/playwright.mjs'
import { ensureApp, goToStage, guardAudit, startWatchdog, APP_ORIGIN, openMenu } from './preflight.mjs'

/* Batch Polish, Section 2: the menu is the home's (and setup's and field's); on the map its Back goes home first (scripts/preflight.mjs openMenu). */
const menuOn = (pg) => openMenu((x) => pg.evaluate(x), (ms) => pg.waitForTimeout(ms))
import { shareLink } from '../src/lib/planShare.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'
import { placeKey } from '../src/core/venueName.ts'

guardAudit('one number')
const watchdog = startWatchdog('one number', 900_000)
const OUT = process.argv[2] ?? join(process.env.SCOUTNGO_OUT ?? tmpdir(), 'one-number')
mkdirSync(OUT, { recursive: true })

/*
 * BATCH QA, SECTION 3: three spots (the pier, Kill Devil Hills, inland at Big
 * Meadows) at three times (8 AM, 3 PM, 8 PM, after dark), on 2 Nov in the
 * fixtures' week. Each run walks every screen that says a shared value and
 * fails when two say it differently, or when a screen that must say it says
 * nothing (no comparison is not a pass).
 */
const SPOTS = [
  { key: 'pier', name: 'Virginia Beach Fishing Pier', lat: 36.8435575, lon: -75.9713104, coast: true },
  /* The fixtures' NOAA station list has none within reach of KDH (scripts/gate/fixtures.mjs): its tide is "—" here, honestly, so it is not required. */
  { key: 'kdh', name: '1st Street', lat: 36.0286, lon: -75.6662, coast: true, noTide: true },
  { key: 'inland', name: 'Big Meadows', lat: 38.52, lon: -78.44, coast: false },
]
const TIMES = [
  { key: '8am', at: '2026-11-02T13:00:00Z' },
  { key: '3pm', at: '2026-11-02T20:00:00Z' },
  { key: '8pm', at: '2026-11-03T01:00:00Z' },
]
await ensureApp()
const linkFor = (spot) => shareLink(`${APP_ORIGIN}/`, { id: `one-${spot.key}`, name: 'One number', savedAt: '2026-10-29T00:00:00Z', venue: { ...CALIBRATION_VENUE, name: { key: placeKey(String(spot.lat), String(spot.lon)), name: spot.name }, latitude: String(spot.lat), longitude: String(spot.lon), date: '2026-11-02', startTime: '09:00', endTime: '11:00' }, kit: { bodyIds: [], lensIds: [], droneIds: [], styleNotes: '' }, positions: [] })

let problems = 0
let runs = 0
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

/* What each screen must say, by spot: a screen that lost its value fails rather than drops out. */
const expectFor = (spot) => ({
  home: spot.coast ? ['surf', 'wind', 'skycall', 'temp', ...(spot.noTide ? [] : ['tide'])] : ['wind', 'skycall', 'temp'],
  menu: spot.coast ? ['surf', 'skycall'] : ['skycall'],
  surf: spot.coast ? ['surf'] : [],
  wind: ['wind'],
  tide: spot.coast && !spot.noTide ? ['tide'] : [],
  sky: ['skycall'],
  detail: ['skycall'],
  weather: ['temp'],
  map: spot.coast && !spot.noTide ? ['tide'] : [],
})

const browser = await webkit.launch()
try {
  for (const spot of SPOTS) {
    const url = await linkFor(spot)
    for (const time of TIMES) {
      console.log(`\n### ${spot.name}, ${time.key}`)
      const EXPECT = expectFor(spot)
      const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } })
      await ctx.addInitScript(() => {
        try {
          localStorage.setItem('scoutngo.landing.v1', 'true')
        } catch {
          /* about:blank */
        }
      })
      const page = await ctx.newPage()
      await page.clock.setFixedTime(new Date(time.at))
      const wait = (ms) => page.waitForTimeout(ms)
      const ev = (x) => page.evaluate(x)
      const read = async (screen, root) => {
        let got = null
        for (let i = 0; i < 40; i += 1) {
          got = JSON.parse(await ev(READ(root)))
          if (got !== null && (EXPECT[screen] ?? []).every((k) => (got[k] ?? []).length > 0)) break
          await wait(500)
        }
        return got ?? {}
      }
      const seen = {}
      const take = (screen, values) => {
        console.log(`  ${screen}: ${JSON.stringify(values)}`)
        seen[screen] = values
        for (const k of EXPECT[screen] ?? []) if ((values[k] ?? []).length === 0) fail(`${spot.name} ${time.key}: ${screen} shows no ${k} value (data-shared="${k}")`)
      }
      const tap = (sel) => page.locator(sel).first().click({ timeout: 5000, noWaitAfter: true }).then(() => true, () => false)
      try {
        await page.goto(url)
        await wait(3500)
        await page.getByRole('button', { name: /^open$/i }).click({ timeout: 4000 }).catch(() => {})
        await goToStage(ev, wait, 'plan')
        /* The shared link's spot applied before anything is read: a menu opened sooner still says the spot before (Batch QA, Section 3: Big Meadows' menu said the pier's surf). */
        for (let i = 0; i < 40 && !(await ev(`(document.querySelector('.pill-venue__name')?.textContent ?? '').includes(${JSON.stringify(spot.name)})`)); i += 1) await wait(250)
        await wait(1500)
        take('map', await read('map', '.chips2'))
        await menuOn(page)
        take('menu', await read('menu', 'nav[aria-label="Stage"]'))
        await tap('.mcard--today')
        await wait(1500)
        take('home', await read('home', '.home__page[aria-label="Today"]'))
        await page.screenshot({ path: join(OUT, `home-${spot.key}-${time.key}.png`) })
        if (spot.coast) {
          if (await tap('.home__page[aria-label="Today"] .hcard--surf')) take('surf', await read('surf', '.dpage--surf'))
          if (await tap('.dpage__tab:has-text("Tide")')) take('tide', await read('tide', '.dpage--tide'))
          if (await tap('.dpage__tab:has-text("Wind")')) take('wind', await read('wind', '.dpage--wind'))
          await tap('.dpage__back')
          await wait(800)
        } else if (await tap('.home__page[aria-label="Today"] .hcard--wind')) {
          take('wind', await read('wind', '.dpage--wind'))
          await tap('.dpage__back')
          await wait(800)
        }
        /* about:blank first: the same address with a hash is not a reload. */
        await page.goto('about:blank')
        await page.goto(url)
        await wait(3000)
        await goToStage(ev, wait, 'plan')
        await menuOn(page)
        await wait(600)
        await tap('nav[aria-label="Stage"] .mcard--weather')
        take('weather', await read('weather', '.wpage'))
        await tap('.wpage .ppage__back')
        await wait(800)
        await menuOn(page)
        await wait(600)
        await tap('nav[aria-label="Stage"] .mcard--sky')
        take('sky', await read('sky', '.spage'))
        await page.getByRole('button', { name: /Color detail/ }).first().click({ timeout: 4000, noWaitAfter: true }).catch(() => fail(`${spot.name} ${time.key}: no Color detail on the Sky page`))
        take('detail', await read('detail', '.fire'))
      } catch (error) {
        fail(`${spot.name} ${time.key}: ABORTED: ${error instanceof Error ? error.message : String(error)}`)
      }
      /* Each shared value: one answer across every screen that shows it. */
      const keys = new Set(Object.values(seen).flatMap((v) => Object.keys(v)))
      for (const k of keys) {
        const by = Object.entries(seen).flatMap(([screen, v]) => (v[k] ?? []).map((x) => ({ screen, x })))
        const distinct = [...new Set(by.map((b) => b.x))]
        console.log(`  ${k}: ${by.map((b) => `${b.screen} "${b.x}"`).join(' · ')}`)
        if (distinct.length > 1) {
          /*
           * READ AGAIN, 20 s ON (Batch QA, Section 3). Each screen is read as
           * soon as it has its values; a screen still mid-retry (the sea's
           * facing asked again at 5 s and 20 s) can be read before the other.
           * A difference still there 20 s later fails; one that settled is
           * said, with both readings, never dropped.
           */
          const again = {}
          await page.goto('about:blank')
          await page.goto(url)
          await wait(20_000)
          await goToStage(ev, wait, 'plan')
          for (let i = 0; i < 40 && !(await ev(`(document.querySelector('.pill-venue__name')?.textContent ?? '').includes(${JSON.stringify(spot.name)})`)); i += 1) await wait(250)
          await menuOn(page)
          await wait(3000)
          again.menu = JSON.parse(await ev(READ('nav[aria-label="Stage"]')))?.[k] ?? []
          await tap('.mcard--today')
          await wait(3000)
          again.home = JSON.parse(await ev(READ('.home__page[aria-label="Today"]')))?.[k] ?? []
          const still = [...new Set([...again.menu, ...again.home])]
          if (still.length > 1) fail(`${spot.name} ${time.key}: ${k} differs, and still 20 s on: ${by.map((b) => `${b.screen} "${b.x}"`).join(', ')}; again menu ${JSON.stringify(again.menu)}, home ${JSON.stringify(again.home)}`)
          else console.log(`  NOTE ${spot.name} ${time.key}: ${k} differed on the first read (${by.map((b) => `${b.screen} "${b.x}"`).join(', ')}) and agreed 20 s on: ${JSON.stringify(again)}`)
        }
      }
      runs += 1
      watchdog.note(`${spot.key} ${time.key}`)
      await ctx.close()
    }
  }
} catch (error) {
  fail(`ABORTED: ${error instanceof Error ? error.message : String(error)}`)
} finally {
  await browser.close()
  watchdog.stop()
}
if (runs < SPOTS.length * TIMES.length) fail(`only ${runs} of ${SPOTS.length * TIMES.length} spot and time runs finished`)

/*
 * FIVE SPOTS, QUICKLY (Batch QA, Section 3). The map's pill, the picker, a
 * pick, 0.6 s, the next: five times. Then every screen's own place label says
 * the last one, and none says one before it.
 */
{
  const ROUTE = ['1st Street', 'Avalon Pier', "Jennette's Pier", 'Sandbridge', '1st Street Jetty']
  const last = ROUTE[ROUTE.length - 1]
  const before = ROUTE.slice(0, -1)
  console.log(`\n### five spots quickly: ${ROUTE.join(' › ')}`)
  const b2 = await webkit.launch()
  try {
    const ctx = await b2.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } })
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem('scoutngo.landing.v1', 'true')
        /* Answered already: on a fresh phone a pick asks "What do you do outside?" over the home, as it should. */
        localStorage.setItem('scoutngo.activities.v1', JSON.stringify(['surf', 'shoot', 'fish', 'weather']))
      } catch {
        /* about:blank */
      }
    })
    const page = await ctx.newPage()
    await page.clock.setFixedTime(new Date('2026-11-02T15:30:00Z'))
    const wait = (ms) => page.waitForTimeout(ms)
    const ev = (x) => page.evaluate(x)
    const tap = (sel) => page.locator(sel).first().click({ timeout: 5000, noWaitAfter: true }).then(() => true, () => false)
    await page.goto(await linkFor(SPOTS[0]))
    await wait(3500)
    await goToStage(ev, wait, 'plan')
    await wait(1500)
    for (const name of ROUTE) {
      /* A pick opens the home: its spot is the switch there, the map's pill on the map. */
      const onHome = await ev(`!!document.querySelector('.home')`)
      if (!(await tap(onHome ? '.home__spot' : 'button.pill-venue'))) fail(`no spot switch on screen to switch to ${name}`)
      await wait(400)
      await page.locator('.spick__search').fill(name).catch(() => fail(`no search in the spot picker for ${name}`))
      await wait(400)
      const row = page.locator('.spick__row', { has: page.locator('.spick__name', { hasText: name }) }).first()
      if (!(await row.click({ timeout: 4000, noWaitAfter: true }).then(() => true, () => false))) fail(`the picker found no ${name}`)
      await wait(600)
    }
    await wait(3000)
    const labels = {}
    await tap('.home .hbtn--round[aria-label="Open the map"]')
    await wait(1500)
    labels.map = await ev(`document.querySelector('.pill-venue__name')?.textContent ?? null`)
    await menuOn(page)
    await wait(800)
    labels.menu = await ev(`document.querySelector('.menu__spot .menu__title')?.textContent ?? null`)
    await tap('.mcard--today')
    await wait(2500)
    labels.home = await ev(`document.querySelector('.home__spotname')?.textContent ?? null`)
    await tap('.home__page[aria-label="Today"] .hcard--surf')
    await wait(2500)
    labels.surf = await ev(`document.querySelector('.dpage--surf .dsurf__place')?.textContent ?? null`)
    console.log(`  ${JSON.stringify(labels)}`)
    for (const [screen, text] of Object.entries(labels)) {
      if (text === null) fail(`after five spots: no place label on the ${screen}`)
      else {
        if (!text.includes(last)) fail(`after five spots: the ${screen} says "${text}", not ${last}`)
        for (const old of before) if (text.includes(old) && !last.includes(old)) fail(`after five spots: the ${screen} still says ${old} ("${text}")`)
      }
    }
    await ctx.close()
  } catch (error) {
    fail(`five spots: ABORTED: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    await b2.close()
  }
}
console.log(`\n=== ONE NUMBER PROBLEMS: ${problems} ===`)
process.exit(problems === 0 ? 0 : 1)
