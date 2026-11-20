/*
 * PLAN A SHOOT NEVER OPENS BY ITSELF (Batch SIMPLE-2, Section 0).
 *
 * Usage:  node scripts/audit-planner.mjs [screenshot-dir]
 *
 * After SIMPLE-1 Jwilly still saw the planner on the map. Walked in WebKit as
 * an iPhone 13 (docs/batches/simple2-decisions.md, Section 0), three paths
 * leaked it:
 *
 *   - a first run with no place started in setup; the spot picked from
 *     "Where do you go?" put the home over it, and any way off the home but
 *     its Map button (Escape, ☰ › Weather › Back) uncovered the Setup wizard;
 *   - /setup, /kit and /saved opened it from an address;
 *   - the map's sheet raised by its handle, or left up when a card closed,
 *     showed the shoot card ("0 positions · Suggest · BOTH GROUND AIR").
 *
 * This opens the map those ways and more, and at each one asserts it IS on
 * the map (the shell's plan, no home, the map's canvas over 60% of the screen
 * and the middle of the screen on the map: docs/failure-modes.md, a positive
 * identity, not the absence of a name) and that no planner is on screen: no
 * setup screen, no shoot card, no Suggest. Then it asks for the planner the
 * two ways a person can and requires it to be there, so the check is seen
 * to find it (B: a check that cannot fail).
 *
 * Exits 0 clean, 1 on a problem, 2 when it could not look (too few ways
 * examined, or the planner it asked for could not be found).
 */
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { webkit, devices } from './gate/playwright.mjs'
import { ensureApp, guardAudit, startWatchdog, APP_ORIGIN } from './preflight.mjs'

guardAudit('planner')
const watchdog = startWatchdog('planner', 420_000)
const OUT = process.argv[2] ?? join(process.env.SCOUTNGO_OUT ?? tmpdir(), 'planner')
mkdirSync(OUT, { recursive: true })
await ensureApp()

const PIER = { lat: 36.8435575, lon: -75.9713104 }
const WANT_WAYS = 18
let problems = 0
let looked = 0
let couldNot = 0
const fail = (why) => {
  console.log('      PROBLEM: ' + why)
  problems += 1
}

const STATE = `JSON.stringify((() => {
  const vis = (e) => {
    if (!e) return false
    const r = e.getBoundingClientRect()
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && !e.closest('[hidden]') && getComputedStyle(e).visibility !== 'hidden'
  }
  const area = (e) => {
    const r = e.getBoundingClientRect()
    return (Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0))) / (innerWidth * innerHeight)
  }
  const canvases = [...document.querySelectorAll('canvas.maplibregl-canvas')].filter(vis)
  const hit = document.elementFromPoint(innerWidth / 2, innerHeight * 0.4)
  return {
    shell: document.querySelector('.shell')?.className.match(/shell--([a-z]+)/)?.[1] ?? null,
    home: vis(document.querySelector('.home')),
    mapShare: Math.round(canvases.reduce((a, c) => Math.max(a, area(c)), 0) * 100) / 100,
    middleOnMap: !!hit?.closest('.maplibregl-map'),
    setup: vis(document.querySelector('.mode-setup')),
    shootCard: vis(document.querySelector('.shootc')),
    suggest: [...document.querySelectorAll('button')].some((b) => vis(b) && /^Suggest$/.test((b.textContent ?? '').trim())),
    card: document.querySelector('.sheet [data-card]')?.getAttribute('data-card') ?? null,
    detent: document.querySelector('.sheet')?.dataset.detent ?? null,
  }
})())`

