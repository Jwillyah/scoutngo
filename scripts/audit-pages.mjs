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
 *             GPS, Preflight check and Plan the flight (Batch DRONE: the 3D view's button, renamed)
 *   Sky       the home's Sky card opens it; Sunset · Sunrise; "Color
 *             likely / possible / unlikely" and a reason; the three plain
 *             checks by name; Golden · Set · Blue · Dark with times; RARE
 *             LIGHT THIS WEEK (rows or its own "nothing" line), never the
 *             icon-only week grid; Viewfinder and Calendar ›; the map's
 *             Cloud chip opens it too, and the map has no Sky sheet tabs
 *
 *   Back      Batch SIMPLE-3, Section 0.4: the spot search's × and Escape, from
 *             the home and from the map, and Back from Surf, Tide, Wind,
 *             Sky and Weather opened from the home: each lands where it
 *             came from, never on the spot search
 *
 * Nothing on a page says safe or clear (rule 28; ux-rules 12), except the
 * station's own "below 12,000 ft" cloud report, which is about cloud.
 */
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, webkit, devices } from './gate/playwright.mjs'
import { ensureApp, findChrome, goToStage, guardAudit, startWatchdog, APP_ORIGIN } from './preflight.mjs'
import { goHome } from './preflight.mjs'

import { shareLink } from '../src/lib/planShare.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'
import { placeKey } from '../src/core/venueName.ts'

