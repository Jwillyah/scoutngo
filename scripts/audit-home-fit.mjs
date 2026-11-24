/*
 * THE HOME NEVER SCROLLS, AND NOTHING ON IT IS COVERED (Batch Polish,
 * Section 3; Batch SIMPLE-2, Section 2: the tile home, boards Home_P_*).
 *
 * Usage:  node scripts/audit-home-fit.mjs [outDir]
 * Exits:  0 clean; 1 the home scrolls, something on it runs below the screen
 *         or under the status bar or the home bar, a part is covered or its
 *         words are cut, in any look; 2 it could not look.
 *
 * The home opened as a phone opens it (the spot saved, a bare launch), the
 * gate's fixtures behind it, at 390 x 844, 390 x 664 (Safari's bars up) and
 * 412 x 915, each in a browser tab and as the home-screen app (the notch and
 * the home bar, 47 and 34 px), and 390 x 844 at the largest text (the root
 * font at 125%), each with every persona (Surf, Shoot, Fish, Drone, Just
 * weather) and none picked. Checked, as positives (docs/failure-modes.md B, C):
 *
 *   - the parts are there: the spot, the persona pill, the Weather tile, six
 *     tiles in the persona's order (src/core/homeTiles.ts), the dock with
 *     Map and Menu and nothing else
 *   - nothing scrolls (the home and every box in it)
 *   - every part on screen, inside the safe area, and on top at its own
 *     centre (elementFromPoint is the part or inside it)
 *   - no words cut: a value, line or label wider than its box, or below its
 *     tile's foot (an hour scrolled out of the weather strip is not cut: it
 *     is off the strip's glass, and is read when on it)
 *   - Batch SIMPLE-3, Section 2.5: the weather strip holds 48 hours, shows
 *     six whole slots of one width, scrolls sideways and not up and down;
 *     once per look, a sideways wheel moves it and it lands on an hour, and
 *     a tap on an hour opens the Weather page at that hour
 */
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, devices, webkit } from './gate/playwright.mjs'
import { ensureApp, findChrome, guardAudit, startWatchdog, APP_ORIGIN } from './preflight.mjs'

guardAudit('home-fit')
const watchdog = startWatchdog('home-fit', 1_200_000)
const OUT = process.argv[2] ?? join(process.env.SCOUTNGO_OUT ?? tmpdir(), 'home-fit')
mkdirSync(OUT, { recursive: true })
await ensureApp()

const SPOT = { at: { lat: 36.8435575, lon: -75.9713104 }, name: { key: 'x', name: 'Virginia Beach Fishing Pier' }, shootKind: 'sunset', platform: 'both', reachMeters: 2000 }
const LOOKS = [
  ['iPhone tab 390x844', 'webkit', { width: 390, height: 844 }, { top: 0, bottom: 0 }, 1],
  ['iPhone tab with bars 390x664', 'webkit', { width: 390, height: 664 }, { top: 0, bottom: 0 }, 1],
  ['Android 412x915', 'chromium', { width: 412, height: 915 }, { top: 0, bottom: 0 }, 1],
  ['iPhone home screen 390x844', 'webkit', { width: 390, height: 844 }, { top: 47, bottom: 34 }, 1],
  ['iPhone home screen 390x664', 'webkit', { width: 390, height: 664 }, { top: 47, bottom: 34 }, 1],
  ['home screen 412x915', 'chromium', { width: 412, height: 915 }, { top: 47, bottom: 34 }, 1],
  ['iPhone tab, largest text', 'webkit', { width: 390, height: 844 }, { top: 0, bottom: 0 }, 1.25],
]
/* Batch SIMPLE-2, Section 2: the persona, one answer (src/lib/persona.ts); null is "Not now". The order each must draw: */
const PICKS = [
  ['Surf', 'surf', 'surf tide wind sky fish drone'],
  ['Shoot', 'shoot', 'sky drone wind tide surf fish'],
  ['Fish', 'fish', 'fish tide wind water sky surf'],
  ['Drone', 'drone', 'surf drone tide wind sky fish'],
  ['Just weather', 'weather', 'sky drone wind tide surf fish'],
  ['not picked', null, 'surf tide wind sky fish drone'],
]
/* Two clocks on 2 Nov in the fixtures' week: mid-morning, and 3 PM with the sunset coming (a moment card more likely). */
const CLOCKS = ['2026-11-02T15:30:00Z', '2026-11-02T20:00:00Z']

