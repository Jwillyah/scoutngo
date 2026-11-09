/*
 * THE HOME (Batch M, Section 3; it replaced the Today briefing), ON AN
 * IPHONE AND AN ANDROID PHONE, AS A BROWSER TAB AND FROM THE HOME SCREEN.
 *
 * Usage:  node scripts/audit-briefing.mjs [screenshot-dir]
 *
 * The Virginia Beach pier at 6:11 AM EST on 2 Nov, a drone in the kit, every
 * weather host answered by the gate's fixtures (a calm day). Opened from the
 * menu's Today card.
 *
 *   each page   Today, Tomorrow, Week: fits 390 x 844 (WebKit, tab and
 *               home screen) and 412 x 915 (Chromium, tab and installed)
 *               with nothing scrolled, nothing below the screen, nothing off
 *               its side
 *   Today       the weather first: a temperature, the sky in a word, H and
 *               L, wind, a rain line; six hourly steps; the best windows
 *               (rows, or the honest "Nothing standout" line); four cards
 *               in a grid (boards Home8S / Home8J);
 *               one primary button, a round Map and a round Menu
 *   Tomorrow    the same, and no large empty gap under its cards (8 Nov:
 *               the old Today had one under the conditions card)
 *   Week        a headline, seven days, days 4-7 marked as guesses
 *   words       never "safe", never "clear to", never a red ground
 *   Menu        the round Menu opens the menu over the home
 *   short tab   390 x 664 (a Safari tab): fits too (Batch N C5)
 *   first run   a bare launch with no spot: "Where do you go?", spots
 *               near the location once, one tap to the home (Batch I);
 *               then "What do you do outside?" (Batch M): Fish or boat
 *               puts Wind and Tide first and takes the Viewfinder off the
 *               menu
 */
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, webkit, devices } from './gate/playwright.mjs'
import { ensureApp, findChrome, goToStage, guardAudit, startWatchdog, APP_ORIGIN } from './preflight.mjs'
import { shareLink } from '../src/lib/planShare.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'
import { placeKey } from '../src/core/venueName.ts'

guardAudit('briefing')
const watchdog = startWatchdog('briefing', 420_000)
const OUT = process.argv[2] ?? join(process.env.SCOUTNGO_OUT ?? tmpdir(), 'briefing')
mkdirSync(OUT, { recursive: true })

const PIER = { lat: 36.8435575, lon: -75.9713104 }
await ensureApp()
const venue = { ...CALIBRATION_VENUE, name: { key: placeKey(String(PIER.lat), String(PIER.lon)), name: 'Virginia Beach Fishing Pier' }, latitude: String(PIER.lat), longitude: String(PIER.lon), date: '2026-11-02', startTime: '06:00', endTime: '08:00' }
const url = await shareLink(`${APP_ORIGIN}/`, { id: 'brief', name: 'Briefing check', savedAt: '2026-10-29T00:00:00Z', venue, kit: { bodyIds: [], lensIds: [], droneIds: ['dji-air-3s'], styleNotes: '' }, positions: [] })

let problems = 0
let looked = 0
const fail = (why) => {
  console.log('      PROBLEM: ' + why)
  problems += 1
}

/** One page of the home: what runs off the screen or its side, whether it scrolls, its text, and the gap under its last element. */
const FIT = (i) => `JSON.stringify((() => {
  const pg = document.querySelectorAll('.home__page')[${i}]
  if (!pg) return { missing: true }
  const r = pg.getBoundingClientRect()
  const out = [...pg.querySelectorAll('*')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && (b.bottom > innerHeight + 1 || b.right > r.right + 1 || b.left < r.left - 1) }).map((e) => (e.getAttribute('class') ?? e.tagName) + ' ' + Math.round(e.getBoundingClientRect().bottom)).slice(0, 4)
  const side = [...pg.querySelectorAll('*')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && (b.right > r.right + 1 || b.left < r.left - 1) }).map((e) => e.getAttribute('class') ?? e.tagName).slice(0, 4)
  const foot = document.querySelector('.home__foot')?.getBoundingClientRect().top ?? innerHeight
  const kids = [...(pg.firstElementChild?.children ?? [])].filter((e) => e.getBoundingClientRect().height > 0)
  const last = kids.length === 0 ? r.top : Math.max(...kids.map((e) => e.getBoundingClientRect().bottom))
  return { out, side, scrolls: pg.scrollHeight > pg.clientHeight + 1, text: pg.innerText, gap: Math.round(foot - last), content: Math.round(pg.scrollHeight), box: Math.round(pg.clientHeight) }
})())`