guardAudit('pages')
const watchdog = startWatchdog('pages', 600_000)
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
    /* Batch SIMPLE-2, Section 2: the map's Back to the home (the menu has no Today card); each page from its tile. */
    await goHome(ev, wait)
    await wait(6000)
    if (!(await ev(`!!document.querySelector('.home')`))) {
      fail(`${label}: the map's Back to the home opened no home`)
      await ctx.close()
      continue
    }
    const homeTemp = await ev(`document.querySelector('.home .hwtile__temp')?.textContent ?? null`)

    /* ---------------------------------------------------------- Weather */
    const opened = await page.locator('.home [data-tile="weather"] .hwtile__temp').first().click({ timeout: 4000 }).then(() => true, () => false)
    if (!opened) fail(`${label}: no "Weather ›" on the home`)
    await wait(5000)
    const w = JSON.parse(await ev(FIT('.wpage')))
    if (w.missing) fail(`${label}: "Weather ›" opened no Weather page`)
    else {
      looked += 1
      console.log(`  Weather: ${w.content}/${w.box} px, ${w.out.length === 0 && !w.scrolls ? 'fits' : `DOES NOT FIT ${JSON.stringify(w.out)}`}`)
      if (w.scrolls) fail(`${label}: the Weather page scrolls (${w.content} of ${w.box} px)`)
      for (const o of w.out) fail(`${label}: on the Weather page ${o} runs off the screen`)
      /* Batch SIMPLE-2, Section 4 (board Page_Weather): hero, one chart card, rows, "More details ›"; no tabs. */
      const d = JSON.parse(await ev(`JSON.stringify({ temp: document.querySelector('.wpage [data-shared="temp"]')?.getAttribute('data-value') ?? null, hero: document.querySelector('.wpage .tipage__value')?.textContent ?? null, sub: document.querySelector('.wpage .tipage__sub')?.textContent ?? null, tabs: document.querySelectorAll('.wpage [role="tab"]').length, charts: document.querySelectorAll('.wpage .tipage__chart').length, line: document.querySelectorAll('.wpage .wchart__line').length, rows: [...document.querySelectorAll('.wpage .tipage__row:not(.tipage__more)')].map((r) => [r.querySelector('.tipage__label')?.textContent, r.querySelector('.tipage__val b')?.textContent, r.querySelector('.tipage__detail')?.textContent?.trim()]), more: !!document.querySelector('.wpage .tipage__more'), foot: [...document.querySelectorAll('.wpage .ppage__foot button')].map((b) => b.textContent), safety: document.querySelector('.wpage .dpage__safety')?.textContent ?? null })`))
      console.log(`  ${JSON.stringify(d).slice(0, 500)}`)
      if (d.temp !== homeTemp) fail(`${label}: the Weather page says ${JSON.stringify(d.temp)}, the home ${JSON.stringify(homeTemp)}`)
      if (!String(d.hero ?? '').startsWith(String(homeTemp))) fail(`${label}: the Weather hero reads ${JSON.stringify(d.hero)}, the home ${JSON.stringify(homeTemp)}`)
      if (!/^High .+ · low .+ · feels .+$/.test(d.sub ?? '')) fail(`${label}: the hero's sub line reads ${JSON.stringify(d.sub)}`)
      if (d.tabs !== 0) fail(`${label}: the Weather page has ${d.tabs} tabs, none on the board`)
      if (d.charts !== 1 || d.line < 1) fail(`${label}: the Weather page has ${d.charts} chart cards and ${d.line} temperature lines, not one card with a line`)
      const want = ['Rain', 'Clouds', 'Humidity', 'UV']
      if (d.rows.map((t) => t[0]).join('|') !== want.join('|')) fail(`${label}: the rows are ${JSON.stringify(d.rows.map((t) => t[0]))}, not ${want.join(' · ')}`)
      if (d.rows.length > 5) fail(`${label}: ${d.rows.length} rows, five at most`)
      for (const [name, big, line] of d.rows) if (!big || big === '—' || !line) fail(`${label}: the ${name} row reads ${JSON.stringify([big, line])}`)
      if (!d.more) fail(`${label}: no "More details ›" row`)
      if (!d.foot.includes('How we got this ›')) fail(`${label}: no "How we got this ›"`)
      if (d.safety !== 'Forecasts can be wrong · look first') fail(`${label}: the Weather safety line reads ${JSON.stringify(d.safety)}`)
      /* The old page, unchanged, behind "More details ›": six tiles, the 7 days, the radar strip, the models line. */
      await page.locator('.wpage .tipage__more').click()
      await wait(1200)
      const old = JSON.parse(await ev(`JSON.stringify({ temp: document.querySelector('.wpage__temp')?.textContent ?? null, tiles: [...document.querySelectorAll('.wtile')].map((t) => [t.querySelector('.wtile__label')?.textContent, t.querySelector('.wtile__big')?.textContent, t.querySelector('.wtile__line')?.textContent]), days: document.querySelectorAll('.wweek__day').length, radar: !!document.querySelector('.wpage .rstrip'), foot: [...document.querySelectorAll('.wpage .ppage__foot button')].map((b) => b.textContent) })`))
      console.log(`  More details: ${JSON.stringify(old).slice(0, 400)}`)
      if (old.temp !== homeTemp) fail(`${label}: More details says ${JSON.stringify(old.temp)}, the home ${JSON.stringify(homeTemp)}`)
      const wantTiles = ['Wind', 'Rain', 'UV', 'Humidity', 'Pressure', 'Cloud']
      if (old.tiles.map((t) => t[0]).join('|') !== wantTiles.join('|')) fail(`${label}: More details' tiles are ${JSON.stringify(old.tiles.map((t) => t[0]))}, not ${wantTiles.join(' · ')}`)
      for (const [name, big, line] of old.tiles) if (!big || big === '—' || !line) fail(`${label}: the ${name} tile reads ${JSON.stringify([big, line])}`)
      if (old.days !== 7) fail(`${label}: ${old.days} days, not 7`)
      if (!old.radar) fail(`${label}: no radar card behind More details`)
      if (!old.foot.some((f) => /models .*›|models? (agree|split).*›/i.test(f))) fail(`${label}: no models line at the foot of More details (${JSON.stringify(old.foot)})`)
      /* Back from More details is the skeleton page, not the home. */
      await page.locator('.wpage .ppage__back').click()
      await wait(800)
      if (!(await ev(`!!document.querySelector('.wpage .tipage__chart')`))) fail(`${label}: Back from More details did not return to the Weather page`)
      if (/\bsafe\b|all clear|clear to/i.test(w.text)) fail(`${label}: the Weather page says safe or clear`)
      await page.screenshot({ path: join(OUT, `weather-${label.replace(/\s/g, '-').toLowerCase()}.png`) })
      await page.locator('.wpage .ppage__back').click()
      await wait(800)
      if (await ev(`!!document.querySelector('.wpage')`)) fail(`${label}: Back left the Weather page open`)
      if (!(await ev(`!!document.querySelector('.home')`))) fail(`${label}: Back from the Weather page is not the home`)
    }

    /* --------------------------------------- back goes where you came from (Batch QA, Section 1) */
    if (await page.locator('.home [data-tile="surf"]').first().click({ timeout: 4000, noWaitAfter: true }).then(() => true, () => false)) {
      await wait(2500)
      await page.locator('.dpage--surf .ppage__back, .dpage--surf .dpage__back').first().click({ timeout: 4000, noWaitAfter: true }).catch(() => {})
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
    const skyCard = await page.locator('.home [data-tile="sky"]').first().click({ timeout: 4000, noWaitAfter: true }).then(() => true, (e) => String(e?.message ?? e).split('\n').slice(0, 14).join(' | '))
    if (skyCard !== true) fail(`${label}: no Sky card on the home (${skyCard})`)
    await wait(5000)
    const k = JSON.parse(await ev(FIT('.spage')))
    if (k.missing) fail(`${label}: the Sky card opened no Sky page`)
    else {
      looked += 1
      console.log(`  Sky: ${k.content}/${k.box} px, ${k.out.length === 0 && !k.scrolls ? 'fits' : `scrolls or runs off ${JSON.stringify(k.out)}`}`)
      /*
       * Batch SIMPLE-2, Section 4: the Sky page is the tap-in skeleton, Now · Tonight · Sunrise · Night; at 10:30 AM it
       * opens on Now (src/core/skyTabs.ts): the sky in a word, the cams, then Clouds · Moving · Rare light · Next. Every
       * tab, every size and the Viewfinder are scripts/audit-sky.mjs's; here, the page the home's Sky card opens.
       */
      const TABS = `[...document.querySelectorAll('.tipage.spage .tipage__tabs [role="tab"]')]`
      const READ = `JSON.stringify({ seg: ${TABS}.map((b) => ({ t: b.textContent, on: b.getAttribute('aria-selected') === 'true' })), value: document.querySelector('.tipage.spage .tipage__value')?.textContent ?? null, sub: document.querySelector('.tipage.spage .tipage__sub')?.textContent ?? null, rows: [...document.querySelectorAll('.tipage.spage .tipage__row')].map((r) => (r.querySelector('.tipage__label') ?? r.querySelector('.tipage__morelabel'))?.textContent + ' ' + (r.querySelector('.tipage__val')?.textContent ?? '').trim()), picture: !!document.querySelector('.tipage.spage svg[data-sky-picture], .tipage.spage .skypic__none'), why: document.querySelector('.tipage.spage .spage__why')?.textContent ?? null, buttons: [...document.querySelectorAll('.tipage.spage .tipage__btn')].map((b) => b.textContent) })`
      const nowTab = JSON.parse(await ev(READ))
      console.log(`  Now: ${JSON.stringify(nowTab)}`)
      if (nowTab.seg.map((x) => x.t).join('|') !== 'Now|Tonight|Sunrise|Night') fail(`${label}: the Sky page's tabs read ${JSON.stringify(nowTab.seg)}`)
      if (nowTab.seg[0]?.on !== true) fail(`${label}: the Sky page did not open on Now at 10:30 AM (${JSON.stringify(nowTab.seg)})`)
      if (!/^(Textured clouds now|Light rays now|Iridescence now|A halo now|Color now|Nothing special now)/.test(nowTab.sub ?? '')) fail(`${label}: Now's line reads ${JSON.stringify(nowTab.sub)}`)
      if (!/^Clouds /.test(nowTab.rows[0] ?? '') || /^Clouds\s*$/.test(nowTab.rows[0] ?? '')) fail(`${label}: Now does not say the clouds (${JSON.stringify(nowTab.rows[0])})`)
      if (!nowTab.rows.some((r) => /^Next (Sunset|Sunrise) \d+:\d\d [AP]M ?(Color (likely|possible|unlikely)|No call yet)/.test(r))) fail(`${label}: Now's Next row reads ${JSON.stringify(nowTab.rows)}`)
      await ev(`${TABS}[1]?.click()`)
      await wait(800)
      const d = JSON.parse(await ev(READ))
      console.log(`  ${JSON.stringify(d).slice(0, 500)}`)
      if (d.seg[1]?.on !== true) fail(`${label}: Tonight did not open (${JSON.stringify(d.seg)})`)
      if (!/^(Color (likely|possible|unlikely)|No call yet)$/.test(d.value ?? '')) fail(`${label}: the call reads ${JSON.stringify(d.value)}`)
      if (!d.why || d.why === '…') fail(`${label}: no reason under the call`)
      if (!d.picture) fail(`${label}: no drawn sky toward the sun`)
      if (!/^Golden \d+:\d\d [AP]M–\d+:\d\d [AP]M/.test(d.rows[0] ?? '') || !/^Color \d+:\d\d [AP]M–/.test(d.rows[1] ?? '') || !/^Blue hour \d+:\d\d [AP]M–/.test(d.rows[2] ?? '') || !/^Moon \d+% · (up|down)/.test(d.rows[3] ?? '')) fail(`${label}: Tonight's rows read ${JSON.stringify(d.rows)}`)
      if (!d.buttons.some((b) => /Best spot near me/.test(b))) fail(`${label}: no "Best spot near me ›"`)
      if (/\bsafe\b|all clear|clear to/i.test(k.text)) fail(`${label}: the Sky page says safe or clear`)
      await page.screenshot({ path: join(OUT, `sky-${label.replace(/\s/g, '-').toLowerCase()}.png`) })
      await page.locator('.tipage.spage .ppage__back').click()
      await wait(800)
      if (await ev(`!!document.querySelector('.spage')`)) fail(`${label}: Back left the Sky page open`)
    }
    /* -------------------------------------------------------------- Drone (Batch Flow, Section 5; board D_Drone) */
    const droneCard = await page.locator('.home [data-tile="drone"]').first().click({ timeout: 4000, noWaitAfter: true }).then(() => true, (e) => String(e?.message ?? e).split('\n').slice(0, 14).join(' | '))
    if (droneCard !== true) fail(`${label}: no Drone card on the home (a drone is in this kit) (${droneCard})`)
    await wait(4000)
    /*
     * Batch SIMPLE-2, Section 4 (board Drone_Preflight): the Drone page is the tap-in skeleton. Tabs Preflight · Wind · Airspace, opening on
     * Preflight: "N to check", eight green or amber rows, "Get LAANC ›" and "Plan a shoot ›", the foot "Not official FAA · check LAANC".
     * Tapping the Airspace row opens the Airspace tab, the Wind row the Wind tab. Wind (the old Now page with By height's grid below it
     * on one scroll) and Airspace keep their SIMPLE-1 content.
     */
    await wait(2500)
    const PF_LABELS = ['Airspace', 'Wind 400 ft', 'Gusts', 'Battery', 'Sunset', 'TFRs', 'Remote ID', 'Kp']
    const pf = JSON.parse(await ev(`JSON.stringify((() => { const p = document.querySelector('.drpage'); if (!p) return null; const rows = [...p.querySelectorAll('.tipage__rows .tipage__row:not(.tipage__more)')]; return { tabs: [...p.querySelectorAll('.tipage__tabs [role="tab"]')].map((b) => b.textContent), on: p.querySelector('.tipage__tabs [aria-selected="true"]')?.textContent ?? null, head: p.querySelector('.tipage__value')?.textContent ?? null, sub: p.querySelector('.tipage__sub')?.textContent ?? null, labels: rows.map((r) => r.querySelector('.tipage__label')?.textContent), tones: rows.map((r) => r.querySelector('.tipage__dot--good') ? 'green' : r.querySelector('.tipage__dot--caution') ? 'amber' : null), taps: rows.filter((r) => r.tagName === 'BUTTON').map((r) => r.querySelector('.tipage__label')?.textContent), tfr: rows.find((r) => r.querySelector('.tipage__label')?.textContent === 'TFRs')?.innerText ?? null, buttons: [...p.querySelectorAll('.tipage__actions a, .tipage__actions button')].map((b) => b.textContent.trim()), laanc: p.querySelector('.tipage__actions a')?.getAttribute('href') ?? null, safety: p.querySelector('.dpage__safety')?.textContent ?? null, text: p.innerText } })())`))
    console.log(`  Drone: ${JSON.stringify(pf === null ? null : { ...pf, text: undefined })}`)
    if (pf === null) fail(`${label}: the home's Drone card opened no Drone page`)
    else {
      if (pf.tabs.join('|') !== 'Preflight|Wind|Airspace') fail(`${label}: the Drone page's tabs are ${JSON.stringify(pf.tabs)}`)
      if (pf.on !== 'Preflight') fail(`${label}: the Drone page opened on ${JSON.stringify(pf.on)}, not Preflight`)
      if (!/^\d+ to check$/.test(pf.head ?? '')) fail(`${label}: the headline reads ${JSON.stringify(pf.head)}, not "N to check"`)
      if (pf.labels.join('|') !== PF_LABELS.join('|')) fail(`${label}: the Preflight rows are ${JSON.stringify(pf.labels)}`)
      if (pf.tones.some((t) => t !== 'green' && t !== 'amber')) fail(`${label}: a Preflight row is neither green nor amber: ${JSON.stringify(pf.tones)}`)
      if (pf.tones.filter((t) => t === 'amber').length !== Number.parseInt(pf.head ?? '', 10)) fail(`${label}: "${pf.head}" with ${pf.tones.filter((t) => t === 'amber').length} amber rows`)
      if (pf.taps.join('|') !== 'Airspace|Wind 400 ft') fail(`${label}: the rows that open a tab are ${JSON.stringify(pf.taps)}, not Airspace and Wind 400 ft`)
      if (!/TFRs/.test(pf.tfr ?? '') || !/other NOTAMs not checked/.test(pf.tfr ?? '')) fail(`${label}: the TFR row reads ${JSON.stringify(pf.tfr)}`)
      if (/TFRs? (are|is) not checked|NOT checked/.test(pf.text)) fail(`${label}: the Drone page still says TFRs are not checked`)
      if (pf.buttons.join('|') !== 'Get LAANC ›|Plan a shoot ›') fail(`${label}: the Preflight buttons are ${JSON.stringify(pf.buttons)}`)
      if (!/faa\.gov/.test(pf.laanc ?? '')) fail(`${label}: Get LAANC goes to ${JSON.stringify(pf.laanc)}`)
      if (pf.safety !== 'Not official FAA · check LAANC') fail(`${label}: the Drone foot reads ${JSON.stringify(pf.safety)}`)
      if (/\bsafe\b|all clear|clear to fly|\blegal\b/i.test(pf.text)) fail(`${label}: Preflight says safe, clear or legal`)
      await page.screenshot({ path: join(OUT, `drone-${label.replace(/\s/g, '-').toLowerCase()}.png`) })
      /* The Airspace row opens the Airspace tab; back on Preflight, the Wind row opens the Wind tab. */
      const tabOn = () => ev(`document.querySelector('.drpage .tipage__tabs [aria-selected="true"]')?.textContent ?? null`)
      await page.locator('.drpage .tipage__row--tap:has(.tipage__label:text-is("Airspace"))').click({ timeout: 4000 }).catch(() => fail(`${label}: no tappable Airspace row`))
      await wait(1500)
      if ((await tabOn()) !== 'Airspace' || !(await ev(`!!document.querySelector('.drpage [data-drone-page="airspace"]')`))) fail(`${label}: the Airspace row did not open the Airspace tab`)
      await page.locator('.drpage .tipage__tabs [role="tab"]:has-text("Preflight")').click({ timeout: 4000 }).catch(() => fail(`${label}: no Preflight tab to go back to`))
      await wait(800)
      await page.locator('.drpage .tipage__row--tap:has(.tipage__label:text-is("Wind 400 ft"))').click({ timeout: 4000 }).catch(() => fail(`${label}: no tappable Wind row`))
      await wait(1500)
      if ((await tabOn()) !== 'Wind') fail(`${label}: the Wind row did not open the Wind tab`)
    }
    const dr = JSON.parse(await ev(`JSON.stringify((() => { const p = document.querySelector('.drpage'); if (!p) return null; const wind = p.querySelector('[data-drone-page="wind"]'); return { big: p.querySelector('.drp__big')?.textContent ?? null, limit: p.querySelector('.drp__limit')?.textContent ?? null, rows: p.querySelectorAll('[data-drone-page="wind"] [role="rowheader"]').length, segs: p.querySelectorAll('[data-drone-page="wind"] .drp__bar').length + p.querySelectorAll('[data-drone-page="wind"] .drp__today .drp__none').length, tiles: wind === null ? [] : [...wind.querySelectorAll('.drp__rowline .drp__rlabel')].map((e) => e.textContent), cards: p.querySelectorAll('[data-drone-page="wind"] .wtile, [data-drone-page="wind"] .drp__rowline').length, chip: p.querySelector('.drp__chip')?.getAttribute('data-tone') ?? null, chipText: p.querySelector('.drp__chip')?.textContent ?? null, compass: p.querySelector('.drp__compass [data-toward], .drp__compass [data-calm], .drp__compass [data-nodir]') !== null, text: p.innerText } })())`))
    console.log(`  Wind tab: ${JSON.stringify(dr === null ? null : { ...dr, text: undefined })}`)
    if (dr !== null) {
      if (!/^\d+ (kt|mph|km\/h|m\/s)$/.test(dr.big ?? '')) fail(`${label}: the Wind tab's headline reads ${JSON.stringify(dr.big)}`)
      if (!/limit|My gear/.test(dr.limit ?? '')) fail(`${label}: no drone limit line (${JSON.stringify(dr.limit)})`)
      if (dr.rows !== 5) fail(`${label}: ${dr.rows} heights in the By height grid under the wind, not gnd to 400 ft`)
      if (dr.segs < 1) fail(`${label}: no hours at 400 ft on Wind, and no words saying why`)
      /* The compass is never an empty circle: an arrow, "Calm", or a dash. */
      if (!dr.compass) fail(`${label}: the compass has no arrow, no "Calm" and no dash: an empty circle`)
      /* The Now rows are off (src/config/flags.ts DRONE_WIND_ROWS); no cards either. */
      if (dr.tiles.length !== 0 || dr.cards !== 0) fail(`${label}: the Wind page still has rows or cards: ${JSON.stringify(dr.tiles)} / ${dr.cards}`)
      /* One chip, orange only for limit or gust trouble. */
      if (dr.chip !== null && (dr.chip === 'trouble') !== /^(Over|At) your|^Gusts \d+% of your/.test(dr.chipText ?? '')) fail(`${label}: the chip is ${dr.chip} for ${JSON.stringify(dr.chipText)}`)
      if (/\bsafe\b|all clear|clear to fly/i.test(dr.text)) fail(`${label}: the Wind tab says safe or clear`)
      await page.locator('.drpage .ppage__back').click()
      await wait(800)
    }
    /*
     * ---------------------------------------------------------- every Back, never the spot search (Batch SIMPLE-3, Section 0.4)
     * The search is a modal of the screen it was opened over (src/lib/spotPick.ts): its ×, Escape and every
     * page's Back return to that screen, and no Back finds the search again. Counted, so a run that could
     * open nothing fails (docs/failure-modes.md B).
     */
    const on = () => ev(`JSON.stringify({ picker: !!document.querySelector('.spick'), home: !!document.querySelector('.home.homep [data-tile]'), map: [...document.querySelectorAll('.pill-venue')].some((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 }) })`).then(JSON.parse)
    let backs = 0
    const expectOn = async (step, want) => {
      await wait(900)
      const o = await on()
      backs += 1
      if (o.picker) fail(`${label}: ${step}: the spot search is on screen`)
      if (want === 'home' && !o.home) fail(`${label}: ${step}: not the home (${JSON.stringify(o)})`)
      if (want === 'map' && (!o.map || o.home)) fail(`${label}: ${step}: not the map (${JSON.stringify(o)})`)
    }
    if ((await goHome(ev, wait)) !== 'home') fail(`${label}: no home for the Back paths`)
    for (const how of ['×', 'Escape']) {
      const opened = await page.locator('.homep__spot').click({ timeout: 4000 }).then(() => true, () => false)
      await wait(900)
      if (!opened || !(await on()).picker) {
        fail(`${label}: the home's spot ⌄ opened no spot search`)
        continue
      }
      if (how === '×') await page.locator('.spick__x').click({ timeout: 4000 }).catch(() => fail(`${label}: the spot search has no ×`))
      else await page.keyboard.press('Escape')
      await expectOn(`home › spot search › ${how}`, 'home')
    }
    for (const tile of ['surf', 'tide', 'wind', 'sky', 'weather']) {
      const t = await page.locator(`.home [data-tile="${tile}"]`).first().click({ timeout: 4000 }).then(() => true, () => false)
      if (!t) {
        fail(`${label}: no ${tile} tile for the Back paths`)
        continue
      }
      await wait(2500)
      /* The page's own Back (a page's arrow, or the map's for Wind): the top one on screen. */
      const tapped = await ev(`(() => { const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.closest('[inert]') }; const b = [...document.querySelectorAll('.ppage__back, .dpage__back:not(.ppage__map), .topbar__back')].filter(vis).pop(); if (!b) return false; b.click(); return true })()`)
      if (!tapped) fail(`${label}: home › ${tile}: no Back on screen`)
      await expectOn(`home › ${tile} › Back`, 'home')
    }
    await page.locator('.home .hbtn--round[aria-label="Open the map"]').click().catch(() => fail(`${label}: no map button on the home`))
    await wait(2500)
    for (const how of ['×', 'Escape']) {
      const p2 = await page.locator('.pill-venue').first().click({ timeout: 4000 }).then(() => true, () => false)
      await wait(900)
      if (!p2 || !(await on()).picker) {
        fail(`${label}: the map's place pill opened no spot search`)
        continue
      }
      if (how === '×') await page.locator('.spick__x').click({ timeout: 4000 }).catch(() => {})
      else await page.keyboard.press('Escape')
      await expectOn(`map › spot search › ${how}`, 'map')
    }
    if ((await goHome(ev, wait)) !== 'home') fail(`${label}: the map's Back did not bring the home`)
    await expectOn('map › Back', 'home')
    if (backs < 10) fail(`${label}: only ${backs} Back paths were walked`)
    console.log(`  Back paths: ${backs} walked, the spot search on none`)
    /* The map: its Cloud chip opens the Sky page; no Sky sheet with tabs. */
    await page.locator('.home .hbtn--round[aria-label="Open the map"]').click().catch(() => fail(`${label}: no map button on the home`))
    await wait(2500)
    const chip = await page.locator('.chip2[data-chip="cloud"]').first().click({ timeout: 4000 }).then(() => true, () => false)
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
