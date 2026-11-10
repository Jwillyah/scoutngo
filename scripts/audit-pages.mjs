/*
 * THE PAGES OF THEIR OWN (Batch Pages; boards WeatherPage, SkyPage), IN
 * WEBKIT AND CHROMIUM, every phone the home is checked on but the short tab.
 *
 * Usage:  node scripts/audit-pages.mjs [screenshot-dir]
 *
 * From the home, as a person would:
 *
 *   Weather   "Weather ›" opens it; one screen (nothing scrolls, nothing
 *             runs off); the temperature is the home's; six tiles, Wind ·
 *             Rain · UV · Humidity · Pressure · Cloud, each a value and a
 *             line; 7 days; the radar strip; "… models … ›" and "How we got
 *             this ›" at the foot; Back is the home again
 *
 *   Drone     the home's Drone card opens it (Batch Flow, Section 5): the
 *             wind at 400 ft and the drone's limit, the air from the
 *             ground to 400 ft, the best time to fly, Airspace · Battery ·
 *             GPS, Preflight and Fly it yourself
 *   Sky       the home's Sky card opens it; Sunset · Sunrise; "Color
 *             likely / possible / unlikely" and a reason; the three plain
 *             checks by name; Golden · Set · Blue · Dark with times; RARE
 *             LIGHT THIS WEEK (rows or its own "nothing" line), never the
 *             icon-only week grid; Viewfinder and Calendar ›; the map's
 *             Cloud chip opens it too, and the map has no Sky sheet tabs
 *
 * Nothing on a page says safe or clear (rule 28; ux-rules 12), except the
 * station's own "below 12,000 ft" cloud report, which is about cloud.
 */
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, webkit, devices } from './gate/playwright.mjs'
import { ensureApp, findChrome, goToStage, guardAudit, startWatchdog, APP_ORIGIN } from './preflight.mjs'
import { shareLink } from '../src/lib/planShare.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'
import { placeKey } from '../src/core/venueName.ts'

guardAudit('pages')
const watchdog = startWatchdog('pages', 420_000)
const OUT = process.argv[2] ?? join(process.env.SCOUTNGO_OUT ?? tmpdir(), 'pages')
mkdirSync(OUT, { recursive: true })

const PIER = { lat: 36.8435575, lon: -75.9713104 }
await ensureApp()
const venue = { ...CALIBRATION_VENUE, name: { key: placeKey(String(PIER.lat), String(PIER.lon)), name: 'Virginia Beach Fishing Pier' }, latitude: String(PIER.lat), longitude: String(PIER.lon), date: '2026-11-02', startTime: '06:00', endTime: '08:00' }
const url = await shareLink(`${APP_ORIGIN}/`, { id: 'pages', name: 'Pages check', savedAt: '2026-10-29T00:00:00Z', venue, kit: { bodyIds: [], lensIds: [], droneIds: ['dji-air-3s'], styleNotes: '' }, positions: [] })

let problems = 0
let looked = 0
const fail = (why) => {
  console.log('      PROBLEM: ' + why)
  problems += 1
}

/** The page on top: whether its body scrolls, what runs off the screen or its sides, its text. */
const FIT = (sel) => `JSON.stringify((() => {
  const pg = document.querySelector(${JSON.stringify(sel)})
  if (pg === null) return { missing: true }
  const body = pg.querySelector('.ppage__body')
  const out = [...pg.querySelectorAll('*')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && !e.closest('.rstrip__map') && (b.bottom > innerHeight + 1 || b.right > innerWidth + 1 || b.left < -1) }).map((e) => (e.getAttribute('class') ?? e.tagName) + ' ' + Math.round(e.getBoundingClientRect().bottom)).slice(0, 4)
  return { scrolls: body.scrollHeight > body.clientHeight + 1, content: body.scrollHeight, box: body.clientHeight, out, text: pg.innerText }
})())`

