/*
 * THE AIRSPACE AUDIT: THE SHAPES ARE ON THE GLASS, AND THE MEASURE MEASURES.
 *
 * Usage:  node scripts/audit-airspace.mjs
 * Exits:  0 clean, 1 on a problem found, 2 when it could not look.
 *
 * What it checks, in the running app:
 *
 *   1  The Airspace tile turns the overlay on, and the card opens with the
 *      plain-words lines, ending in the restrictions line.
 *   2  At Atlantic Park (inside Oceana's Class D) the controlled airspace
 *      outline and the grid squares are RENDERED -- queryRenderedFeatures,
 *      what is drawn, not what is in a source -- and a ceiling tag reads the
 *      ceiling the baked grid holds for the square under the centre.
 *   3  Zoomed out to a region the grid is left out and the tile says to zoom
 *      in, rather than drawing nothing silently.
 *   4  Over Shenandoah the national park outline is rendered.
 *   5  Two taps with measure on draw the line and say a distance and heading.
 *
 * SHAPE C GUARD. The ceiling tag is checked against the grid's own number for
 * the square at the map centre, read in the page from the same lookup the card
 * uses, so the audit is about this square and not "some tag says something".
 */
import { connect } from './cdp.mjs'
import { goToStage, guardAudit, setSheet, startWatchdog } from './preflight.mjs'

guardAudit('airspace')
const watchdog = startWatchdog('airspace', 240_000)
const { send, ev, wait, dispose } = await connect()

const ATLANTIC_PARK = { lat: 36.84658, lon: -75.97666 }
const SHENANDOAH = { lat: 38.5285, lon: -78.4383 }

await send('Page.navigate', { url: 'http://127.0.0.1:5173/' })
await wait(3000)
await ev(`localStorage.clear(); localStorage.setItem('scoutngo.landing.v1','true')`)
await send('Page.navigate', { url: 'http://127.0.0.1:5173/?calibration=1&probe=1' })
await wait(8000)
await goToStage(ev, wait, 'plan')
watchdog.note('plan')

let problems = 0
const check = (ok, line) => {
  console.log(`  ${ok ? 'ok     ' : 'PROBLEM'} ${line}`)
  if (!ok) problems += 1
}
const abort = (why) => {
  console.log(`=== AIRSPACE AUDIT ABORTED: ${why} ===`)
  process.exit(2)
}

const settle = async (to, zoom) => {
  await ev(`window.__probe.map.jumpTo({ center: [${to.lon}, ${to.lat}], zoom: ${zoom}, pitch: 0, bearing: 0 })`)
  await ev(`new Promise((r) => { const m = window.__probe.map; if (m.loaded()) r(); else m.once('idle', r); setTimeout(r, 8000) })`)
  await wait(1500)
}
const rendered = (layer) =>
  ev(`window.__probe.map.queryRenderedFeatures(undefined, { layers: ['${layer}'] }).length`)

/* 1. The tile, and the card it opens. */
const opened = await ev(`(() => {
  document.querySelector('button[aria-label="Map and layers"]')?.click()
  return true
})()`)
await wait(800)
const toggled = await ev(`(() => {
  const tile = [...document.querySelectorAll('.tile')].find((t) => t.querySelector('.tile__label')?.textContent === 'Airspace')
  if (!tile) return 'no Airspace tile'
  tile.click()
  return 'clicked'
})()`)
if (!opened || toggled !== 'clicked') abort(toggled)
await wait(4000)
const card = await ev(`(() => {
  const lines = [...document.querySelectorAll('.air__line .air__main')].map((p) => p.textContent)
  return { lines, link: document.querySelector('.air__tfrlink')?.getAttribute('href') ?? null }
})()`)
if (card.lines.length === 0) abort('the airspace card shows no lines, so the words were not checked')
check(card.lines[card.lines.length - 1] === "Check today's flight restrictions before you fly.", `card ends with the restrictions line: "${card.lines.at(-1)}"`)
check(card.link === 'https://tfr.faa.gov/', `restrictions link is ${card.link}`)
watchdog.note('card')

/* 2. Atlantic Park, inside Oceana's Class D. */
await settle(ATLANTIC_PARK, 14.5)
/*
 * INSIDE the Class D the boundary is off screen at this zoom, so the thing
 * that must be on the glass here is the FILL; the outline is checked zoomed out.
 */
