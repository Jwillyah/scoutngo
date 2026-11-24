/*
 * THE HOME (Batch SIMPLE-2, Section 2: the tile home, boards Home_P_*), ON
 * AN IPHONE AND AN ANDROID PHONE, AS A BROWSER TAB AND FROM THE HOME SCREEN.
 *
 * Usage:  node scripts/audit-briefing.mjs [screenshot-dir]
 *
 * The Virginia Beach pier at 6:11 AM EST on 2 Nov, a drone in the kit, every
 * weather host answered by the gate's fixtures. A shared plan's link lands
 * on the map, never the home; the map's "Back to the home" opens it.
 *
 *   fits      390 x 844 (WebKit, tab and home screen), 412 x 915 (Chromium,
 *             tab and installed), 390 x 664 (a short Safari tab): nothing
 *             scrolled, nothing below the screen or off its side
 *   weather   a temperature, the sky in a word with H and L, the strip's 48 hours
 *   tiles     six, in the Surf order with nothing picked, each a label, a
 *             value (or a dash), one line and ›; their pictures live: the
 *             wind's arrows point the way the Wind tile's words say, the
 *             tide is a curve when there is a turn, the sky's art is warm
 *             only for a Likely or Possible call
 *   dock      Map and Menu, nothing else; Menu opens the menu
 *   words     never "safe", never "clear to", never a red ground
 *   first run a bare launch: "Where do you go?" with its box focused, spots
 *             near the location once, one tap to the home; then "What do you
 *             do outside?": ONE tap on Fish picks it, keeps it on the phone
 *             and draws the Fish order with Water, "Fish first"
 */
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, webkit, devices } from './gate/playwright.mjs'
import { ensureApp, findChrome, goHome, goToStage, guardAudit, startWatchdog, APP_ORIGIN } from './preflight.mjs'
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

/** The home as drawn: what runs off the screen or its side, whether anything scrolls, its text, and each part's words. */
const READ = `JSON.stringify((() => {
  const home = document.querySelector('.home.homep')
  if (!home) return { missing: true }
  const r = home.getBoundingClientRect()
  const cls = (e) => String(e.getAttribute('class') ?? e.tagName).split(' ')[0]
  const vis = (e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 }
  const out = [...home.querySelectorAll('*')].filter((e) => vis(e) && !e.closest('.lsky') && e.getBoundingClientRect().bottom > innerHeight + 1).map((e) => cls(e) + ' ' + Math.round(e.getBoundingClientRect().bottom)).slice(0, 4)
  /* Batch SIMPLE-3, Section 2.5: an hour scrolled out of the weather strip is clipped by the strip, not off the side. */
  const side = [...home.querySelectorAll('*')].filter((e) => vis(e) && !e.closest('.lsky') && !e.closest('.hwtile__hours') && (e.getBoundingClientRect().right > r.right + 1 || e.getBoundingClientRect().left < r.left - 1)).map(cls).slice(0, 4)
  const scrolls = [home, ...home.querySelectorAll('*')].some((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 1)
  const tiles = [...home.querySelectorAll('.htile')].map((t) => ({ kind: t.dataset.tile, label: t.querySelector('.htile__label')?.textContent ?? '', value: t.querySelector('.htile__value')?.textContent ?? '', line: t.querySelector('.htile__line')?.textContent ?? null, chev: !!t.querySelector('.htile__chev'), arrows: [...t.querySelectorAll('[data-arrow-deg]')].map((g) => Number(g.dataset.arrowDeg)), curve: t.querySelector('[data-tide-curve]')?.dataset.tideCurve ?? null, sky: t.querySelector('[data-sky-art]')?.dataset.skyArt ?? null }))
  const w = home.querySelector('.hwtile')
  return { out, side, scrolls, text: home.innerText, tiles, temp: w?.querySelector('.hwtile__temp')?.textContent ?? '', cond: w?.querySelector('.hwtile__line')?.textContent ?? '', hours: w?.querySelectorAll('.hwtile__h[data-slot="hour"]').length ?? 0, dock: [...home.querySelectorAll('.homep__dock button')].map((b) => b.getAttribute('aria-label')), moment: home.querySelector('.hmoment')?.innerText ?? null }
})())`