let problems = 0
let looked = 0
let moments = 0
let strips = 0
let taps = 0
const swiped = new Set()
const fail = (why) => {
  console.log('      PROBLEM: ' + why)
  problems += 1
}

const MEASURE = (top, bottom) => `JSON.stringify((() => {
  const home = document.querySelector('.home.homep')
  if (!home) return { missing: true }
  const cls = (e) => (e.getAttribute('class') ?? e.tagName).split(' ')[0]
  const vertical = (e) => { const s = getComputedStyle(e); return /(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 1 }
  const scrolls = [home, ...home.querySelectorAll('*')].filter(vertical).map((e) => cls(e) + ' ' + e.scrollHeight + '/' + e.clientHeight)
  const page = document.scrollingElement
  if (page && page.scrollHeight > page.clientHeight + 1) scrolls.push('the page ' + page.scrollHeight + '/' + page.clientHeight)
  const parts = [...home.querySelectorAll('.homep__spot, .homep__pill, .hmoment, .hwtile, .htile, .homep__dock button')]
  const out = { scrolls, below: [], unsafe: [], covered: [], cut: [], tiles: [...home.querySelectorAll('.htile')].map((t) => t.dataset.tile).join(' '), weather: home.querySelectorAll('.hwtile').length, dock: [...home.querySelectorAll('.homep__dock button')].map((b) => b.getAttribute('aria-label')), pill: home.querySelector('.homep__pill')?.textContent ?? null, moment: home.querySelector('.hmoment')?.textContent ?? null, parts: parts.length }
  for (const e of parts) {
    const r = e.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) { out.below.push(cls(e) + ' has no size'); continue }
    if (r.bottom > innerHeight + 1) out.below.push(cls(e) + ' ' + Math.round(r.bottom))
    if (r.top < ${top} - 1 || r.bottom > innerHeight - ${bottom} + 1) out.unsafe.push(cls(e) + ' ' + Math.round(r.top) + '-' + Math.round(r.bottom))
    const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2))
    const y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2))
    const hit = document.elementFromPoint(x, y)
    if (hit === null || (hit !== e && !e.contains(hit))) out.covered.push(cls(e) + (e.dataset.tile ? '[' + e.dataset.tile + ']' : '') + ' under ' + (hit === null ? 'nothing' : cls(hit)))
  }
  const strip = home.querySelector('.hwtile__hours')
  const sr = strip?.getBoundingClientRect() ?? null
  const onStrip = (r) => sr !== null && r.left >= sr.left - 1 && r.right <= sr.right + 1
  const hourSlots = strip === null ? [] : [...strip.querySelectorAll('.hwtile__h[data-slot="hour"]')]
  const allSlots = strip === null ? [] : [...strip.querySelectorAll('.hwtile__h')]
  out.strip = strip === null ? null : {
    hours: hourSlots.length,
    shown: allSlots.filter((e) => onStrip(e.getBoundingClientRect())).length,
    widths: [...new Set(allSlots.map((e) => Math.round(e.getBoundingClientRect().width)))],
    scrollable: strip.scrollWidth > strip.clientWidth + 1,
    overflowY: getComputedStyle(strip).overflowY,
    touch: getComputedStyle(strip).touchAction,
  }
  for (const w of home.querySelectorAll('.htile__value, .htile__line, .htile__label, .htile__tag, .hwtile__line, .hwtile__temp, .hmoment__line, .hmoment__eyebrow, .homep__pill, .hwtile__at, .hwtile__t')) {
    const st = getComputedStyle(w)
    if (st.display === 'none' || st.visibility === 'hidden') continue
    const r = w.getBoundingClientRect()
    if (r.width === 0) continue
    /* An hour scrolled off the strip's glass is not on screen to be cut. */
    if (w.closest('.hwtile__hours') !== null && !onStrip(r)) continue
    const box = w.closest('.htile, .hwtile, .hmoment, .homep__head')
    const b = box?.getBoundingClientRect()
    const wide = w.scrollWidth > w.clientWidth + 1 && st.overflowX !== 'visible' ? true : (b !== undefined && r.right > b.right + 1)
    const low = b !== undefined && r.bottom > b.bottom + 1
    if (wide || low) out.cut.push(cls(w) + ' "' + (w.textContent ?? '').trim().slice(0, 30) + '"' + (wide ? ' too wide' : ' below its tile'))
  }
  return out
})())`

