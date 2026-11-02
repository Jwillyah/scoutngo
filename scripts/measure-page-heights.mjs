/*
 * HOW TALL EACH PAGE IS, AT 390 x 844 (Batch I, Section 3: "no page taller
 * than the screen unless it is a list the user asked for").
 *
 * Usage:  node scripts/measure-page-heights.mjs <label> [dist]
 * Writes: measurements/<today>-page-heights-<label>.md
 *
 * The built app (dist/, or the one given) on the gate's server behind its
 * fixture proxy (scripts/gate/server.mjs), WebKit as an iPhone 13 at 390 x
 * 844 with the home-screen insets, the Virginia Beach pier at 6:11 AM EST on
 * 2 Nov with a drone in the kit. Sky fire's eight points and Special light's
 * week answered from the kept 2 Nov fixtures (tests/data), the rest by
 * scripts/openMeteoFake.mjs, so each page is measured with its content. Each page opened the way a person opens it,
 * and its content's full height measured: the sheet's body for the Sky tabs
 * (at full) and Preflight, the page for Surf, Tides, Wind and Buoys. The
 * screen is the height the content has to fit in.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { OPEN_METEO, fakeAnswer } from './openMeteoFake.mjs'
import { webkit, devices } from 'playwright'
import { goToStage } from './preflight.mjs'
import { shareLink } from '../src/lib/planShare.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'
import { placeKey } from '../src/core/venueName.ts'

const label = process.argv[2] ?? 'now'
const DIST = process.argv[3] ?? 'dist'
const PORT = 5198
const server = spawn(process.execPath, ['scripts/gate/server.mjs'], { env: { ...process.env, SCOUTNGO_GATE_DIST: DIST, SCOUTNGO_GATE_APP_PORT: String(PORT), SCOUTNGO_GATE_PROXY_PORT: String(PORT + 1) }, stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 2500))
const APP = `http://127.0.0.1:${PORT}`
const PIER = { lat: 36.8435575, lon: -75.9713104 }
const venue = { ...CALIBRATION_VENUE, name: { key: placeKey(String(PIER.lat), String(PIER.lon)), name: 'Virginia Beach Fishing Pier' }, latitude: String(PIER.lat), longitude: String(PIER.lon), date: '2026-11-02', startTime: '06:00', endTime: '08:00' }
const url = await shareLink(`${APP}/`, { id: 'h', name: 'Heights', savedAt: '2026-10-29T00:00:00Z', venue, kit: { bodyIds: ['a7iv'], lensIds: ['sigma-28-75'], droneIds: ['dji-air-3s'], styleNotes: '' }, positions: [] })

const browser = await webkit.launch({ proxy: { server: `http://127.0.0.1:${PORT + 1}`, bypass: '127.0.0.1' } })
const rows = []
const PAGES = [
  ['Sky › Now', 'sky', 'Now'],
  ['Sky › Sky fire', 'sky', 'Sky fire'],
  ['Sky › Special', 'sky', 'Special'],
  ['Water › Surf', 'water', 'Surf'],
  ['Water › Tides', 'water', 'Tides'],
  ['Water › Wind', 'water', 'Wind'],
  ['Water › Buoys', 'water', 'Buoys'],
  ['Drone › Preflight', 'drone', null],
]
try {
  for (const [name, card, tab] of PAGES) {
    const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem('scoutngo.landing.v1', 'true')
        localStorage.setItem('scoutngo.nearMe.v1', 'off')
      } catch {
        /* about:blank */
      }
      const add = () => {
        const s = document.createElement('style')
        s.textContent = ':root{--safe-top:47px!important;--safe-bottom:34px!important}'
        document.head.appendChild(s)
      }
      if (document.head) add()
      else document.addEventListener('DOMContentLoaded', add)
    })
    const FIRE = JSON.parse(readFileSync('tests/data/sky-fire-2026-11-02-sunrise.json', 'utf8'))
    const SPEC = JSON.parse(readFileSync('tests/data/special-2026-11-02.json', 'utf8'))
    await ctx.route(OPEN_METEO, (rt) => {
      const u = new URL(rt.request().url())
      if ((u.searchParams.get('models') ?? '').includes('gem_seamless') && (u.searchParams.get('latitude') ?? '').split(',').length === 8) return rt.fulfill({ json: FIRE.payload })
      if ((u.searchParams.get('hourly') ?? '').includes('showers')) return rt.fulfill({ json: SPEC.week })
      if (u.searchParams.get('hourly') === 'cloud_cover_mid,cloud_cover_high') return rt.fulfill({ json: SPEC.thin })
      return rt.fulfill({ json: fakeAnswer(rt.request().url(), new Date('2026-11-02T11:11:00Z')) })
    })
    const page = await ctx.newPage()
    await page.clock.install({ time: new Date('2026-11-02T11:11:00Z') })
    await page.clock.resume()
    const wait = (ms) => page.waitForTimeout(ms)
    const ev = (x) => page.evaluate(x)
    await page.goto(url)
    await wait(3000)
    await page.getByRole('button', { name: /^open$/i }).click({ timeout: 3000 }).catch(() => {})
    await goToStage(ev, wait, 'plan').catch(() => {})
    await wait(1200)
    await page.locator('button[aria-label="Menu"]').first().click()
    await wait(900)
    await page.locator(`.mcard--${card}`).first().click()
    await wait(2500)
    if (tab !== null) {
      await page.getByRole('tab', { name: tab, exact: true }).first().click().catch(() => {})
      await ev(`[...document.querySelectorAll('.page__tabs button, .pgroup button, [role=tab]')].find((b) => b.textContent.trim() === ${JSON.stringify(tab)})?.click()`)
      await wait(card === 'sky' ? 6000 : 3000)
    }
    for (let i = 0; i < 3 && card !== 'water' && (await ev(`document.querySelector('.sheet')?.dataset.detent`)) !== 'full'; i += 1) {
      await ev(`document.querySelector('.sheet__handle')?.click()`)
      await wait(700)
    }
    /* Wait for the page's own answer: the verdict, the list, the card's body. */
    /* Until no new text arrives for 2 s: the forecasts landed. */
    let last = ''
    for (let quiet = 0, i = 0; quiet < 4 && i < 40; i += 1) {
      await wait(500)
      const now = await ev(`(document.querySelector('.page') ?? document.querySelector('.sheet'))?.innerText.length ?? 0`)
      quiet = String(now) === last ? quiet + 1 : 0
      last = String(now)
    }
    /* The element that scrolls: the tallest scrollable box in the page or the sheet. */
    const m = await ev(`(() => {
      const root = document.querySelector('.page') ?? document.querySelector('.sheet')
      if (!root) return null
      const boxes = [root, ...root.querySelectorAll('*')].filter((e) => { const s = getComputedStyle(e); return /(auto|scroll)/.test(s.overflowY) && e.clientHeight > 100 })
      const el = boxes.sort((a, b) => b.scrollHeight - a.scrollHeight)[0] ?? root
      return { content: Math.round(el.scrollHeight), box: Math.round(el.clientHeight), detent: document.querySelector('.sheet')?.dataset.detent ?? null, cls: String(el.className).split(' ')[0] }
    })()`)
    rows.push(m === null ? `| ${name} | not found | | |` : `| ${name} | ${m.content} | ${m.box} | ${(m.content / m.box).toFixed(2)} |`)
    console.log(name, JSON.stringify(m))
    await ctx.close()
  }
} finally {
  await browser.close()
  server.kill()
}
const ran = new Date().toISOString()
const lines = [
  `# Page heights, ${label}`,
  '',
  `Run ${ran} · node scripts/measure-page-heights.mjs ${label} ${DIST} · WebKit iPhone 13, 390 x 844, home-screen insets · VB pier, page clock 2026-11-02T11:11Z · the gate's fixtures.`,
  '',
  'Content is the scrolling box\'s full height in px; the box is what shows of it; screens is how many boxes tall the content is (1.00 fits).',
  '',
  '| Page | Content | Box | Screens |',
  '|---|---|---|---|',
  ...rows,
  '',
]
mkdirSync('measurements', { recursive: true })
const file = `measurements/${ran.slice(0, 10)}-page-heights-${label}.md`
writeFileSync(file, lines.join('\n'))
console.log(`wrote ${file}`)
process.exit(0)
