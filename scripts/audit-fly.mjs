/*
 * THE FLY SCREEN, IN WEBKIT, PORTRAIT, AS A TAB AND FROM THE HOME-SCREEN ICON.
 *
 * Usage:  node scripts/audit-fly.mjs [screenshot-dir]
 *
 * WHY THIS EXISTS. 29 Oct, on an iPhone: the sun's path and its hour pills
 * (night ones, "1 AM", among them) over the Real / Animated switch, the hint
 * and the compass; the rotate hint and "At the ceiling" on top of each other;
 * "Data attribution" over the sticks; E and W on their sides and the wind's
 * speed sitting on the S. Each is checked here on the screen as drawn:
 *
 *   sky       the arcs are put away while flying (the scene says so)
 *   messages  at most one of the hint and an alert; the hint gone after
 *             HINT_MS; neither over the ring, neither clipped
 *   credits   not drawn over the flight; said in the "i" instead
 *   compass   the letters drawn level; the wind's line clear of all four
 *   a crash   one frame made to throw: back to the drone card with "3D
 *             view restarted", never a blank screen (Batch Flow)
 *
 * The clouds are checked in tests/flyScreen.test.ts: what they cover of the
 * sky is arithmetic, and the grain is gone from the source.
 */
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { webkit, devices } from './gate/playwright.mjs'
import { ensureApp, goToStage, guardAudit, startWatchdog, APP_ORIGIN, openMenu } from './preflight.mjs'

/* Batch Polish, Section 2: the menu is the home's (and setup's and field's); on the map its Back goes home first (scripts/preflight.mjs openMenu). */
const menuOn = (pg) => openMenu((x) => pg.evaluate(x), (ms) => pg.waitForTimeout(ms))
import { shareLink } from '../src/lib/planShare.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'
import { placeKey } from '../src/core/venueName.ts'

guardAudit('fly')
const watchdog = startWatchdog('fly', 600_000)
const OUT = process.argv[2] ?? join(process.env.SCOUTNGO_OUT ?? tmpdir(), 'fly')
mkdirSync(OUT, { recursive: true })
const HINT_MS = 4000

const PIER = { lat: 36.8435575, lon: -75.9713104 }
await ensureApp()
const venue = { ...CALIBRATION_VENUE, name: { key: placeKey(String(PIER.lat), String(PIER.lon)), name: 'Virginia Beach Fishing Pier' }, latitude: String(PIER.lat), longitude: String(PIER.lon), date: '2026-10-29', startTime: '16:30', endTime: '17:30' }
const url = new URL(await shareLink(`${APP_ORIGIN}/`, { id: 'fly', name: 'Fly check', savedAt: '2026-10-29T00:00:00Z', venue, kit: { bodyIds: [], lensIds: [], droneIds: [], styleNotes: '' }, positions: [] }))

let problems = 0
let looked = 0
let hintSeen = 0
const fail = (why) => {
  console.log('      PROBLEM: ' + why)
  problems += 1
}
const meets = (a, b) => a !== null && b !== null && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

const LOOK = `(() => {
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return r.width > 0 ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom } : null }
  const msg = [...document.querySelectorAll('.fly__alert, .fly__rotate')].map((el) => ({ cls: el.className, text: el.textContent.trim(), box: box(el), clipped: el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1 }))
  return {
    sky: window.__skyShown ?? null,
    msg,
    ring: box(document.querySelector('.fly__ring')),
    wind: box(document.querySelector('.fly__wind')),
    cardinals: [...document.querySelectorAll('.fly__cardinal')].map((t) => ({ c: t.textContent, rot: t.getAttribute('transform') ?? t.closest('[transform*="rotate"]')?.getAttribute('transform') ?? null, box: box(t) })),
    /* The new scene (Batch D) draws no credits of its own; the old check for the globe library's credit box could never fire. Any credit text over the flight is still caught here. */
    creditsShown: /Tiles by Esri|OpenStreetMap contributors/.test([...document.querySelectorAll('.fly, .fly *')].filter((el) => !el.closest('.fly__credits') && el.children.length === 0).map((el) => el.textContent).join(' ')),
    attribution: /Data attribution/.test(document.body.innerText),
    info: document.querySelector('.fly__credits')?.textContent ?? null,
    vw: innerWidth,
  }
})()`

