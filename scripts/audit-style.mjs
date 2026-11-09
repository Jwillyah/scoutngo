/*
 * ONE SCOUTNGO STYLE (Batch Map, Section 0; board docs/mockups/StyleGuide.png),
 * IN WEBKIT.
 *
 * Usage:  node scripts/audit-style.mjs [screenshot-dir]
 *
 * Opens every screen the board names and reads each visible element's
 * computed style. A problem is:
 *
 *   mono     any text in a monospace face (the board: Archivo only)
 *   square   a button with a fill or an edge whose corners are not round:
 *            an icon button that is not a circle, a text button that is not
 *            a pill (rows wider than 60% of the screen are list rows, not
 *            buttons, and are not counted)
 *   black    a sheet, page or dialog on a near-black ground (the board: the
 *            sky gradient, never black)
 *   colour   a text, fill or edge colour that is not in the token set
 *            (src/styles/tokens.css, every hex in it, and white or black at
 *            any opacity)
 *
 * The map's own canvas, imagery and drawn overlays are the map, not chrome,
 * and are not read. A screenshot of each screen goes to the out directory;
 * scripts/contact-sheet.mjs puts them side by side.
 */
import { mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, webkit, devices } from './gate/playwright.mjs'
import { ensureApp, findChrome, goToStage, guardAudit, startWatchdog, APP_ORIGIN } from './preflight.mjs'
import { shareLink } from '../src/lib/planShare.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'
import { placeKey } from '../src/core/venueName.ts'

guardAudit('style')
const watchdog = startWatchdog('style', 600_000)
const OUT = process.argv[2] ?? join(process.env.SCOUTNGO_OUT ?? tmpdir(), 'style')
mkdirSync(OUT, { recursive: true })