const browser = await webkit.launch()
async function context({ lastSetup = true, spots = null } = {}) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } })
  await ctx.addInitScript(([at, lastSetup, spots]) => {
    try {
      /* Seeded once per context: a reload keeps what the app wrote since. */
      if (sessionStorage.getItem('audit.planner') === null) {
        sessionStorage.setItem('audit.planner', '1')
        localStorage.setItem('scoutngo.landing.v1', 'true')
        localStorage.setItem('scoutngo.nearMe.v1', 'off')
        localStorage.setItem('scoutngo.activities.v1', JSON.stringify(['shoot', 'drone', 'surf']))
        if (lastSetup) localStorage.setItem('scoutngo.lastSetup.v1', JSON.stringify({ at, name: { key: 'x', name: 'Virginia Beach Fishing Pier' }, shootKind: 'sunset', platform: 'both', reachMeters: 2000 }))
        else localStorage.removeItem('scoutngo.lastSetup.v1')
        if (spots !== null) localStorage.setItem('scoutngo.spots.v1', spots)
      }
    } catch {
      /* about:blank */
    }
    /* A person, not a driver: the home opens on a bare front door (src/lib/briefingOpen.ts). */
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false })
  }, [PIER, lastSetup, spots])
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date('2026-11-19T19:00:00Z') })
  await page.clock.resume()
  const wait = (ms) => page.waitForTimeout(ms)
  const ev = (x) => page.evaluate(x)
  const tap = async (locator, what) => {
    try {
      await locator.first().click({ timeout: 6000 })
      return true
    } catch {
      fail(`could not tap ${what}`)
      couldNot += 1
      await page.screenshot({ path: join(OUT, `could-not-${what.replace(/\W+/g, '-').slice(0, 40)}.png`) }).catch(() => {})
      return false
    }
  }
  const front = async (path = '/') => {
    await page.goto(`${APP_ORIGIN}${path}`)
    /* Up to 20 s: under the gate's load a cold WebKit draws the home late. */
    for (let i = 0; i < 50 && !(await ev(`!!document.querySelector('.home button[aria-label="Menu"]')`)); i += 1) await wait(400)
    await wait(800)
  }
  const menu = () => tap(page.locator('button[aria-label="Menu"]:visible'), 'the Menu button')
  const back = () => tap(page.locator('button[aria-label="Back"]:visible'), 'Back')
  const state = async () => JSON.parse(await ev(STATE))
  const shot = (name) => page.screenshot({ path: join(OUT, `${String(looked).padStart(2, '0')}-${name.replace(/\W+/g, '-').slice(0, 60)}.png`) })

  /* On the map, positively, and no planner on it. */
  /* sheetUp: the sheet raised over the middle of the screen, so the middle is the sheet; the shell and the canvas still say map. */
  const onMap = async (way, { sheetUp = false } = {}) => {
    let s = await state()
    for (let i = 0; i < 20 && !(s.shell === 'plan' && !s.home && s.mapShare > 0.6 && (sheetUp || s.middleOnMap)); i += 1) {
      await wait(300)
      s = await state()
    }
    await wait(900)
    s = await state()
    looked += 1
    await shot(way)
    console.log(`  ${way}: ${JSON.stringify(s)}`)
    if (s.shell !== 'plan' || s.home) fail(`${way}: not on the map (shell ${s.shell}${s.home ? ', the home over it' : ''})`)
    else if (!(s.mapShare > 0.6)) fail(`${way}: the map's canvas covers ${Math.round(s.mapShare * 100)}% of the screen, not over 60%`)
    else if (!sheetUp && !s.middleOnMap) fail(`${way}: the middle of the screen is not the map`)
    if (s.setup) fail(`${way}: the planner (the Setup wizard) is on screen`)
    if (s.shootCard || s.suggest) fail(`${way}: the planner's shoot card is on the map (${s.card} at ${s.detent})`)
    return s
  }
  return { ctx, page, wait, ev, tap, front, menu, back, state, onMap, shot }
}