const browser = await webkit.launch()
try {
  for (const [label, insets] of [['browser', { top: 0, bottom: 0 }], ['standalone', { top: 47, bottom: 34 }]]) {
    console.log(`\n### ${label}`)
    const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } })
    await ctx.addInitScript(([top, bottom]) => {
      const add = () => {
        const s = document.createElement('style')
        s.textContent = `:root{--safe-top:${top}px!important;--safe-bottom:${bottom}px!important}`
        document.head.appendChild(s)
      }
      if (document.head) add()
      else document.addEventListener('DOMContentLoaded', add)
    }, [insets.top, insets.bottom])
    const page = await ctx.newPage()
    const wait = (ms) => page.waitForTimeout(ms)
    const ev = (x) => page.evaluate(x)
    await page.goto(url.href)
    await wait(3500)
    await page.getByRole('button', { name: /^open$/i }).click({ timeout: 4000 }).catch(() => {})
    await wait(1500)
    await page.getByText('Open the map', { exact: true }).click({ timeout: 4000 }).catch(() => {})
    await wait(1500)
    await goToStage(ev, wait, 'plan')
    await wait(3000)
    /* Batch K addendum: Preflight moved from the layers sheet to the menu's Drone card; Batch Flow: the Drone page first. */
    await menuOn(page)
    await wait(900)
    await page.locator('.mcard--drone').first().tap()
    await wait(1500)
    /* Batch Flow, Section 5: the menu's Drone card is the Drone page; its "Fly it yourself" opens the 3D view (the drone card under it). */
    await ev(`[...document.querySelectorAll('.drp__buttons button, .pf button')].find(b => b.textContent === 'Fly it yourself')?.click()`)
    let up = false
    for (let i = 0; i < 120 && !up; i += 1) {
      await wait(1000)
      up = await ev(`!!document.querySelector('.fly__stick')`)
    }
    if (!up) throw new Error(`${label}: the fly screen never came up`)
    const began = Date.now()
    await wait(600)
    let look = await ev(LOOK)
    looked += 1
    console.log(`  at take-off: sky shown ${look.sky}, messages ${JSON.stringify(look.msg.map((m) => m.text))}`)
    await page.screenshot({ path: join(OUT, `fly-${label}.png`) })
    if (look.sky !== false) fail(`${label}: the sky arcs are not put away while flying (${look.sky})`)
    const hinted = look.msg.some((m) => m.cls.includes('fly__rotate'))
    if (hinted) hintSeen += 1
    else if (look.msg.some((m) => m.cls.includes('fly__alert'))) console.log(`  an alert held the one message slot at take-off: the hint's timing is measured in the other mode`)
    else fail(`${label}: no rotate hint and no alert at take-off in portrait`)
    for (const step of [look]) {
      if (step.msg.length > 1) fail(`${label}: ${step.msg.length} messages at once: ${JSON.stringify(step.msg.map((m) => m.text))}`)
      for (const m of step.msg) {
        if (meets(m.box, step.ring)) fail(`${label}: "${m.text}" is over the compass ring`)
        if (m.clipped) fail(`${label}: "${m.text}" is clipped`)
        if (m.box !== null && (m.box.left < 0 || m.box.right > step.vw || m.box.top < insets.top)) fail(`${label}: "${m.text}" is off the screen or under the status bar (${JSON.stringify(m.box)})`)
      }
    }
    /*
     * Batch I, Section 5: no height cap, warnings instead. At the pier, inside
     * Oceana's Class D: once the hint has gone, the amber line names it, its
     * grid ceiling and LAANC; the ladder marks 400 ft. Never "safe" or "clear".
     */
    await wait(4200)
    const warn = await ev(`JSON.stringify({ alert: document.querySelector('.fly__alert')?.textContent ?? null, rungs: [...document.querySelectorAll('.fly__rung')].map((r) => r.textContent), alt: document.querySelector('.fly__alt')?.textContent ?? null })`)
    console.log(`  warnings: ${warn}`)
    const w = JSON.parse(warn)
    if (w.alert === null || !/^Inside Class [BCD] · .+ · grid ceiling here \d+ ft · needs LAANC$/.test(w.alert)) fail(`${label}: inside the Class D, the warning reads ${JSON.stringify(w.alert)}`)
    if (!w.rungs.includes('400 ft')) fail(`${label}: the altitude ladder has no 400 ft rung (${JSON.stringify(w.rungs)})`)
    if (w.alt === null) fail(`${label}: no height on the ladder`)
    if (/\bsafe\b|\bclear\b/i.test(w.alert ?? '')) fail(`${label}: the warning says safe or clear`)
    if (look.creditsShown || look.attribution) fail(`${label}: the data credits are drawn over the flight`)
    if (look.cardinals.length !== 4) fail(`${label}: ${look.cardinals.length} compass letters, not 4`)
    for (const c of look.cardinals) if (c.rot !== null) fail(`${label}: ${c.c} is drawn turned (${c.rot})`)
    if (look.wind === null) console.log('  no wind line (no wind in the forecast here): the overlap check has nothing to look at')
    else for (const c of look.cardinals) if (meets(look.wind, c.box)) fail(`${label}: the wind's line sits on ${c.c}`)
    if (look.wind !== null && meets(look.wind, look.ring)) fail(`${label}: the wind's line is inside the ring`)

    await wait(Math.max(0, HINT_MS + 800 - (Date.now() - began)))
    look = await ev(LOOK)
    console.log(`  after ${HINT_MS} ms: ${JSON.stringify(look.msg.map((m) => m.text))}`)
    if (look.msg.length > 1) fail(`${label}: ${look.msg.length} messages at once after ${HINT_MS} ms`)
    if (look.msg.some((m) => m.cls.includes('fly__rotate'))) fail(`${label}: the rotate hint is still up after ${HINT_MS} ms`)

    await page.locator('button[aria-label="About this flight model"]').tap()
    await wait(400)
    look = await ev(LOOK)
    console.log(`  the "i": ${look.info}`)
    if (look.info === null || !/Esri/.test(look.info)) fail(`${label}: the "i" does not carry the data credits (${look.info})`)
    await page.screenshot({ path: join(OUT, `fly-info-${label}.png`) })

    /*
     * THE GROUND LETS GO OF WHAT IS BEHIND YOU (Batch Flow, Section 1; field
     * 9 Nov: the view closed itself after a long flight). Straight out for
     * 45 s on a stubbed gamepad (about 1,700 ft in Normal): the near square
     * is rebuilt at least once, and the ground's canvas memory must not grow
     * by a whole atlas (67 MB) each time, as it did.
     */
    await ev(`(() => { window.__pad = { axes: [0, -1, 0, 0], buttons: [] }; navigator.getGamepads = () => [window.__pad] })()`)
    await wait(8000)
    const mb0 = await ev('window.__clay?.gpu?.().groundCanvasMB ?? null')
    await ev(`window.__pad.axes = [0, 0, 0, -1]`)
    await wait(45000)
    await ev(`window.__pad.axes = [0, 0, 0, 0]`)
    const after = JSON.parse(await ev(`JSON.stringify({ mb: window.__clay?.gpu?.().groundCanvasMB ?? null, home: [...document.querySelectorAll('.fly__readout span')].map((x) => x.textContent).join(' ') })`))
    console.log(`  a straight 45 s: ground canvas ${mb0} MB to ${after.mb} MB; ${after.home}`)
    if (mb0 === null || after.mb === null) fail(`${label}: the 3D view does not report its ground's canvas memory`)
    else if (after.mb - mb0 > 20) fail(`${label}: the ground kept ${after.mb - mb0} MB of canvases it flew away from`)
    if (!/Home \d+ ft/.test(after.home)) fail(`${label}: no distance back home in the readout (${after.home})`)
    if (!/H\.S [\d.]+ kt/.test(after.home)) fail(`${label}: the drone's speed is not in the speed setting (kt): ${after.home}`)

    /*
     * A CRASH IS NEVER A BLANK SCREEN (Batch Flow, Section 1; field 9 Nov at
     * Sandbridge: the drone view closed itself on a grey screen). One frame
     * made to throw: the view closes, the drone card is back, and one line
     * says so.
     */
    await ev('window.__clayThrowNext = true')
    let back = null
    for (let i = 0; i < 12 && back === null; i += 1) {
      await wait(500)
      back = JSON.parse(await ev(`JSON.stringify((() => { const t = document.querySelector('.toast')?.textContent ?? null; return t === null ? null : { toast: t, fly: !!document.querySelector('.fly'), card: !!document.querySelector('.pf'), words: document.body.innerText.trim().length } })())`))
    }
    console.log(`  after a frame threw: ${JSON.stringify(back)}`)
    if (back === null) fail(`${label}: a crash in the 3D view said nothing (no "3D view restarted")`)
    else {
      if (!/3D view restarted/.test(back.toast)) fail(`${label}: after a crash the line reads ${JSON.stringify(back.toast)}`)
      if (back.fly) fail(`${label}: after a crash the fly screen is still up`)
      if (!back.card) fail(`${label}: after a crash the drone card is not back`)
      if (back.words < 20) fail(`${label}: after a crash the screen is blank`)
    }
    await page.screenshot({ path: join(OUT, `fly-crash-${label}.png`) })
    await ctx.close()
    watchdog.note(label)
  }
} finally {
  await browser.close()
}
watchdog.stop()
if (hintSeen === 0) fail('the rotate hint was never up at take-off in either mode, so its timing was never measured')
if (looked === 0) {
  console.log('=== FLY AUDIT ABORTED: nothing was looked at ===')
  process.exit(2)
}
console.log(`  screenshots: ${OUT}`)
console.log(`\n=== FLY PROBLEMS: ${problems} ===`)
process.exit(problems === 0 ? 0 : 1)
