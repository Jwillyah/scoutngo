/*
 * THE HOME NEVER SCROLLS (Batch Polish, Section 3).
 *
 * Usage:  node scripts/audit-home-fit.mjs [outDir]
 * Exits:  0 clean; 1 the home scrolls, or something on it runs below the
 *         screen, in any look; 2 it could not look.
 *
 * The home opened as a phone opens it (the spot saved, a bare launch), the
 * gate's fixtures behind it, at:
 *
 *   iPhone tab 390 x 844 · iPhone tab with Safari's bars 390 x 664 ·
 *   iPhone home screen 390 x 844 (the notch and the home bar) · Android
 *   412 x 915 · iPhone tab at the largest text (the root font at 125%, the
 *   browser's stand-in for the phone's text size setting)
 *
 * each with 1, 3 and all 5 activities picked (the six-card layout), and
 * Weather alone (the weather-only home). Checked:
 * the home's own box and every box in it that scrolls up and down
 * (scrollHeight against clientHeight); nothing drawn below the screen's
 * foot. The day pager scrolls sideways by design and is not counted.
 */
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, devices, webkit } from './gate/playwright.mjs'
import { ensureApp, findChrome, guardAudit, startWatchdog, APP_ORIGIN } from './preflight.mjs'

guardAudit('home-fit')
const watchdog = startWatchdog('home-fit', 900_000)
const OUT = process.argv[2] ?? join(process.env.SCOUTNGO_OUT ?? tmpdir(), 'home-fit')
mkdirSync(OUT, { recursive: true })
await ensureApp()

const SPOT = { at: { lat: 36.8435575, lon: -75.9713104 }, name: { key: 'x', name: 'Virginia Beach Fishing Pier' }, shootKind: 'sunset', platform: 'both', reachMeters: 2000 }
const LOOKS = [
  ['iPhone tab 390x844', 'webkit', { width: 390, height: 844 }, { top: 0, bottom: 0 }, 1],
  ['iPhone tab with bars 390x664', 'webkit', { width: 390, height: 664 }, { top: 0, bottom: 0 }, 1],
  ['iPhone home screen 390x844', 'webkit', { width: 390, height: 844 }, { top: 47, bottom: 34 }, 1],
  ['Android 412x915', 'chromium', { width: 412, height: 915 }, { top: 0, bottom: 0 }, 1],
  ['iPhone tab, largest text', 'webkit', { width: 390, height: 844 }, { top: 0, bottom: 0 }, 1.25],
]
const PICKS = [
  ['1 activity', ['surf']],
  ['3 activities', ['surf', 'shoot', 'drone']],
  ['all 5', ['surf', 'shoot', 'drone', 'fish', 'weather']],
  /* Batch Polish 2, Section 2: the weather-only home (src/components/WeatherHome.tsx). */
  ['weather only', ['weather']],
]

let problems = 0
let looked = 0
const fail = (why) => {
  console.log('      PROBLEM: ' + why)
  problems += 1
}