const LOOKS = [
  ['iPhone tab', 'webkit', { width: 390, height: 844 }, { top: 0, bottom: 0 }, true],
  ['iPhone home screen', 'webkit', { width: 390, height: 844 }, { top: 47, bottom: 34 }, true],
  ['Android tab', 'chromium', { width: 412, height: 915 }, { top: 0, bottom: 0 }, true],
  ['Android installed', 'chromium', { width: 412, height: 915 }, { top: 24, bottom: 0 }, true],
  /* Batch N C5: the short Safari tab must fit too. */
  ['short tab', 'webkit', { width: 390, height: 664 }, { top: 0, bottom: 0 }, true],
]
const browsers = {}
try {
  for (const [label, engine, viewport, insets, mustFit] of LOOKS) {
    console.log(`\n### ${label}`)
    browsers[engine] ??= engine === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: findChrome() })
    const ctx = await browsers[engine].newContext({ ...(engine === 'webkit' ? devices['iPhone 13'] : devices['Pixel 7']), viewport })
    await ctx.addInitScript(([top, bottom]) => {
      try {
        localStorage.setItem('scoutngo.landing.v1', 'true')
      } catch {
        /* about:blank */
      }
      const add = () => {
        const s = document.createElement('style')
        s.textContent = `:root{--safe-top:${top}px!important;--safe-bottom:${bottom}px!important}`
        document.head.appendChild(s)
      }
      if (document.head) add()
      else document.addEventListener('DOMContentLoaded', add)
    }, [insets.top, insets.bottom])
    const page = await ctx.newPage()
    await page.clock.install({ time: new Date('2026-11-02T11:11:00Z') })
    await page.clock.resume()
    const wait = (ms) => page.waitForTimeout(ms)
    const ev = (x) => page.evaluate(x)
    await page.goto(url)
    await wait(3500)
    await page.getByRole('button', { name: /^open$/i }).click({ timeout: 4000 }).catch(() => {})
    await goToStage(ev, wait, 'plan')
    await wait(2500)
    if (await ev(`!!document.querySelector('.home')`)) fail(`${label}: the home opened by itself on a shared plan's link`)
    await page.locator('button[aria-label="Menu"]').first().click()
    await wait(700)
    await page.locator('.mcard--today').first().click()
    await wait(6000)
    if (!(await ev(`!!document.querySelector('.home')`))) {
      fail(`${label}: Menu › Today opened no home`)
      await ctx.close()
      continue
    }
    looked += 1
    for (const [i, name] of ['Today', 'Tomorrow', 'Week'].entries()) {
      await page.getByRole('tab', { name, exact: true }).click()
      await wait(1200)
      const t = JSON.parse(await ev(FIT(i)))
      if (t.missing) {
        fail(`${label}: no ${name} page`)
        continue
      }
      console.log(`  ${name}: ${t.content}/${t.box} px, gap under it ${t.gap} px, ${t.out.length === 0 && !t.scrolls ? 'fits' : `DOES NOT FIT ${JSON.stringify(t.out)}${t.scrolls ? ' (scrolls)' : ''}`}`)
      if (mustFit && t.scrolls) fail(`${label}, ${name}: the page scrolls (${t.content} of ${t.box} px)`)
      if (mustFit) for (const o of t.out) fail(`${label}, ${name}: ${o} runs off the screen`)
      for (const o of t.side) fail(`${label}, ${name}: ${o} runs off the side`)
      if (/\bsafe\b|clear to fly|all clear/i.test(t.text)) fail(`${label}, ${name}: says safe or clear: ${JSON.stringify(t.text.slice(0, 120))}`)
      if (mustFit && name === 'Tomorrow' && t.gap > 200) fail(`${label}: a ${t.gap} px empty gap under Tomorrow's cards`)
      await page.screenshot({ path: join(OUT, `home-${name.toLowerCase()}-${label.replace(/\s/g, '-').toLowerCase()}.png`) })
      if (i <= 1) {
        const d = JSON.parse(await ev(`JSON.stringify((() => { const pg = document.querySelectorAll('.home__page')[${i}]; return { temp: pg.querySelector('.hwx__temp')?.textContent ?? '', cond: pg.querySelector('.hwx__cond')?.textContent ?? '', lines: [...pg.querySelectorAll('.hwx__line')].map((e) => e.textContent), steps: pg.querySelectorAll('.hstrip__step').length, best: pg.querySelector('.hbest')?.innerText ?? null, cards: [...pg.querySelectorAll('.hcard__title')].map((e) => e.textContent) } })())`))
        console.log(`  ${name}: ${JSON.stringify(d).slice(0, 300)}`)
        if (!/^-?\d+°$/.test(d.temp)) fail(`${label}, ${name}: the big temperature reads ${JSON.stringify(d.temp)}`)
        if (d.cond.trim() === '' || d.cond.trim() === '—') fail(`${label}, ${name}: no sky word`)
        /* Board Home8S: "H 66° · L 50° · NW 5 kt" on one line. */
        if (!d.lines.some((l) => /^H .* · L .* · .*(kt|mph|km\/h|m\/s)$/.test(l))) fail(`${label}, ${name}: no high, low and wind line (${JSON.stringify(d.lines)})`)
        if (!d.lines.some((l) => /rain/i.test(l))) fail(`${label}, ${name}: no rain line`)
        if (d.steps !== 6) fail(`${label}, ${name}: ${d.steps} hourly steps, not 6`)
        if (d.best === null || !/Best windows/i.test(d.best) || d.best.split('\n').length < 2) fail(`${label}, ${name}: no best windows card, or an empty one`)
        /* Four cards (boards Home8S / Home8J); nothing picked yet: Surf, Wind, Tide, Sunset; after sunset Sunset reads Sunrise. */
        if (d.cards.length !== 4) fail(`${label}, ${name}: ${d.cards.length} cards, not 4`)
        if (d.cards.slice(0, 2).join('|') !== 'Surf|Wind') fail(`${label}, ${name}: the cards lead with ${JSON.stringify(d.cards.slice(0, 2))}`)
      } else {
        const w = JSON.parse(await ev(`JSON.stringify({ head: document.querySelector('.hweek__head')?.textContent ?? null, days: document.querySelectorAll('.hweek__row').length, guesses: document.querySelectorAll('.hweek__row--guess').length })`))
        console.log(`  week: ${JSON.stringify(w)}`)
        if (w.head === null || w.head === '') fail(`${label}: no week headline`)
        if (w.days !== 7) fail(`${label}: ${w.days} days in the week`)
        if (w.guesses !== 4) fail(`${label}: ${w.guesses} days marked as guesses, not days 4-7`)
      }
    }
    const buttons = JSON.parse(await ev(`JSON.stringify({ main: document.querySelector('.home .hbtn--main')?.textContent?.trim() ?? null, round: [...document.querySelectorAll('.home .hbtn--round')].map((b) => b.getAttribute('aria-label')) })`))
    console.log(`  buttons: ${JSON.stringify(buttons)}`)
    if (!/^(Radar|Viewfinder|Preflight)$/.test(buttons.main ?? '')) fail(`${label}: the primary button reads ${JSON.stringify(buttons.main)}`)
    if (buttons.round.join('|') !== 'Open the map|Menu') fail(`${label}: the round buttons are ${JSON.stringify(buttons.round)}`)
    const ground = await ev(`getComputedStyle(document.querySelector('.home')).backgroundImage`)
    if (/255,\s*59,\s*48|#ff3b30/i.test(ground)) fail(`${label}: the ground is the hazard red`)
    await page.locator('.home .hbtn--round[aria-label="Menu"]').click()
    await wait(700)
    const menu = await ev(`(() => { const m = document.querySelector('.menu'); return m !== null && getComputedStyle(m).visibility !== 'hidden' && m.getBoundingClientRect().width > 0 })()`)
    if (!menu) fail(`${label}: the round Menu opened no menu`)
    await page.keyboard.press('Escape')
    await wait(500)

    /*
     * FIRST RUN, NO SETUP (Batch I, Section 1): a bare launch with no spot
     * asks where; the location once offers known spots near it; one tap
     * opens the home for that spot. No map, no pin.
     */
    if (label === 'short tab') {
      await ctx.grantPermissions(['geolocation'])
      await ctx.setGeolocation({ latitude: 36.8441, longitude: -75.9752 })
      await ev(`(() => { localStorage.clear(); localStorage.setItem('scoutngo.landing.v1', 'true') })()`)
      await page.goto(`${APP_ORIGIN}/`)
      await wait(3500)
      const asked = await ev(`document.querySelector('.spick__title')?.textContent ?? null`)
      console.log(`  first run: ${asked}`)
      if (asked !== 'Where do you go?') fail(`a bare first launch did not ask where you go (${JSON.stringify(asked)})`)
      await page.getByRole('button', { name: 'Use my location once' }).click().catch(() => {})
      await wait(2500)
      const rows = await ev(`[...document.querySelectorAll('.spick__row .spick__name')].map((e) => e.textContent)`)
      console.log(`  spots near: ${JSON.stringify(rows)}`)
      if (!Array.isArray(rows) || rows.length === 0) fail('no known spots offered near the location')
      await page.locator('.spick__row').first().click().catch(() => {})
      await wait(5000)
      const opened = await ev(`document.querySelector('.home__spotname')?.textContent ?? null`)
      console.log(`  then the home: ${opened}`)
      if (opened === null) fail('picking a spot did not open the home')
      /*
       * WHAT DO YOU DO OUTSIDE? (Batch M, Section 2): asked once after the
       * spot. Fish or boat alone: the wind and the tide lead the cards, the
       * primary button is Radar, and the menu has no Viewfinder row; no card's
       * data is gone (all five still there, the drone with none in the kit).
       */
      const question = await ev(`document.querySelector('.actpick__title')?.textContent ?? null`)
      console.log(`  then: ${question}`)
      if (question !== 'What do you do outside?') fail(`no "What do you do outside?" after the first spot (${JSON.stringify(question)})`)
      await page.getByRole('button', { name: /Fish or boat/ }).click().catch(() => fail('no Fish or boat choice'))
      await page.getByRole('button', { name: 'Continue', exact: true }).click().catch(() => fail('no Continue'))
      await wait(1200)
      const kept = await ev(`localStorage.getItem('scoutngo.activities.v1')`)
      const after = JSON.parse(await ev(`JSON.stringify({ cards: [...document.querySelectorAll('.home__page')[0]?.querySelectorAll('.hcard__title') ?? []].map((e) => e.textContent), main: document.querySelector('.home .hbtn--main')?.textContent?.trim() ?? null, open: !!document.querySelector('.actpick--sheet') })`))
      console.log(`  picked Fish or boat: kept ${kept}, ${JSON.stringify(after)}`)
      if (kept !== '["fish"]') fail(`the pick was kept as ${JSON.stringify(kept)}`)
      if (after.open) fail('the picker stayed open after Done')
      if (after.cards.slice(0, 2).join('|') !== 'Wind|Tide') fail(`Fish or boat: the cards lead with ${JSON.stringify(after.cards.slice(0, 2))}, not Wind and Tide`)
      if (after.cards.length !== 4) fail(`Fish or boat: ${after.cards.length} cards, not 4 (the rest one tap deeper)`)
      if (after.main !== 'Radar') fail(`Fish or boat: the primary button is ${JSON.stringify(after.main)}`)
      await page.locator('.home .hbtn--round[aria-label="Menu"]').click()
      await wait(800)
      const vf = await ev(`[...document.querySelectorAll('.menu .menu__rows')].some((r) => /Viewfinder/.test(r.textContent))`)
      if (vf) fail('Fish or boat: the menu still offers the Viewfinder (a photo tool)')
      await page.keyboard.press('Escape')
    }
    await ctx.close()
    watchdog.note(label)
  }
} finally {
  for (const b of Object.values(browsers)) await b.close()
}
watchdog.stop()
if (looked === 0) {
  console.log('=== BRIEFING AUDIT ABORTED: nothing was looked at ===')
  process.exit(2)
}
console.log(`  screenshots: ${OUT}`)
console.log(`\n=== BRIEFING PROBLEMS: ${problems} ===`)
process.exit(problems === 0 ? 0 : 1)
