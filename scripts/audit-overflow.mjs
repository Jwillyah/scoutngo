/*
 * NOTHING SCROLLS SIDEWAYS: EVERY SCREEN AT 390 PX.
 *
 * Usage:  node scripts/audit-overflow.mjs   (app on :5173, Chrome on :9222)
 * Exits:  0 clean; 1 something runs past the screen's edge or scrolls
 *         sideways; 2 could not look.
 *
 * WHY. On an iPhone (390 px) on 27 Oct the Setup sheet was wider than the
 * screen: the venue name, the Date and the Window boxes ran off the right.
 * The sheet's grid columns were sized by their content, and a venue name is
 * one line that does not wrap, so a long name widened the column and every
 * box in it. Short names fit, which is why it was never seen here: this
 * audit names the venue with a long one, in the shared plan it opens and in
 * the answer to the name lookup should the app ask.
 *
 * ON EVERY SCREEN IT CAN REACH (Setup and its drawers, Plan with the sheet at
 * each height and each chip's card, Field, the menu, the 3D view):
 *
 *   page       the document is no wider than the screen
 *   sideways   no element scrolls sideways (overflow-x auto or scroll with
 *              more content than room): a row of chips that scrolls is a row
 *              whose end nobody sees
 *   past edge  no visible element reaches past the screen's left or right
 *              edge, unless something on screen clips it (the map's canvas,
 *              a name cut short with an ellipsis)
 *   3D legend  nothing from the 2D map is written over the 3D view's legend
 *
 * IT MUST HAVE LOOKED (docs/failure-modes.md, B): each screen is checked for
 * the thing that marks it, and the long name must be on the Setup sheet, cut
 * short, or the run fails rather than passing on a short one.
 */
import { connect } from './cdp.mjs'
import { goToStage, guardAudit, setSheet, startWatchdog } from './preflight.mjs'
import { shareLink } from '../src/lib/planShare.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'
import { placeKey } from '../src/core/venueName.ts'

guardAudit('overflow')
const watchdog = startWatchdog('overflow', 300_000)
const WIDTH = 390
const LONG_NAME = 'Virginia Beach Fishing Pier and Oceanfront Boardwalk at Fifteenth Street'
const PIER = { lat: 36.8435575, lon: -75.9713104 }

const venue = { ...CALIBRATION_VENUE, name: { key: placeKey(String(PIER.lat), String(PIER.lon)), name: `${LONG_NAME}, Virginia Beach` }, latitude: String(PIER.lat), longitude: String(PIER.lon), date: '2026-10-27', startTime: '07:11', endTime: '08:30' }
const link = await shareLink('http://127.0.0.1:5173/', { id: 'vb', name: 'Overflow check', savedAt: '2026-10-27T00:00:00Z', venue, kit: { bodyIds: [], lensIds: [], droneIds: [], styleNotes: '' }, positions: [] })

const { send, ev, wait, dispose, onEvent } = await connect()
let problems = 0
const fail = (why) => {
  console.log('      PROBLEM: ' + why)
  problems += 1
}

/* Everything that runs past the edge or scrolls sideways, on the screen as it is now. */
const LOOK = `(() => {
  const vw = document.documentElement.clientWidth
  const out = { vw, page: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), sideways: [], past: [] }
  const name = (e) => e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\\s+/).slice(0, 2).join('.') : '') + (e.getAttribute('aria-label') ? '[' + e.getAttribute('aria-label') + ']' : '')
  const shown = (e) => {
    if (e.closest('[inert], [aria-hidden="true"]')) return false
    for (let p = e; p; p = p.parentElement) {
      const s = getComputedStyle(p)
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false
    }
    return true
  }
  /* Clipped by an ancestor that stays on screen: the part past the edge is not drawn. */
  const clipped = (e) => {
    for (let p = e.parentElement; p; p = p.parentElement) {
      const s = getComputedStyle(p)
      if (/hidden|clip/.test(s.overflowX) || /hidden|clip/.test(s.overflow)) {
        const r = p.getBoundingClientRect()
        if (r.right <= vw + 1 && r.left >= -1) return true
      }
    }
    return false
  }
  for (const e of document.querySelectorAll('body *')) {
    const r = e.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    const s = getComputedStyle(e)
    if (/auto|scroll/.test(s.overflowX) && e.scrollWidth > e.clientWidth + 1 && shown(e)) out.sideways.push({ el: name(e), scroll: e.scrollWidth, room: e.clientWidth })
    if ((r.right > vw + 1 || r.left < -1) && shown(e) && !clipped(e)) out.past.push({ el: name(e), left: Math.round(r.left), right: Math.round(r.right), text: (e.textContent || '').trim().slice(0, 30) })
  }
  /* Report the outermost offender only: its children run past with it. */
  out.past = out.past.filter((x, i, all) => !all.slice(0, i).some((y) => y.left === x.left && y.right === x.right))
  return JSON.stringify(out)
})()`