const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']

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
    const went = await goHome(ev, wait)
    await wait(6000)
    if (went !== 'home' || !(await ev(`!!document.querySelector('.home.homep')`))) {
      fail(`${label}: the map's Back to the home opened no home (${went})`)
      await ctx.close()
      continue
    }
    looked += 1
    const h = JSON.parse(await ev(READ))
    console.log(`  home: ${h.tiles.map((t) => `${t.kind} "${t.value}"`).join(' · ')}${h.moment === null ? '' : ` · moment ${JSON.stringify(h.moment)}`}, ${h.out.length === 0 && !h.scrolls ? 'fits' : `DOES NOT FIT ${JSON.stringify(h.out)}${h.scrolls ? ' (scrolls)' : ''}`}`)
    if (mustFit && h.scrolls) fail(`${label}: the home scrolls`)
    if (mustFit) for (const o of h.out) fail(`${label}: ${o} runs off the screen`)
    for (const o of h.side) fail(`${label}: ${o} runs off the side`)
    if (/\bsafe\b|clear to fly|all clear/i.test(h.text)) fail(`${label}: says safe or clear: ${JSON.stringify(h.text.slice(0, 120))}`)
    if (!/^-?\d+°$/.test(h.temp)) fail(`${label}: the big temperature reads ${JSON.stringify(h.temp)}`)
    if (!/^\S.* · H-?\d+° L-?\d+°$/.test(h.cond.trim()) || /^— /.test(h.cond)) fail(`${label}: no sky word with high and low under the temperature (${JSON.stringify(h.cond)})`)
    if (h.hours !== 48) fail(`${label}: ${h.hours} hours on the Weather tile's strip, not 48 (Batch SIMPLE-3, Section 2.5)`)
    /* Nothing picked: the Surf order (src/core/homeTiles.ts tileOrder). */
    if (h.tiles.map((t) => t.kind).join(' ') !== 'surf tide wind sky fish drone') fail(`${label}: the tiles are ${JSON.stringify(h.tiles.map((t) => t.kind))}`)
    for (const t of h.tiles) {
      if (t.label.trim() === '' || t.value.trim() === '' || !t.chev) fail(`${label}: the ${t.kind} tile has no label, value or › (${JSON.stringify(t)})`)
    }
    /* The live pictures, against the tile's own words. */
    const wind = h.tiles.find((t) => t.kind === 'wind')
    const from = /\b(N|NNE|NE|ENE|E|ESE|SE|SSE|S|SSW|SW|WSW|W|WNW|NW|NNW)$/.exec(wind?.value ?? '')?.[1] ?? null
    if (from !== null) {
      if ((wind?.arrows.length ?? 0) === 0) fail(`${label}: the Wind tile says ${wind?.value} and draws no arrow`)
      else {
        const goes = (POINTS.indexOf(from) * 22.5 + 180) % 360
        const off = Math.abs((((wind.arrows[0] - goes) % 360) + 540) % 360 - 180)
        console.log(`  wind "${wind.value}": first arrow ${wind.arrows[0]}°, the words say it goes ${goes}°`)
        if (off > 12) fail(`${label}: the Wind tile's first arrow points ${wind.arrows[0]}°, its words (${wind.value}) say ${goes}°`)
      }
    }
    const tide = h.tiles.find((t) => t.kind === 'tide')
    if (tide !== undefined && /^(High|Low) /.test(tide.value) && tide.curve !== 'strip') fail(`${label}: the Tide tile says ${tide.value} and draws no curve`)
    const sky = h.tiles.find((t) => t.kind === 'sky')
    if (sky !== undefined && sky.sky !== null && (sky.sky === 'lit') !== /^(Likely|Possible)$/.test(sky.value.trim())) fail(`${label}: the Sky tile says ${sky.value} and its art is ${sky.sky}`)
    if (JSON.stringify(h.dock) !== JSON.stringify(['Open the map', 'Menu'])) fail(`${label}: the dock is ${JSON.stringify(h.dock)}, not Map and Menu alone`)
    await page.screenshot({ path: join(OUT, `home-${label.replace(/\s/g, '-').toLowerCase()}.png`) })
    const ground = await ev(`getComputedStyle(document.querySelector('.home')).backgroundImage`)
    if (/255,\s*59,\s*48|#ff3b30/i.test(ground)) fail(`${label}: the ground is the hazard red`)
    await page.locator('.home .homep__dock button[aria-label="Menu"]').click()
    await wait(700)
    const menu = await ev(`(() => { const m = document.querySelector('.menu'); return m !== null && getComputedStyle(m).visibility !== 'hidden' && m.getBoundingClientRect().width > 0 })()`)
    if (!menu) fail(`${label}: Menu opened no menu`)
    await page.keyboard.press('Escape')
    await wait(500)

    /*
     * FIRST RUN, NO SETUP (Batch I, Section 1; Batch SIMPLE-2, Section 2): a
     * bare launch with no spot asks where, its box focused; the location once
     * offers known spots near it; one tap opens the home for that spot, and
     * "What do you do outside?" over it, one tap.
     */
    if (label === 'short tab') {
      await ctx.grantPermissions(['geolocation'])
      await ctx.setGeolocation({ latitude: 36.8441, longitude: -75.9752 })
      await ev(`(() => { localStorage.clear(); localStorage.setItem('scoutngo.landing.v1', 'true') })()`)
      await page.goto(`${APP_ORIGIN}/`)
      await wait(3500)
      const asked = await ev(`document.querySelector('.spick__title')?.textContent ?? null`)
      const focused = await ev(`document.activeElement?.classList.contains('spick__search') ?? false`)
      console.log(`  first run: ${asked}, the search box ${focused ? 'focused' : 'NOT focused'}`)
      if (asked !== 'Where do you go?') fail(`a bare first launch did not ask where you go (${JSON.stringify(asked)})`)
      if (!focused) fail('the first run\'s search box is not focused: typing would need a tap on it first')
      await page.getByRole('button', { name: 'Use my location once' }).click().catch(() => {})
      await wait(2500)
      const rows = await ev(`[...document.querySelectorAll('.spick__row .spick__name')].map((e) => e.textContent)`)
      console.log(`  spots near: ${JSON.stringify(rows)}`)
      if (!Array.isArray(rows) || rows.length === 0) fail('no known spots offered near the location')
      await page.locator('.spick__row').first().click().catch(() => {})
      await wait(5000)
      const opened = await ev(`document.querySelector('.home .homep__spotname')?.textContent ?? null`)
      console.log(`  then the home: ${opened}`)
      if (opened === null) fail('picking a spot did not open the home')
      const question = await ev(`document.querySelector('.actpick--persona .actpick__title')?.textContent ?? null`)
      const choices = await ev(`[...document.querySelectorAll('.actpick--persona [data-persona]')].map((b) => b.dataset.persona).join(' ')`)
      console.log(`  then: ${question} (${choices})`)
      if (question !== 'What do you do outside?') fail(`no "What do you do outside?" after the first spot (${JSON.stringify(question)})`)
      if (choices !== 'surf shoot fish drone weather') fail(`the choices are "${choices}", not Surf · Shoot · Fish · Drone · Just weather`)
      /* ONE tap: no Continue. */
      await page.locator('.actpick--persona [data-persona="fish"]').click().catch(() => fail('no Fish choice'))
      await wait(1500)
      const kept = await ev(`localStorage.getItem('scoutngo.persona.v1')`)
      const after = JSON.parse(await ev(`JSON.stringify({ tiles: [...document.querySelectorAll('.home .htile')].map((t) => t.dataset.tile).join(' '), pill: document.querySelector('.home .homep__pill')?.textContent ?? null, open: !!document.querySelector('.actpick--sheet') })`))
      console.log(`  one tap on Fish: kept ${kept}, ${JSON.stringify(after)}`)
      if (kept !== 'fish') fail(`the pick was kept as ${JSON.stringify(kept)}`)
      if (after.open) fail('the picker stayed open after one tap')
      if (after.tiles !== 'fish tide wind water sky surf') fail(`Fish: the tiles are "${after.tiles}", not Fish · Tide · Wind · Water · Sky · Surf`)
      if (after.pill !== 'Fish first') fail(`Fish: the pill reads ${JSON.stringify(after.pill)}`)
      await page.screenshot({ path: join(OUT, `home-fish-first-run.png`) })
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