const classFill = await rendered('airspace-class-fill')
const cells = await rendered('airspace-cell-fill')
if (classFill + cells === 0) abort('nothing from the overlay rendered at Atlantic Park; the overlay may not have loaded')
check(classFill > 0, `controlled airspace fill rendered under Atlantic Park: ${classFill} features`)
check(cells > 0, `grid squares rendered: ${cells} features`)
const tag = await ev(`(async () => {
  const map = window.__probe.map
  const c = map.getCenter()
  const { facilityCellAt } = await import('/src/lib/uasfm.ts')
  const want = facilityCellAt(c.lat, c.lng)?.ceilingFeet ?? null
  const centre = map.project(c)
  const rect = map.getCanvas().getBoundingClientRect()
  let best = null
  for (const el of document.querySelectorAll('.gridtag')) {
    const r = el.getBoundingClientRect()
    const d = Math.hypot(r.left + r.width / 2 - rect.left - centre.x, r.top + r.height / 2 - rect.top - centre.y)
    if (best === null || d < best.d) best = { d, text: el.textContent }
  }
  return { want, got: best?.text ?? null, distance: best === null ? null : Math.round(best.d) }
})()`)
if (tag.want === null) abort('the grid holds no square at the Atlantic Park centre, so the tag could not be checked')
check(tag.got === String(tag.want), `ceiling tag nearest the centre reads ${tag.got} ft; the grid holds ${tag.want} ft (tag ${tag.distance}px from centre)`)
watchdog.note('atlantic park')

/* 3. Zoomed out: the outline is in view, the grid is left out, and the tile says so. */
await settle(ATLANTIC_PARK, 10)
const classLines = await rendered('airspace-class-line')
check(classLines > 0, `controlled airspace outline rendered at the wide view: ${classLines} features`)
/* The airspace card replaced the layers card when the tile was switched on. Layers opens full, where the dock is put away: down first. */
await setSheet(ev, wait, 'peek')
await ev(`document.querySelector('button[aria-label="Map and layers"]')?.click()`)
await wait(800)
const dense = await ev(`[...document.querySelectorAll('.tile')].find((t) => t.querySelector('.tile__label')?.textContent === 'Airspace')?.querySelector('.tile__state')?.textContent ?? null`)
const denseTags = await ev(`document.querySelectorAll('.gridtag').length`)
if (dense === null) abort('the Airspace tile was not on screen to read at the wide view; reopen layers')
check(/zoom/i.test(dense), `wide view tile state: "${dense}"`)
check(denseTags === 0, `wide view grid tags: ${denseTags}`)

/* 4. Shenandoah: a national park outline. */
await settle(SHENANDOAH, 12)
const parks = await rendered('airspace-closed-line')
check(parks > 0, `park and restricted outlines rendered over Shenandoah: ${parks}`)
watchdog.note('shenandoah')

/* 5. The two-pin measure. */
await settle(ATLANTIC_PARK, 15)
await ev(`document.querySelector('.card__close, button[aria-label="Close"]')?.click()`)
await wait(500)
/* The ruler left the rail on 27 Oct: Measure is under Tools in Layers (and on a long press). */
await setSheet(ev, wait, 'peek').catch(() => null)
await ev(`(() => { const b = document.querySelector('button[aria-label="Map and layers"]'); if (b && b.getAttribute('aria-pressed') !== 'true') b.click(); return 1 })()`)
await wait(600)
const armed = await ev(`(() => { const b = [...document.querySelectorAll('button.tile')].find((t) => t.querySelector('.tile__label')?.textContent === 'Measure'); if (!b) return false; b.click(); return true })()`)
if (!armed) abort('no Measure tile under Tools in Layers')
await wait(400)
for (const [fx, fy] of [[0.3, 0.3], [0.7, 0.3]]) {
  await ev(`(() => {
    const map = window.__probe.map
    const c = map.getCanvas()
    const point = { x: c.clientWidth * ${fx}, y: c.clientHeight * ${fy} }
    map.fire('click', { lngLat: map.unproject([point.x, point.y]), point, originalEvent: { target: c } })
  })()`)
  await wait(400)
}
await wait(800)
const note = await ev(`[...document.querySelectorAll('.tapnote__text')].map((p) => p.textContent).find((t) => t.includes('°')) ?? null`)
const measureLine = await rendered('measure-line')
/* Short, one line: "1,456 ft · NNW 347°". */
check(note !== null && /^[\d,.]+ (m|km|ft|mi) · [NESW]{1,3} \d+°$/.test(note), `measure says: "${note}"`)
check(measureLine > 0, `measure line rendered: ${measureLine}`)
/* Left to right across the screen with the map north up is a heading near due east. */
const heading = note === null ? null : Number(/(\d+)°$/.exec(note)?.[1])
check(heading !== null && Math.abs(heading - 90) <= 2, `left-to-right heading ${heading}° (want 90° ±2)`)

watchdog.stop()
await dispose()
console.log(`\n=== AIRSPACE PROBLEMS: ${problems} ===`)
process.exit(problems === 0 ? 0 : 1)