/* The token set: every hex in tokens.css, six digits, lower case. */
const hex6 = (h) => {
  const x = h.slice(1).toLowerCase()
  return x.length === 3 ? [...x].map((c) => c + c).join('') : x.slice(0, 6)
}
const TOKENS = new Set([...readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8').matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => hex6(m[0])))
TOKENS.add('ffffff')
TOKENS.add('000000')

const PIER = { lat: 36.8435575, lon: -75.9713104 }
await ensureApp()
const venue = { ...CALIBRATION_VENUE, name: { key: placeKey(String(PIER.lat), String(PIER.lon)), name: 'Virginia Beach Fishing Pier' }, latitude: String(PIER.lat), longitude: String(PIER.lon), date: '2026-11-02', startTime: '09:00', endTime: '11:00' }
const url = await shareLink(`${APP_ORIGIN}/`, { id: 'style', name: 'Style check', savedAt: '2026-10-29T00:00:00Z', venue, kit: { bodyIds: [], lensIds: [], droneIds: ['dji-air-3s'], styleNotes: '' }, positions: [] })

const READ = (tokens) => `JSON.stringify((() => {
  const TOKENS = new Set(${JSON.stringify(tokens)})
  const MONO = /monospace|menlo|sf ?mono|consolas|courier|liberation mono/i
  const name = (e) => (e.getAttribute('class') ?? e.tagName.toLowerCase()).split(' ')[0] + (e.getAttribute('aria-label') ? ' "' + e.getAttribute('aria-label').slice(0, 24) + '"' : '')
  const rgb = (c) => { const m = /rgba?\\(([\\d.]+)[ ,]+([\\d.]+)[ ,]+([\\d.]+)(?:[ ,/]+([\\d.]+))?/.exec(c); return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null }
  const hex = (c) => [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
  const lum = (c) => (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255
  const vis = (e, b, st) => b.width > 0 && b.height > 0 && st.visibility !== 'hidden' && st.display !== 'none' && b.bottom > 0 && b.top < innerHeight && b.right > 0 && b.left < innerWidth && Number(st.opacity) > 0.05
  const out = { mono: new Set(), square: new Set(), black: new Set(), colour: {} }
  const off = (where, c) => { if (c === null || c.a < 0.05) return; const h = hex(c); if (TOKENS.has(h)) return; if ((c.r === c.g && c.g === c.b) && (c.r === 255 || c.r === 0)) return; (out.colour[h] ??= new Set()).add(where) }
  /* The screen on top: the last open page, sheet or dialog that covers half the screen; else everything. */
  const tops = [...document.querySelectorAll('[role="dialog"]')].filter((d) => { const b = d.getBoundingClientRect(); return b.height > innerHeight * 0.5 && getComputedStyle(d).display !== 'none' })
  const root = tops.at(-1) ?? document.body
  for (const e of root.querySelectorAll('*')) {
    if (e.closest('canvas, .maplibregl-canvas-container, .maplibregl-marker, svg:not(:root) *, [data-map-art], .netdebug')) continue
    if (e.tagName === 'svg' || e.tagName === 'CANVAS' || e.tagName === 'IMG' || e.tagName === 'VIDEO') continue
    const b = e.getBoundingClientRect()
    const st = getComputedStyle(e)
    if (!vis(e, b, st)) continue
    const text = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim() !== '')
    if (text && MONO.test(st.fontFamily)) out.mono.add(name(e))
    if (text) off(name(e) + ' text', rgb(st.color))
    const bg = rgb(st.backgroundColor)
    if (bg !== null && bg.a >= 0.05) off(name(e) + ' fill', bg)
    if (parseFloat(st.borderTopWidth) > 0) off(name(e) + ' edge', rgb(st.borderTopColor))
    const isButton = e.tagName === 'BUTTON' || e.getAttribute('role') === 'button'
    if (isButton && b.width < innerWidth * 0.6) {
      const filled = (bg !== null && bg.a >= 0.05) || st.backgroundImage !== 'none' || parseFloat(st.borderTopWidth) > 0
      const r = parseFloat(st.borderTopLeftRadius)
      /* A tappable card or tile (50 px and taller: the Map sheet's weather tiles) is glass with round corners, 14 px at least; anything smaller is a circle or a pill. */
      const card = b.height >= 50
      if (filled && b.height >= 24 && (card ? r < 14 : r < Math.min(b.width, b.height) / 2 - 2)) out.square.add(name(e) + ' ' + Math.round(b.width) + 'x' + Math.round(b.height) + ' r' + Math.round(r))
    }
    /* Batch MAP2, Section 3: any surface covering most of the screen, not only a dialog or a sheet (the Viewfinder's start was black and passed). */
    const sheet = e.getAttribute('role') === 'dialog' || /(^|[ _-])(sheet|page|dialog)( |$|__body$)/.test(e.getAttribute('class') ?? '') || (b.width > innerWidth * 0.8 && b.height > innerHeight * 0.5)
    if (sheet && b.height > innerHeight * 0.25 && st.backgroundImage === 'none' && bg !== null && bg.a > 0.6 && lum(bg) < 0.12) out.black.add(name(e) + ' ' + hex(bg))
  }
  return { mono: [...out.mono], square: [...out.square], black: [...out.black], colour: Object.fromEntries(Object.entries(out.colour).map(([k, v]) => [k, [...v].slice(0, 3)])) }
})())`

let problems = 0
const totals = { mono: 0, square: 0, black: 0, colour: 0 }
const report = []
const browser = await webkit.launch()
try {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } })
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('scoutngo.landing.v1', 'true')
    } catch {
      /* about:blank */
    }
    /* Batch MAP2, Section 3: a stand-in camera (a drawn picture) so the Viewfinder's own controls are on screen to read. */
    const fake = () => {
      const c = document.createElement('canvas')
      c.width = 640
      c.height = 480
      const g = c.getContext('2d')
      const draw = () => {
        g.fillStyle = '#5c8cc0'
        g.fillRect(0, 0, 640, 240)
        g.fillStyle = '#2f5a92'
        g.fillRect(0, 240, 640, 240)
      }
      draw()
      setInterval(draw, 200)
      return typeof c.captureStream === 'function' ? c.captureStream(10) : new MediaStream()
    }
    const devices = { getUserMedia: async () => fake(), enumerateDevices: async () => [] }
    try {
      if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = devices.getUserMedia
      else Object.defineProperty(Navigator.prototype, 'mediaDevices', { get: () => devices, configurable: true })
    } catch {
      Object.defineProperty(Navigator.prototype, 'mediaDevices', { get: () => devices, configurable: true })
    }
  })
  let page = await ctx.newPage()
  await page.clock.setFixedTime(new Date('2026-11-02T15:30:00Z'))
  const wait = (ms) => page.waitForTimeout(ms)
  const ev = (x) => page.evaluate(x)
  const tap = async (sel, label) => {
    const ok = await page.locator(sel).first().click({ timeout: 4000 }).then(() => true, () => false)
    if (!ok) console.log(`  (could not open ${label}: ${sel})`)
    await wait(1500)
    return ok
  }
  const look = async (screen) => {
    await wait(800)
    const r = JSON.parse(await ev(READ([...TOKENS])))
    await page.screenshot({ path: join(OUT, `${screen.replace(/\W+/g, '-')}.png`) })
    const colours = Object.keys(r.colour).length
    console.log(`\n### ${screen}: mono ${r.mono.length} · square ${r.square.length} · black ${r.black.length} · colours outside the set ${colours}`)
    for (const m of r.mono.slice(0, 6)) console.log(`      PROBLEM mono: ${m}`)
    for (const s of r.square.slice(0, 6)) console.log(`      PROBLEM square: ${s}`)
    for (const s of r.black) console.log(`      PROBLEM black: ${s}`)
    for (const [h, w] of Object.entries(r.colour).slice(0, 8)) console.log(`      PROBLEM colour #${h}: ${w.join(', ')}`)
    totals.mono += r.mono.length
    totals.square += r.square.length
    totals.black += r.black.length
    totals.colour += colours
    report.push({ screen, mono: r.mono.length, square: r.square.length, black: r.black.length, colour: colours })
  }

  const closeAll = async () => {
    for (let i = 0; i < 3; i += 1) {
      const x = page.locator('button[aria-label="Close the menu"], .card2__x, button[aria-label="Close"], .page__back, button[aria-label="Back"]').first()
      if (!(await x.isVisible().catch(() => false))) break
      await x.click({ timeout: 2000 }).catch(() => {})
      await wait(700)
    }
  }
  await page.goto(url)
  await wait(4000)
  await page.getByRole('button', { name: /^open$/i }).click({ timeout: 4000 }).catch(() => {})
  await goToStage(ev, wait, 'plan')
  await wait(2500)
  await look('map')
  if (await tap('button[aria-label="Features"]', 'Features')) await look('features sheet')
  await closeAll()

  await tap('button[aria-label="Menu"]', 'menu')
  await wait(3000)
  await look('menu')
  for (const [what, screen] of [['.mcard--sky', 'sky color'], ['.mcard--drone', 'preflight']]) {
    if (await tap(`nav[aria-label="Stage"] ${what}`, screen)) await look(screen)
    await closeAll()
    await tap('button[aria-label="Menu"]', 'menu')
  }
  if (await tap('nav[aria-label="Stage"] .mrow:has-text("Settings")', 'settings')) {
    await look('settings')
    /* Batch MAP2, Section 3: About (the version line) and Privacy (What leaves my phone), from Settings. */
    if (await tap('.set2__version', 'about')) {
      await look('about')
      await closeAll()
    }
    await tap('button[aria-label="Menu"]', 'menu')
    await tap('nav[aria-label="Stage"] .mrow:has-text("Settings")', 'settings')
    if (await tap('.set2__row:has-text("What leaves my phone")', 'privacy')) {
      await look('privacy')
      await closeAll()
    }
    await closeAll()
  }
  /* Privacy is a route of its own: back to the plan, fresh, before the rest. */
  await page.goto(url)
  await wait(3500)
  await page.getByRole('button', { name: /^open$/i }).click({ timeout: 4000 }).catch(() => {})
  await goToStage(ev, wait, 'plan')
  await wait(2000)
  await tap('button[aria-label="Menu"]', 'menu')
  if (await tap('nav[aria-label="Stage"] .mcard--today', 'home')) {
    await wait(2500)
    await look('home')
    if (await tap('.home__page[aria-label="Today"] .hcard--surf', 'surf page')) {
      await wait(2500)
      await look('surf page')
      for (const tab of ['Tide', 'Wind', 'Buoys']) {
        if (await tap(`.dpage__tab:has-text("${tab}")`, `${tab} page`)) {
          await wait(2500)
          await look(`${tab.toLowerCase()} page`)
        }
      }
    }
  }
  /* Last in WebKit: the drone view is kept across a reload, so nothing is looked at after it. Back from the detail page and the home to the map first (both are kept too). */
  await tap('.dpage__back', 'back')
  await tap('.home .hbtn--round[aria-label="Open the map"]', 'the map')
  await tap('button[aria-label="Menu"]:visible', 'menu')
  /* The drone view's HUD: Preflight › Fly it yourself. */
  if (await tap('nav[aria-label="Stage"] .mcard--drone', 'preflight')) {
    if (await tap('.pf button:has-text("Fly it yourself")', 'drone view')) {
      await wait(3000)
      await look('drone view hud')
    }
  }
  await ctx.close()

  /*
   * THE VIEWFINDER'S CONTROLS (Batch MAP2, Section 3), in Chromium with its
   * own fake camera (--use-fake-device-for-media-stream): WebKit has no
   * stand-in camera to give it. Its start screen, then the controls over the
   * picture.
   */
  const chrome = await chromium.launch({ executablePath: findChrome(), args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] })
  try {
    const cctx = await chrome.newContext({ ...devices['Pixel 7'], viewport: { width: 412, height: 915 }, permissions: ['camera'] })
    await cctx.addInitScript(() => {
      try {
        localStorage.setItem('scoutngo.landing.v1', 'true')
      } catch {
        /* about:blank */
      }
    })
    const cp = await cctx.newPage()
    await cp.clock.setFixedTime(new Date('2026-11-02T15:30:00Z'))
    await cp.goto(url)
    await cp.waitForTimeout(4000)
    await cp.getByRole('button', { name: /^open$/i }).click({ timeout: 4000 }).catch(() => {})
    await goToStage((x) => cp.evaluate(x), (ms) => cp.waitForTimeout(ms), 'plan')
    await cp.waitForTimeout(2000)
    await cp.locator('button[aria-label="Menu"]').first().click({ timeout: 4000 }).catch(() => {})
    await cp.waitForTimeout(1500)
    const page0 = page
    page = cp
    if (await tap('nav[aria-label="Stage"] .mrow:has-text("Viewfinder")', 'viewfinder')) {
      await look('viewfinder start')
      await cp.getByRole('button', { name: /open the camera/i }).first().click({ timeout: 4000 }).catch(() => console.log('  (no Open the camera button)'))
      await cp.waitForTimeout(3500)
      await look('viewfinder')
    }
    page = page0
    await cctx.close()
  } finally {
    await chrome.close()
  }
} catch (error) {
  console.log(`      PROBLEM: ABORTED: ${error instanceof Error ? error.message : String(error)}`)
  problems += 1
} finally {
  await browser.close()
  watchdog.stop()
}

problems += totals.mono + totals.square + totals.black + totals.colour
console.log(`\n${report.map((r) => `${r.screen}: ${r.mono}/${r.square}/${r.black}/${r.colour}`).join('\n')}`)
console.log(`\n=== STYLE PROBLEMS: ${problems} (mono ${totals.mono}, square ${totals.square}, black ${totals.black}, colours ${totals.colour}) ===`)
process.exit(problems === 0 ? 0 : 1)