let screens = 0
async function check(label, marker) {
  await wait(700)
  const there = marker === null ? true : await ev(`!!document.querySelector(${JSON.stringify(marker)})`)
  if (!there) {
    fail(`${label}: not on screen (no ${marker}), so it was not checked`)
    return
  }
  screens += 1
  const r = JSON.parse(await ev(LOOK))
  const bad = r.page > r.vw + 1 || r.sideways.length > 0 || r.past.length > 0
  console.log(`  ${bad ? 'FAIL' : 'ok  '} ${label}`)
  if (r.page > r.vw + 1) fail(`${label}: the page is ${r.page} px wide on a ${r.vw} px screen`)
  for (const x of r.sideways.slice(0, 6)) fail(`${label}: ${x.el} scrolls sideways (${x.scroll} px of content in ${x.room} px)`)
  for (const x of r.past.slice(0, 6)) fail(`${label}: ${x.el} runs past the edge (${x.left} to ${x.right} px)${x.text ? `: "${x.text}"` : ''}`)
}

try {
  await send('Network.enable', {})
  /* The name lookup answers with a long name: the case that broke the sheet. */
  await send('Fetch.enable', { patterns: [{ urlPattern: 'https://nominatim.openstreetmap.org/reverse*', requestStage: 'Request' }] })
  onEvent('Fetch.requestPaused', (p) => {
    const body = Buffer.from(JSON.stringify({ name: LONG_NAME, address: { city: 'Virginia Beach' } })).toString('base64')
    void send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Content-Type', value: 'application/json' }], body })
  })
  await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: 844, deviceScaleFactor: 2, mobile: true })
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/' })
  await wait(2500)
  await ev(`localStorage.clear(); localStorage.setItem('scoutngo.landing.v1','true')`)
  await send('Page.navigate', { url: 'about:blank' })
  await send('Page.navigate', { url: link })
  let opened = false
  for (let i = 0; i < 30 && !opened; i += 1) {
    await wait(500)
    opened = await ev(`(() => { const b = document.querySelector('.confirm__yes'); if (!b) return false; b.click(); return true })()`)
  }
  if (!opened) throw new Error('the shared plan was not offered')
  await wait(2500)

  console.log(`### every screen at ${WIDTH} px, the venue named "${LONG_NAME}, Virginia Beach"`)
  await goToStage(ev, wait, 'setup')
  let named = false
  for (let i = 0; i < 20 && !named; i += 1) {
    await wait(500)
    named = await ev(`(document.querySelector('.plate__name')?.textContent ?? '').includes('Oceanfront Boardwalk')`)
  }
  if (!named) fail(`the long name never reached the Setup sheet (it says "${await ev(`document.querySelector('.plate__name')?.textContent ?? 'nothing'`)}"), so the case that broke it was not checked`)
  else {
    const cut = JSON.parse(await ev(`JSON.stringify((() => { const n = document.querySelector('.plate__name'); const s = getComputedStyle(n); return { ellipsis: s.textOverflow === 'ellipsis', cut: n.scrollWidth > n.clientWidth } })())`))
    console.log(`  the long name: ${cut.cut ? 'cut short' : 'fits'}${cut.ellipsis ? ', with an ellipsis' : ', with NO ellipsis'}`)
    if (cut.cut && !cut.ellipsis) fail('the long venue name is cut off with no ellipsis')
  }
  await check('Setup, sheet as it opens', '.pills')
  for (const detent of ['full', 'half']) {
    try {
      await setSheet(ev, wait, detent)
      await check(`Setup, sheet ${detent}`, '.setup__body')
    } catch (error) {
      fail(`Setup: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  /* Every drawer Setup opens, by its own link: none named here, so a new one is checked too. */
  const links = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('.setup__link')].map((b) => b.textContent.trim()))`))
  if (links.length === 0) fail('no drawer links on Setup, so no drawer was checked')
  for (const [i, text] of links.entries()) {
    await ev(`document.querySelectorAll('.setup__link')[${i}]?.click()`)
    await check(`Setup, ${text} drawer`, '.drawer .drawer__body')
    await ev(`document.querySelector('.drawer__close')?.click()`)
    await wait(500)
    if (await ev(`!!document.querySelector('.drawer .drawer__body')`)) fail(`the ${text} drawer did not close, so the next one was not reached`)
  }

  await goToStage(ev, wait, 'plan')
  await wait(2500)
  await check('Plan, map', '.chips2')
  for (const detent of ['half', 'full', 'peek']) {
    try {
      await setSheet(ev, wait, detent)
      await check(`Plan, sheet ${detent}`, '.sheet')
    } catch (error) {
      fail(`Plan: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  const chips = await ev(`[...document.querySelectorAll('.chips2 .chip2')].length`)
  for (let i = 0; i < chips; i += 1) {
    const label = await ev(`(() => { const c = document.querySelectorAll('.chips2 .chip2')[${i}]; c.click(); return c.querySelector('.chip2__label')?.textContent ?? 'chip' })()`)
    await check(`Plan, ${label} card`, '.sheet')
  }
  /*
   * LAYERS IS A PAGE: it opens full and fits 390 x 844 with no scrolling, the
   * Tools row and the source line included (27 Oct: it scrolled, with a caps
   * paragraph on a tile).
   */
  await ev(`(() => { const b = document.querySelector('button[aria-label="Map and layers"]'); if (b && b.getAttribute('aria-pressed') !== 'true') b.click(); return 1 })()`)
  await wait(900)
  await check('Plan, Layers', '.tiles')
  const layers = JSON.parse(await ev(`JSON.stringify((() => {
    const sheet = document.querySelector('.sheet')
    const tiles = document.querySelector('.tiles')
    if (!sheet || !tiles) return { missing: true }
    const scrolls = [...sheet.querySelectorAll('*')].filter((e) => { const s = getComputedStyle(e); return /(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 1 }).map((e) => e.className + ' ' + e.scrollHeight + '/' + e.clientHeight)
    const foot = document.querySelector('.tiles__foot')?.getBoundingClientRect()
    return { detent: sheet.dataset.detent, scrolls, footBottom: foot ? Math.round(foot.bottom) : null, vh: innerHeight, tools: [...document.querySelectorAll('.tile__label')].some((l) => l.textContent === 'Measure'), longest: Math.max(...[...document.querySelectorAll('.tile__state')].map((e) => e.textContent.length)) }
  })())`))
  if (layers.missing) fail('Layers did not open, so it was not checked')
  else {
    console.log(`  Layers: sheet ${layers.detent}, scrolling boxes ${layers.scrolls.length}, foot ends at ${layers.footBottom} of ${layers.vh} px, Measure under Tools ${layers.tools}, longest state ${layers.longest} characters`)
    if (layers.detent !== 'full') fail(`Layers opened at ${layers.detent}, not full`)
    for (const x of layers.scrolls) fail(`Layers scrolls: ${x}`)
    if (layers.footBottom === null || layers.footBottom > layers.vh) fail('the foot of Layers is off the screen')
    if (!layers.tools) fail('no Measure under Tools in Layers')
    if (layers.longest > 24) fail(`a tile state runs to ${layers.longest} characters; a state is a few words`)
  }
  await ev(`document.querySelector('button[aria-label="Map and layers"]')?.click()`)
  await wait(500)
  /* Back down: at full the map's rail, the 3D button with it, is put away. */
  await setSheet(ev, wait, 'peek')

  await ev(`document.querySelector('button[aria-label="Menu"]')?.click()`)
  await check('the menu', 'nav[aria-label="Stage"]')
  await ev(`document.querySelector('button[aria-label="Menu"]')?.click(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`)
  await wait(500)
  await goToStage(ev, wait, 'plan')
  const threeD = await ev(`(() => { const b = document.querySelector('button[aria-label="Open the 3D clay model"]'); if (!b) return false; b.click(); return true })()`)
  if (threeD) {
    await wait(3000)
    await check('Plan, 3D view', '.clay')
    /* Nothing from the 2D map written over the 3D legend: the shadow key was, on 27 Oct. */
    const over = JSON.parse(await ev(`JSON.stringify((() => {
      const legend = document.querySelector('.clay__legend')?.getBoundingClientRect()
      if (!legend) return ['no 3D legend']
      return [...document.querySelectorAll('p, [role="status"]')].filter((e) => !e.closest('.clay') && getComputedStyle(e).visibility !== 'hidden').filter((e) => {
        const r = e.getBoundingClientRect()
        return r.width > 0 && r.height > 0 && r.left < legend.right && r.right > legend.left && r.top < legend.bottom && r.bottom > legend.top
      }).map((e) => (e.className || e.tagName) + ': ' + (e.textContent || '').trim().slice(0, 40))
    })())`))
    for (const o of over) fail(`Plan, 3D view: ${o} is drawn over the 3D legend`)
    await ev(`document.querySelector('button[aria-label="Back to the 2D map"]')?.click()`)
    await wait(800)
  } else fail('no 3D button on Plan, so the 3D view was not checked')

  await goToStage(ev, wait, 'field')
  await wait(1500)
  await check('Field', null)
} catch (error) {
  fail(`could not run: ${error instanceof Error ? error.message : String(error)}`)
} finally {
  watchdog.stop()
  await dispose()
}

console.log(`\n  ${screens} screens checked`)
if (screens < 8) fail(`only ${screens} screens were checked; the walk did not get far enough to say`)
console.log(`\n=== OVERFLOW PROBLEMS: ${problems} ===`)
process.exit(problems === 0 ? 0 : 1)