const MEASURE = `JSON.stringify((() => {
  const home = document.querySelector('.home')
  if (!home) return { missing: true }
  const vertical = (e) => { const s = getComputedStyle(e); return /(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 1 }
  const boxes = [home, ...home.querySelectorAll('*')].filter(vertical)
  const scrolls = boxes.map((e) => (e.getAttribute('class') ?? e.tagName).split(' ')[0] + ' ' + e.scrollHeight + '/' + e.clientHeight)
  const page = document.scrollingElement
  if (page && page.scrollHeight > page.clientHeight + 1) scrolls.push('the page ' + page.scrollHeight + '/' + page.clientHeight)
  const today = home.querySelector('.home__page[aria-label="Today"]') ?? home
  const below = [...today.querySelectorAll('button, a, .hcard, p, span')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > innerHeight + 1 }).map((e) => (e.getAttribute('class') ?? e.tagName).split(' ')[0] + ' ' + Math.round(e.getBoundingClientRect().bottom)).slice(0, 4)
  /*
   * Batch NOW, Section 3.2: no chart word on another, every chart, every look.
   * The words drawn in each chart box (gridline numbers, the peak's bubble and
   * dot, the time ticks); any two sharing more than a pixel each way.
   */
  const hits = []
  for (const box of today.querySelectorAll('.hcard__chartbox')) {
    const card = (box.closest('.hcard')?.getAttribute('class') ?? '').split(' ').find((c) => /^hcard--/.test(c) && !/--(small|wide)$/.test(c)) ?? 'hcard'
    const words = [...box.querySelectorAll('.hcard__gl, .hcard__peaklabel, .hcard__peakdot, .hcard__ticks > span')].filter((e) => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return s.visibility !== 'hidden' && s.display !== 'none' && r.width > 0 && r.height > 0 })
    for (let i = 0; i < words.length; i += 1) for (let j = i + 1; j < words.length; j += 1) {
      const a = words[i].getBoundingClientRect()
      const b = words[j].getBoundingClientRect()
      const same = words[i].closest('.hcard__peak') !== null && words[i].closest('.hcard__peak') === words[j].closest('.hcard__peak')
      if (!same && a.right - 1 > b.left && b.right - 1 > a.left && a.bottom - 1 > b.top && b.bottom - 1 > a.top) hits.push(card + ': "' + words[i].textContent.trim() + '" on "' + words[j].textContent.trim() + '"')
    }
    /*
     * Batch LIVE, Section 4.2 (14 Nov: the drone card's "22 kt" on its line):
     * a value bubble on none of the chart's drawn lines (the data line, the
     * drone's rated wind), each sampled along its length on screen; the now
     * marker is a guide, as the gridlines are, and a bubble may cross it.
     */
    const bubbles = [...box.querySelectorAll('.hcard__peaklabel')].filter((e) => { const s = getComputedStyle(e); return s.visibility !== 'hidden' && s.display !== 'none' })
    for (const el of box.querySelectorAll('svg .hcard__line, svg .hcard__rated')) {
      let m = null
      let len = 0
      try {
        m = el.getScreenCTM()
        if (m === null || typeof el.getTotalLength !== 'function' || el.getClientRects().length === 0) continue
        len = el.getTotalLength()
      } catch {
        continue
      }
      const n = Math.max(2, Math.min(240, Math.round(len / 2)))
      for (const bub of bubbles) {
        const r = bub.getBoundingClientRect()
        for (let k = 0; k <= n; k += 1) {
          const p = el.getPointAtLength((len * k) / n)
          const x = m.a * p.x + m.c * p.y + m.e
          const y = m.b * p.x + m.d * p.y + m.f
          if (x > r.left + 1 && x < r.right - 1 && y > r.top + 1 && y < r.bottom - 1) {
            hits.push(card + ': "' + bub.textContent.trim() + '" on its ' + ((el.getAttribute('class') ?? '').split(' ').pop() ?? 'line'))
            break
          }
        }
      }
    }
  }
  return { scrolls, below, hits, cards: today.querySelectorAll('.hcard, .hwh__tile').length, vh: innerHeight }
})())`

const browsers = {}
try {
  for (const [label, engine, viewport, insets, textScale] of LOOKS) {
    browsers[engine] ??= engine === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: findChrome() })
    for (const [pickLabel, picked] of PICKS) {
      const name = `${label}, ${pickLabel}`
      const ctx = await browsers[engine].newContext({ ...(engine === 'webkit' ? devices['iPhone 13'] : devices['Pixel 7']), viewport, serviceWorkers: 'block' })
      await ctx.addInitScript(([spot, top, bottom, picks, scale]) => {
        /* A phone's open: the home first (src/lib/briefingOpen.ts reads webdriver as "not a person"). */
        Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false })
        try {
          localStorage.setItem('scoutngo.landing.v1', 'true')
          localStorage.setItem('scoutngo.nearMe.v1', 'off')
          localStorage.setItem('scoutngo.activities.v1', JSON.stringify(picks))
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
      }, [SPOT, insets.top, insets.bottom, picked, textScale])
      const page = await ctx.newPage()
      await page.clock.install({ time: new Date('2026-11-02T15:30:00Z') })
      await page.clock.resume()
      await page.goto(`${APP_ORIGIN}/`)
      let m = null
      for (let i = 0; i < 40; i += 1) {
        await page.waitForTimeout(250)
        m = JSON.parse(await page.evaluate(MEASURE))
        if (!m.missing && m.cards > 0) break
      }
      /* The forecast's answers settle the cards' heights. */
      await page.waitForTimeout(4000)
      m = JSON.parse(await page.evaluate(MEASURE))
      watchdog.note(name)
      if (m.missing) {
        fail(`${name}: no home on screen`)
        await ctx.close()
        continue
      }
      looked += 1
      console.log(`  ${name}: ${m.cards} cards, ${m.scrolls.length === 0 ? 'no scroll' : `SCROLLS ${m.scrolls.join(', ')}`}${m.below.length === 0 ? '' : `, below the screen: ${m.below.join(', ')}`}`)
      for (const x of m.scrolls) fail(`${name}: ${x} scrolls`)
      if (m.below.length > 0) fail(`${name}: drawn below the screen's foot (${m.below.join(', ')})`)
      for (const h of m.hits) fail(`${name}: a chart's words on each other: ${h}`)
      await page.screenshot({ path: join(OUT, `${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`) })
      await ctx.close()
    }
  }
} finally {
  for (const b of Object.values(browsers)) await b.close()
}

if (looked === 0) {
  console.log('\n=== HOME FIT AUDIT ABORTED: looked at nothing ===')
  process.exit(2)
}
console.log(`\n=== HOME FIT PROBLEMS: ${problems} (${looked} looks) ===`)
watchdog.stop()
process.exit(problems === 0 ? 0 : 1)