try {
  console.log('\n### a returning phone: the home, then the map')
  {
    const a = await context()
    const { page, front, menu, back, tap, onMap, wait, state, ev } = a
    await front()
    if (await tap(page.getByRole('button', { name: /^open the map$/i }), "the home's Map button")) await onMap("home's Map button")

    /* The sheet raised by its handle, at both stops above the time bar. */
    if (await tap(page.locator('.sheet__handle'), 'the sheet handle')) {
      await wait(800)
      await onMap('map, sheet raised by its handle', { sheetUp: true })
      if (await tap(page.locator('.sheet__handle'), 'the sheet handle')) {
        await wait(800)
        await onMap('map, sheet raised to the top', { sheetUp: true })
      }
    }
    /* A card closed with the sheet up: it used to fall back to the shoot card. */
    if ((await state()).detent === 'peek') await tap(page.locator('.sheet__handle'), 'the sheet handle')
    await wait(600)
    /* The raised sheet's own card has a × only when it is a card (the map's); the old shoot card had none, and that was already looked at above. */
    const x = page.locator('button[aria-label="Back to the shoot"]:visible')
    if ((await x.count()) > 0 && (await tap(x, "the sheet card's ×"))) await onMap("map, a card's × with the sheet up")
    else console.log("  (no card × on the raised sheet: the ways above already looked at it)")

    await front()
    await page.keyboard.press('Escape')
    await onMap('home, Escape')

    await front()
    if (await menu()) {
      await wait(500)
      if (await tap(page.locator('.mcard', { hasText: 'Weather' }), 'Menu › Weather')) {
        await wait(1200)
        if (await back()) await onMap('home › ☰ › Weather › Back')
      }
    }
    await front()
    if (await menu()) {
      await wait(500)
      if (await tap(page.locator('.mcard', { hasText: 'Drone' }), 'Menu › Drone')) {
        await wait(1200)
        if (await back()) await onMap('home › ☰ › Drone › Back')
      }
    }

    /* A search pick, from the map's place pill. */
    if (await tap(page.locator('button.pill-venue'), 'the place pill')) {
      await wait(800)
      await page.locator('.spick__search').fill('Croatan')
      await wait(1500)
      if (await tap(page.locator('.spick button', { hasText: 'Croatan' }), 'the Croatan result')) {
        await wait(1500)
        if (await ev(`!!document.querySelector('.home')`)) await page.keyboard.press('Escape')
        await onMap('search pick, then off the home')
      }
    }

    /* Addresses, and a reload on the map. */
    for (const path of ['/?from=link', '/#x', '/setup', '/kit', '/saved']) {
      await page.goto(`${APP_ORIGIN}${path}`)
      await wait(2500)
      await onMap(`the address ${path}`)
    }
    await page.goto(`${APP_ORIGIN}/?from=link`)
    await wait(2000)
    await page.reload()
    await wait(2500)
    await onMap('reload on the map')

    /* The Viewfinder, closed, then off the home. */
    await front()
    if (await tap(page.getByRole('button', { name: /viewfinder/i }), "the home's Viewfinder")) {
      await wait(1500)
      await tap(page.locator('button[aria-label="Close the viewfinder"], .vf button:has-text("Not now"), .vf button:has-text("Close")'), 'close the Viewfinder')
      await wait(800)
      if (await ev(`!!document.querySelector('.home')`)) await page.keyboard.press('Escape')
      await onMap('Viewfinder closed, then off the home')
    }

    /* The drone's 3D flight plan, its card closed, back to 2D. */
    await front()
    if (await tap(page.locator('.home button', { hasText: /^Drone/ }), "the home's Drone card")) {
      await wait(1500)
      /* Plan the flight sits under Preflight (Settings › Labs on: scripts/gate/playwright.mjs). */
      await tap(page.locator('button[role="tab"]', { hasText: /^Preflight$/ }), "the Drone page's Preflight tab")
      await wait(800)
      if (await tap(page.locator('button.drp__fly'), "the Drone page's Plan the flight")) {
        await wait(3000)
        /* It flies. Out the way a pilot goes: Land, Land again to confirm, the Preflight card's ×, back to 2D (each when it is there). */
        if (await tap(page.locator('button.fly__land'), "Fly's Land")) {
          await wait(500)
          await tap(page.locator('.fly__confirm button', { hasText: /^Land$/ }), "Fly's Land, confirmed")
          await wait(2000)
          for (const out of [page.locator('button[aria-label="Back to the shoot"]:visible'), page.locator('button[aria-label="Back to the 2D map"]:visible, button:has-text("Back to 2D"):visible')]) {
            if ((await out.count()) > 0) {
              await out.first().click()
              await wait(1500)
            }
          }
          await onMap('Drone › Plan the flight (Fly) › Land › out')
        }
      }
    }

    /* The planner, asked for: it must be there, and the home over it spends it. */
    console.log('\n### asked for: Menu › Plan a shoot')
    await front()
    if (await menu()) {
      await wait(500)
      if (await tap(page.locator('.mrow', { hasText: 'Plan a shoot' }), 'Menu › Plan a shoot')) {
        await wait(1500)
        const s = await state()
        looked += 1
        await a.shot('asked, Menu › Plan a shoot')
        console.log(`  Menu › Plan a shoot: ${JSON.stringify(s)}`)
        if (!s.setup) {
          console.log('=== PLANNER AUDIT ABORTED: Menu › Plan a shoot did not open the planner, so this audit cannot tell a planner from none ===')
          process.exit(2)
        }
        if (await tap(page.getByRole('button', { name: /^same as last time$/i }), "the planner's Same as last time")) {
          await wait(1200)
          if ((await state()).detent === 'peek') await tap(page.locator('.sheet__handle'), 'the sheet handle')
          await wait(800)
          const asked = await state()
          looked += 1
          await a.shot('asked, the shoot card after setup')
          console.log(`  asked, after Same as last time: ${JSON.stringify(asked)}`)
          if (!asked.shootCard) {
            console.log("=== PLANNER AUDIT ABORTED: the planner's shoot card is not on the map after it was asked for, so its absence elsewhere proves nothing ===")
            process.exit(2)
          }
          /* The home over the planner, then off it: the map, the ask spent. */
          await front()
          await page.keyboard.press('Escape')
          await onMap('asked, then the home, then Escape')
        }
      }
    }
    await a.ctx.close()
  }

  console.log('\n### an old phone: the landing seen, no last setup kept, a spot saved')
  {
    const spots = JSON.stringify([{ id: 's1', name: 'Croatan', venue: { name: null, latitude: '36.8170', longitude: '-75.9730', date: '2026-11-19', startTime: '16:00', endTime: '17:30', eventDescription: '', desiredOutcome: '', laanc: false, laancCeilingFeet: '', subjectAcrossMeters: '' }, positions: [], marks: [] }])
    const a = await context({ lastSetup: false, spots })
    const { page, tap, wait, ev, menu, back, onMap } = a
    await page.goto(`${APP_ORIGIN}/`)
    await wait(2500)
    if (await ev(`!!document.querySelector('.spick__search')`)) {
      await page.locator('.spick__search').fill('Croatan')
      await wait(1500)
      if (await tap(page.locator('.spick button', { hasText: 'Croatan' }), 'the Croatan spot')) {
        await wait(1500)
        await page.keyboard.press('Escape')
        await onMap('first run, a spot picked, then Escape')
        /* To the home: the map's Back; the old build left the Setup wizard here instead, whose own Menu goes on below. */
        const toHome = page.locator('.topbar__back:visible')
        if ((await toHome.count()) > 0) await toHome.first().click()
        await wait(1200)
        if (await menu()) {
          await wait(500)
          if (await tap(page.locator('.mcard', { hasText: 'Weather' }), 'Menu › Weather')) {
            await wait(1200)
            if (await back()) await onMap('first run › home › ☰ › Weather › Back')
          }
        }
      }
    } else {
      fail('no "Where do you go?" picker on a first run with no place')
      couldNot += 1
    }
    await a.ctx.close()
  }
  watchdog.note('planner')
} finally {
  await browser.close()
}
watchdog.stop()
if (looked < WANT_WAYS || couldNot > 0) {
  console.log(`=== PLANNER AUDIT ABORTED: ${looked} of ${WANT_WAYS} ways looked at, ${couldNot} taps that could not be made ===`)
  process.exit(2)
}
console.log(`  screenshots: ${OUT}`)
console.log(`\n=== PLANNER PROBLEMS: ${problems} ===`)
process.exit(problems === 0 ? 0 : 1)