const browsers = {}
try {
  for (const [label, engine, viewport, insets, textScale] of LOOKS) {
    browsers[engine] ??= engine === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: findChrome() })
    for (const [pickLabel, persona, order] of PICKS) {
      /* The three tab sizes see every persona; the home-screen and large-text looks the tallest two (Surf with its moment, Fish with Water). */
      if (!label.startsWith('iPhone tab ') && !label.startsWith('Android') && persona !== 'surf' && persona !== 'fish') continue
      if (label.includes('largest text') && persona === 'fish') continue
      for (const clock of persona === 'surf' || persona === 'shoot' ? CLOCKS : CLOCKS.slice(0, 1)) {
        const name = `${label}, ${pickLabel}${clock === CLOCKS[0] ? '' : ', 3 PM'}`
        const ctx = await browsers[engine].newContext({ ...(engine === 'webkit' ? devices['iPhone 13'] : devices['Pixel 7']), viewport, serviceWorkers: 'block' })
        await ctx.addInitScript(([spot, top, bottom, p, scale]) => {
          /* A phone's open: the home first (src/lib/briefingOpen.ts reads webdriver as "not a person"). */
          Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false })
          try {
            localStorage.setItem('scoutngo.landing.v1', 'true')
            localStorage.setItem('scoutngo.nearMe.v1', 'off')
            if (p === null) localStorage.removeItem('scoutngo.persona.v1')
            else localStorage.setItem('scoutngo.persona.v1', p)
            if (!localStorage.getItem('scoutngo.lastSetup.v1')) localStorage.setItem('scoutngo.lastSetup.v1', JSON.stringify(spot))
          } catch {
            /* about:blank */
          }
          const add = () => {
            const s = document.createElement('style')
            s.textContent = `:root{--safe-top:${top}px!important;--safe-bottom:${bottom}px!important}${scale === 1 ? '' : `html{font-size:${scale * 100}%!important}`}`
            document.head.appendChild(s)
          }
          if (document.head) add()
          else document.addEventListener('DOMContentLoaded', add)
        }, [SPOT, insets.top, insets.bottom, persona, textScale])
        const page = await ctx.newPage()
        await page.clock.install({ time: new Date(clock) })
        await page.clock.resume()
        await page.goto(`${APP_ORIGIN}/`)
        let m = null
        for (let i = 0; i < 40; i += 1) {
          await page.waitForTimeout(250)
          m = JSON.parse(await page.evaluate(MEASURE(insets.top, insets.bottom)))
          if (!m.missing && m.parts > 0) break
        }
        /* The forecast's answers settle the tiles' words. */
        await page.waitForTimeout(4000)
        m = JSON.parse(await page.evaluate(MEASURE(insets.top, insets.bottom)))
        watchdog.note(name)
        if (m.missing) {
          fail(`${name}: no home on screen`)
          await ctx.close()
          continue
        }
        looked += 1
        if (m.moment !== null) moments += 1
        console.log(`  ${name}: ${m.tiles}${m.moment === null ? '' : ` · moment "${m.moment.replace(/›$/, '').trim()}"`}${m.scrolls.length === 0 ? ', no scroll' : `, SCROLLS ${m.scrolls.join(', ')}`}`)
        if (m.tiles !== order) fail(`${name}: the tiles are "${m.tiles}", not "${order}"`)
        if (m.weather !== 1) fail(`${name}: ${m.weather} Weather tiles, not 1`)
        if (JSON.stringify(m.dock) !== JSON.stringify(['Open the map', 'Menu'])) fail(`${name}: the dock is ${JSON.stringify(m.dock)}, not Map and Menu alone`)
        if (m.pill === null || m.pill.trim() === '') fail(`${name}: no persona pill`)
        for (const x of m.scrolls) fail(`${name}: ${x} scrolls`)
        for (const x of m.below) fail(`${name}: below the screen's foot: ${x}`)
        for (const x of m.unsafe) fail(`${name}: outside the safe area (${insets.top}/${insets.bottom}): ${x}`)
        for (const x of m.covered) fail(`${name}: covered: ${x}`)
        for (const x of m.cut) fail(`${name}: words cut: ${x}`)
        /* Batch SIMPLE-3, Section 2.5: the strip. */
        const s = m.strip
        if (s === null) fail(`${name}: no hourly strip on the Weather tile`)
        else {
          strips += 1
          if (s.hours !== 48) fail(`${name}: the strip holds ${s.hours} hours, not 48`)
          if (s.shown < 6) fail(`${name}: ${s.shown} whole slots on show, not 6 (squashed or cut)`)
          if (s.widths.length !== 1) fail(`${name}: the strip's slots are not one width (${s.widths.join(', ')} px)`)
          if (!s.scrollable) fail(`${name}: the strip does not scroll sideways`)
          if (s.overflowY !== 'hidden') fail(`${name}: the strip can scroll up and down (overflow-y ${s.overflowY})`)
          if (s.touch !== 'pan-x') fail(`${name}: the strip's touch-action is ${s.touch}, not pan-x (a vertical drag must be the page's)`)
        }
        await page.screenshot({ path: join(OUT, `${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`) })
        if (s !== null && !swiped.has(label)) {
          swiped.add(label)
          const box = await page.locator('.home .hwtile__hours').boundingBox()
          if (box !== null) {
            /* Mobile WebKit has no wheel, and a touch drag cannot be sent: the strip is scrolled by script, which still fails when it holds nothing to scroll. */
            await page.evaluate(`document.querySelector('.home .hwtile__hours').scrollBy({ left: 150, behavior: 'instant' })`)
            await page.waitForTimeout(900)
            const moved = JSON.parse(await page.evaluate(`JSON.stringify((() => { const el = document.querySelector('.home .hwtile__hours'); const w = el.querySelector('.hwtile__h').getBoundingClientRect().width; return { left: el.scrollLeft, w } })())`))
            console.log(`    strip: sideways scroll moved it ${Math.round(moved.left)} px (slot ${Math.round(moved.w)} px)`)
            if (moved.left < 1) fail(`${name}: a sideways scroll of the strip did not move it`)
            /* A tap on the 4th hour slot opens the Weather page at that hour. */
            const want = await page.evaluate(`document.querySelectorAll('.home .hwtile__h[data-slot="hour"]')[4]?.dataset.at ?? null`)
            await page.locator('.home .hwtile__h[data-slot="hour"]').nth(4).click({ timeout: 3000 }).catch(() => {})
            await page.waitForTimeout(2500)
            const got = await page.evaluate(`document.querySelector('[data-weather-at]')?.dataset.weatherAt ?? null`)
            console.log(`    tap on hour ${want}: the Weather page at ${got}`)
            if (got === null || got !== want) fail(`${name}: a tap on an hour of the strip did not open the Weather page at it (wanted ${want}, got ${got})`)
            else taps += 1
          }
        }
        await ctx.close()
      }
    }
  }
} finally {
  for (const b of Object.values(browsers)) await b.close()
}

if (looked === 0) {
  console.log('\n=== HOME FIT AUDIT ABORTED: looked at nothing ===')
  process.exit(2)
}
if (strips === 0 || taps === 0) {
  console.log(`\n=== HOME FIT AUDIT ABORTED: ${strips} strips read, ${taps} taps opened the Weather page at an hour ===`)
  process.exit(2)
}
console.log(`\n=== HOME FIT PROBLEMS: ${problems} (${looked} looks, ${moments} with a moment card, ${strips} strips, ${taps} hour taps) ===`)
watchdog.stop()
process.exit(problems === 0 ? 0 : 1)
