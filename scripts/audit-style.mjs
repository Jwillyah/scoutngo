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
 *   flat     a sheet, page or dialog on one flat navy fill (Batch Pages,
 *            Section 1: the map sheets, the menu and the calendar read
 *            #1d3b6c flat; the board: the sky gradient, top to low)
 *   look D   a card (the home's, a page's, a tile, a menu card) that is not
 *            the board's frosted dark glass: rgb(20 24 60 / 0.28) with
 *            corners of 16 px or more (Batch Flow, Section 2; board Bold2D)
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
import { decodePng } from '../src/lib/png.ts'

/* The sky gradient's top-to-foot change on screen is far more than this, per channel (#1d3b6c to #5c8cc0 is 63, 81, 84). */
const FLAT_STEP = 30

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
  const out = { mono: new Set(), square: new Set(), black: new Set(), flat: new Set(), lookd: new Set(), colour: {} }
  const CARDS = '.hcard, .dcard, .wtile, .wweek, .mcard, .spage__checks, .cal2__card'
  const off = (where, c) => { if (c === null || c.a < 0.05) return; const h = hex(c); if (TOKENS.has(h)) return; if ((c.r === c.g && c.g === c.b) && (c.r === 255 || c.r === 0)) return; (out.colour[h] ??= new Set()).add(where) }
  /* The screen on top: the last open page, sheet or dialog that covers half the screen; else everything. */
  const tops = [...document.querySelectorAll('[role="dialog"]')].filter((d) => { const b = d.getBoundingClientRect(); return b.height > innerHeight * 0.5 && getComputedStyle(d).display !== 'none' })
  const root = tops.at(-1) ?? document.body
  for (const e of [root, ...root.querySelectorAll('*')]) {
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
    /* Batch Flow, Section 2: every card is look D's frosted glass. */
    if (e.matches(CARDS)) {
      const ok = bg !== null && Math.round(bg.r) === 20 && Math.round(bg.g) === 24 && Math.round(bg.b) === 60 && Math.abs(bg.a - 0.28) < 0.03 && parseFloat(st.borderTopLeftRadius) >= 16
      if (!ok) out.lookd.add(name(e) + ' ' + st.backgroundColor + ' r' + Math.round(parseFloat(st.borderTopLeftRadius)))
    }
    /* Batch Pages, Section 1: the big surfaces, where they are on screen; their pixels are read below (a gradient taller than the screen shows only its navy top). Not a see-through overlay that takes no taps (the map's sun tint): its pixels are the map's. */
    if (sheet && b.height > innerHeight * 0.25 && e !== document.body && e.id !== 'root' && e.querySelector('canvas') === null && st.pointerEvents !== 'none' && (st.backgroundImage !== 'none' || (bg !== null && bg.a > 0.6))) {
      const top = Math.max(0, b.top)
      const bottom = Math.min(innerHeight, b.bottom)
      if (bottom - top > innerHeight * 0.3) out.flat.add(JSON.stringify({ n: name(e), x: Math.max(0, b.left) + 3, top: top + 30, bottom: bottom - 30 }))
    }
  }
  return { mono: [...out.mono], square: [...out.square], black: [...out.black], flat: [...out.flat], lookd: [...out.lookd], colour: Object.fromEntries(Object.entries(out.colour).map(([k, v]) => [k, [...v].slice(0, 3)])) }
})())`

let problems = 0
const totals = { mono: 0, square: 0, black: 0, flat: 0, lookd: 0, colour: 0 }
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
    const png = await page.screenshot({ path: join(OUT, `${screen.replace(/\W+/g, '-')}.png`) })
    /*
     * FLAT NAVY (Batch Pages, Section 1): a big surface whose pixels are the
     * same blue at the top and the bottom of what is on screen. The sky
     * gradient changes by far more than FLAT_STEP from top to bottom.
     */
    const px = await decodePng(png)
    const k = px.width / (await ev('innerWidth'))
    const at = (x, y) => {
      const i = (Math.round(y * k) * px.width + Math.round(x * k)) * 4
      return [px.data[i], px.data[i + 1], px.data[i + 2]]
    }
    r.flat = r.flat
      .map((j) => JSON.parse(j))
      .filter((f) => {
        const a = at(f.x, f.top)
        const z = at(f.x, f.bottom)
        f.top = a
        f.bottom = z
        return Math.max(...a.map((v, i) => Math.abs(v - z[i]))) < FLAT_STEP && a[2] > a[0] + 20
      })
      .map((f) => `${f.n} #${f.top.map((v) => v.toString(16).padStart(2, '0')).join('')} top, #${f.bottom.map((v) => v.toString(16).padStart(2, '0')).join('')} at the foot`)
    const colours = Object.keys(r.colour).length
    console.log(`\n### ${screen}: mono ${r.mono.length} · square ${r.square.length} · black ${r.black.length} · flat ${r.flat.length} · colours outside the set ${colours}`)
    for (const m of r.mono.slice(0, 6)) console.log(`      PROBLEM mono: ${m}`)
    for (const s of r.square.slice(0, 6)) console.log(`      PROBLEM square: ${s}`)
    for (const s of r.black) console.log(`      PROBLEM black: ${s}`)
    for (const s of r.flat) console.log(`      PROBLEM flat navy: ${s}`)
    for (const s of r.lookd.slice(0, 6)) console.log(`      PROBLEM not look D: ${s}`)
    for (const [h, w] of Object.entries(r.colour).slice(0, 8)) console.log(`      PROBLEM colour #${h}: ${w.join(', ')}`)
    totals.mono += r.mono.length
    totals.square += r.square.length
    totals.black += r.black.length
    totals.flat += r.flat.length
    totals.lookd += r.lookd.length
    totals.colour += colours
    report.push({ screen, mono: r.mono.length, square: r.square.length, black: r.black.length, flat: r.flat.length, colour: colours })
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
  for (const [what, screen] of [['.mcard--sky', 'sky page'], ['.mcard--drone', 'drone page']]) {
    if (await tap(`nav[aria-label="Stage"] ${what}`, screen)) {
      await look(screen)
      /* Batch Pages: the month too (the calendar was flat navy), from the Sky page's Calendar button (Section 3). */
      if (what === '.mcard--sky' && (await tap('.spage__buttons button:has-text("Calendar")', 'calendar'))) {
        await look('calendar')
        await tap('.cal__close', 'close the calendar')
      }
    }
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
    /* Batch Pages, Section 2: the Weather page, from the home's "Weather ›". */
    if (await tap('.home__page[aria-label="Today"] .hwx__temp', 'weather page')) {
      await wait(2500)
      await look('weather page')
      await tap('.wpage .ppage__back', 'back to the home')
    }
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
  /* The drone view's HUD: the Drone page › Fly it yourself (Batch Flow, Section 5). */
  if (await tap('nav[aria-label="Stage"] .mcard--drone', 'drone page')) {
    if (await tap('.drp__buttons button:has-text("Fly it yourself")', 'drone view')) {
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
    /* Batch Flow, Section 8: the menu has no Viewfinder row; the Viewfinder is the Sky page's button. A route that does not open is a problem, never a pass. */
    const opened = (await tap('nav[aria-label="Stage"] .mcard--sky', 'the Sky page from the menu')) && (await tap('.spage .spage__btn:has-text("Viewfinder")', 'viewfinder'))
    if (!opened) {
      console.log('      PROBLEM: the Viewfinder could not be reached (menu › Sky › Viewfinder), so its style was not looked at')
      problems += 1
    }
    if (opened) {
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

problems += totals.mono + totals.square + totals.black + totals.flat + totals.lookd + totals.colour
console.log(`\n${report.map((r) => `${r.screen}: ${r.mono}/${r.square}/${r.black}/${r.flat}/${r.colour}`).join('\n')}`)
console.log(`\n=== STYLE PROBLEMS: ${problems} (mono ${totals.mono}, square ${totals.square}, black ${totals.black}, flat navy ${totals.flat}, not look D ${totals.lookd}, colours ${totals.colour}) ===`)
process.exit(problems === 0 ? 0 : 1)