const LOOKS = [
  ['iPhone tab', 'webkit', { width: 390, height: 844 }, { top: 0, bottom: 0 }],
  ['iPhone home screen', 'webkit', { width: 390, height: 844 }, { top: 47, bottom: 34 }],
  ['Android tab', 'chromium', { width: 412, height: 915 }, { top: 0, bottom: 0 }],
  ['Android installed', 'chromium', { width: 412, height: 915 }, { top: 24, bottom: 0 }],
]
const browsers = {}
try {
  for (const [label, engine, viewport, insets] of LOOKS) {
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
    await page.clock.install({ time: new Date('2026-11-02T15:30:00Z') })
    await page.clock.resume()
    const wait = (ms) => page.waitForTimeout(ms)
    const ev = (x) => page.evaluate(x)
    await page.goto(url)
    await wait(3500)
    await page.getByRole('button', { name: /^open$/i }).click({ timeout: 4000 }).catch(() => {})
    await goToStage(ev, wait, 'plan')
    await wait(2500)
    await page.locator('button[aria-label="Menu"]').first().click()
    await wait(700)
    await page.locator('.mcard--today').first().click()
    await wait(6000)
    if (!(await ev(`!!document.querySelector('.home')`))) {
      fail(`${label}: Menu › Today opened no home`)
      await ctx.close()
      continue
    }
    const homeTemp = await ev(`document.querySelector('.home__page[aria-label="Today"] .hwx__temp')?.textContent ?? null`)

    /* ---------------------------------------------------------- Weather */
    const opened = await page.locator('.home__page[aria-label="Today"] .hwx__temp').first().click({ timeout: 4000 }).then(() => true, () => false)
    if (!opened) fail(`${label}: no "Weather ›" on the home`)
    await wait(5000)
    const w = JSON.parse(await ev(FIT('.wpage')))
    if (w.missing) fail(`${label}: "Weather ›" opened no Weather page`)
    else {
      looked += 1
      console.log(`  Weather: ${w.content}/${w.box} px, ${w.out.length === 0 && !w.scrolls ? 'fits' : `DOES NOT FIT ${JSON.stringify(w.out)}`}`)
      if (w.scrolls) fail(`${label}: the Weather page scrolls (${w.content} of ${w.box} px)`)
      for (const o of w.out) fail(`${label}: on the Weather page ${o} runs off the screen`)
      const d = JSON.parse(await ev(`JSON.stringify({ temp: document.querySelector('.wpage__temp')?.textContent ?? null, tiles: [...document.querySelectorAll('.wtile')].map((t) => [t.querySelector('.wtile__label')?.textContent, t.querySelector('.wtile__big')?.textContent, t.querySelector('.wtile__line')?.textContent]), days: document.querySelectorAll('.wweek__day').length, radar: !!document.querySelector('.wpage .rstrip'), foot: [...document.querySelectorAll('.wpage .ppage__foot button')].map((b) => b.textContent) })`))
      console.log(`  ${JSON.stringify(d).slice(0, 400)}`)
      if (d.temp !== homeTemp) fail(`${label}: the Weather page says ${JSON.stringify(d.temp)}, the home ${JSON.stringify(homeTemp)}`)
      const want = ['Wind', 'Rain', 'UV', 'Humidity', 'Pressure', 'Cloud']
      if (d.tiles.map((t) => t[0]).join('|') !== want.join('|')) fail(`${label}: the tiles are ${JSON.stringify(d.tiles.map((t) => t[0]))}, not ${want.join(' · ')}`)
      for (const [name, big, line] of d.tiles) if (!big || big === '—' || !line) fail(`${label}: the ${name} tile reads ${JSON.stringify([big, line])}`)
      if (d.days !== 7) fail(`${label}: ${d.days} days, not 7`)
      if (!d.radar) fail(`${label}: no radar card`)
      if (!d.foot.some((f) => /models .*›|models? (agree|split).*›/i.test(f))) fail(`${label}: no models line at the foot (${JSON.stringify(d.foot)})`)
      if (!d.foot.includes('How we got this ›')) fail(`${label}: no "How we got this ›"`)
      if (/\bsafe\b|all clear|clear to/i.test(w.text)) fail(`${label}: the Weather page says safe or clear`)
      await page.screenshot({ path: join(OUT, `weather-${label.replace(/\s/g, '-').toLowerCase()}.png`) })
      await page.locator('.wpage .ppage__back').click()
      await wait(800)
      if (await ev(`!!document.querySelector('.wpage')`)) fail(`${label}: Back left the Weather page open`)
      if (!(await ev(`!!document.querySelector('.home')`))) fail(`${label}: Back from the Weather page is not the home`)
    }

    /* --------------------------------------- back goes where you came from (Batch QA, Section 1) */
    if (await page.locator('.home__page[aria-label="Today"] .hcard--surf').first().click({ timeout: 4000, noWaitAfter: true }).then(() => true, () => false)) {
      await wait(2500)
      await page.locator('.dpage--surf .dpage__back').first().click({ timeout: 4000, noWaitAfter: true }).catch(() => {})
      await wait(1500)
      const home = await ev(`!!document.querySelector('.home')`)
      console.log(`  Surf from the home, then back: ${home ? 'the home' : 'not the home'}`)
      if (!home) fail(`${label}: back from the Surf page the home opened is not the home`)
    }

    /* -------------------------------------------------------------- Sky */
    /*
     * noWaitAfter (Batch QA, Section 0): on the busy gate's Android Chrome a
     * card's tap was done and Playwright then waited past 4 s for "scheduled
     * navigations" (the shared plan's link tidies the address bar once it has
     * read it). Whether the page opened is checked by itself below.
     */
    const skyCard = await page.locator('.home__page[aria-label="Today"] .hcard--sky').first().click({ timeout: 4000, noWaitAfter: true }).then(() => true, (e) => String(e?.message ?? e).split('\n').slice(0, 14).join(' | '))
    if (skyCard !== true) fail(`${label}: no Sky card on the home (${skyCard})`)
    await wait(5000)
    const k = JSON.parse(await ev(FIT('.spage')))
    if (k.missing) fail(`${label}: the Sky card opened no Sky page`)
    else {
      looked += 1
      console.log(`  Sky: ${k.content}/${k.box} px, ${k.out.length === 0 && !k.scrolls ? 'fits' : `scrolls or runs off ${JSON.stringify(k.out)}`}`)
      const d = JSON.parse(await ev(`JSON.stringify({ seg: [...document.querySelectorAll('.spage__seg button')].map((b) => b.textContent), head: document.querySelector('.spage__head')?.textContent ?? null, why: document.querySelector('.spage__why')?.textContent ?? null, event: document.querySelector('.spage__event')?.textContent ?? null, side: !!document.querySelector('.spage__side svg, .spage__side .spage__none'), gap: document.querySelector('.spage__gap')?.textContent ?? null, marks: document.querySelector('.spage__marks')?.textContent ?? null, rare: document.querySelector('.spage__rare')?.innerText ?? null, grid: !!document.querySelector('.spage .spec__week, .spage .spec__grid, .spage .spec__lane'), buttons: [...document.querySelectorAll('.spage__buttons button')].map((b) => b.textContent) })`))
      console.log(`  ${JSON.stringify(d).slice(0, 500)}`)
      /* Batch Flow, Section 4 (board D_Sky): the toggle names the day of each event, never one that has passed. */
      const evening = d.seg.find((x) => /evening$|^Tonight$/.test(x))
      const morning = d.seg.find((x) => /morning$/.test(x))
      if (d.seg.length !== 2 || evening === undefined || morning === undefined) fail(`${label}: the toggle reads ${JSON.stringify(d.seg)}`)
      if (!/^(Sunset|Sunrise) \d+:\d\d [AP]M · looking [NESW]+$/.test(d.event ?? '')) fail(`${label}: the event line reads ${JSON.stringify(d.event)}`)
      if (!d.side) fail(`${label}: no side view toward the sun`)
      if (d.gap === null || d.gap.trim() === '') fail(`${label}: no gap line under the side view`)
      if (!/^(Color (likely|possible|unlikely)|No call yet)$/.test(d.head ?? '')) fail(`${label}: the headline reads ${JSON.stringify(d.head)}`)
      if (!d.why || d.why === '…') fail(`${label}: no reason under the headline`)
      if (!/golden ?\d+:\d\d [AP]M.*color ?\d+:\d\d [AP]M–\d+:\d\d [AP]M.*blue ?\d+:\d\d [AP]M.*dark ?\d+:\d\d [AP]M|dark ?\d+:\d\d [AP]M.*blue ?\d+:\d\d [AP]M.*color ?\d+:\d\d [AP]M–\d+:\d\d [AP]M.*golden ?\d+:\d\d [AP]M/.test(d.marks ?? '')) fail(`${label}: the light bar reads ${JSON.stringify(d.marks)}`)
      if (!/RARE LIGHT THIS WEEK/i.test(d.rare ?? '')) fail(`${label}: no RARE LIGHT THIS WEEK`)
      if (d.grid) fail(`${label}: the icon-only week grid is still there`)
      if (!d.buttons.some((b) => /Calendar/.test(b))) fail(`${label}: no Calendar button`)
      if (/\bsafe\b|all clear|clear to/i.test(k.text)) fail(`${label}: the Sky page says safe or clear`)
      await page.screenshot({ path: join(OUT, `sky-${label.replace(/\s/g, '-').toLowerCase()}.png`) })
      await page.locator('.spage .ppage__back').click()
      await wait(800)
      if (await ev(`!!document.querySelector('.spage')`)) fail(`${label}: Back left the Sky page open`)
    }
    /* -------------------------------------------------------------- Drone (Batch Flow, Section 5; board D_Drone) */
    const droneCard = await page.locator('.home__page[aria-label="Today"] .hcard--drone').first().click({ timeout: 4000, noWaitAfter: true }).then(() => true, (e) => String(e?.message ?? e).split('\n').slice(0, 14).join(' | '))
    if (droneCard !== true) fail(`${label}: no Drone card on the home (a drone is in this kit) (${droneCard})`)
    await wait(4000)
    const dr = JSON.parse(await ev(`JSON.stringify((() => { const p = document.querySelector('.drpage'); if (!p) return null; return { big: p.querySelector('.drp__big')?.textContent ?? null, limit: p.querySelector('.drp__limit')?.textContent ?? null, rows: p.querySelectorAll('.drp__rowk').length, segs: p.querySelectorAll('.drp__seg').length, tiles: [...p.querySelectorAll('.wtile__label')].map((e) => e.textContent), buttons: [...p.querySelectorAll('.drp__buttons button')].map((b) => b.textContent), text: p.innerText } })())`))
    console.log(`  Drone: ${JSON.stringify(dr === null ? null : { ...dr, text: undefined })}`)
    if (dr === null) fail(`${label}: the home's Drone card opened no Drone page`)
    else {
      if (!/^\d+ (kt|mph|km\/h|m\/s)$/.test(dr.big ?? '')) fail(`${label}: the Drone page's headline reads ${JSON.stringify(dr.big)}`)
      if (!/limit|My gear/.test(dr.limit ?? '')) fail(`${label}: no drone limit line (${JSON.stringify(dr.limit)})`)
      if (dr.rows !== 5) fail(`${label}: ${dr.rows} heights in the air above the beach, not gnd to 400 ft`)
      if (dr.segs < 1) fail(`${label}: no best-time-to-fly bar`)
      if (dr.tiles.join('|') !== 'Airspace|Battery|GPS') fail(`${label}: the tiles are ${JSON.stringify(dr.tiles)}`)
      if (dr.buttons.join('|') !== 'Preflight|Fly it yourself') fail(`${label}: the buttons are ${JSON.stringify(dr.buttons)}`)
      if (/\bsafe\b|all clear|clear to fly/i.test(dr.text)) fail(`${label}: the Drone page says safe or clear`)
      await page.screenshot({ path: join(OUT, `drone-${label.replace(/\s/g, '-').toLowerCase()}.png`) })
      await page.locator('.drpage .ppage__back').click()
      await wait(800)
    }
    /* The map: its Cloud chip opens the Sky page; no Sky sheet with tabs. */
    await page.locator('.home .hbtn--round[aria-label="Open the map"]').click().catch(() => fail(`${label}: no map button on the home`))
    await wait(2500)
    const chip = await page.locator('.chips2 button:has-text("Cloud"), .chip2:has-text("Cloud")').first().click({ timeout: 4000 }).then(() => true, () => false)
    if (!chip) fail(`${label}: no Cloud chip on the map`)
    await wait(3000)
    if (!(await ev(`!!document.querySelector('.spage')`))) fail(`${label}: the map's Cloud chip opened no Sky page`)
    if (await ev(`!!document.querySelector('.skyc__tabs')`)) fail(`${label}: the Sky sheet's tabs are still on the map`)
    await ctx.close()
    watchdog.note(label)
  }
} finally {
  for (const b of Object.values(browsers)) await b.close()
}
watchdog.stop()
if (looked === 0) {
  console.log('=== PAGES AUDIT ABORTED: nothing was looked at ===')
  process.exit(2)
}
console.log(`  screenshots: ${OUT}`)
console.log(`\n=== PAGES PROBLEMS: ${problems} ===`)
process.exit(problems === 0 ? 0 : 1)
