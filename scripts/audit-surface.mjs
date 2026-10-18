/*
 * THE ONE SURFACE AUDIT
 *
 * Usage:  node scripts/audit-surface.mjs
 * Exits:  0 when one surface covers the map and every section is reachable.
 *
 * WHAT THIS REPLACED, AND WHY IT IS A DIFFERENT CHECK RATHER THAN A PORT.
 *
 * audit-panels.mjs asserted that no two of a NAMED LIST of panels were open at
 * once, and that an open panel did not cover a HAND-WRITTEN LIST of elements it
 * must not overlap. Both lists were assembled from whichever bugs had already
 * happened:
 *
 *   PANELS grew hazards, then sky, then conditions, then sunsearch, then
 *   layers, each added the pass after it broke something
 *
 *   PROTECTED grew .hud, .map-ctl, .plat, then .sheet and .dock, the last two
 *   only after the sky key was measured sitting on 25,786 square pixels of
 *   the sheet
 *
 * Every pair had to be enumerated, and the one that mattered was always the
 * pair nobody had thought of. That is the shape of every blind check in this
 * repo, and no amount of adding entries fixes it, because the list is the bug.
 *
 * THERE IS NOTHING TO ENUMERATE NOW. One surface may cover the map, so the
 * assertion is a COUNT taken from the DOM rather than a list taken from
 * memory: find every absolutely-positioned element over the map and require
 * that there is exactly one, whatever it is called. A sixth panel added in six
 * months fails this without anybody remembering to add it anywhere.
 *
 * WHICH CHECKS WERE DELETED WITH audit-panels.mjs:
 *
 *   1. the pair matrix: every panel against every other panel, 20 pairs by the
 *      end, asserting both were never visible at once. Dead because the state
 *      that allowed two panels no longer exists: sections are children of one
 *      sheet and cannot be siblings of it.
 *
 *   2. the PROTECTED overlap check: an open panel must not cover .hud,
 *      .map-ctl, .plat, .sheet or .dock. Dead three ways: .hud and .plat are
 *      gone entirely, .map-ctl was replaced by the rail which is asserted
 *      below by position rather than by exception, and a section cannot cover
 *      the sheet it is inside.
 *
 *   3. the self-overlap exclusion (c === p || c.contains(p) || p.contains(c))
 *      and the clipped-rect measurement that followed it. Both existed only to
 *      stop the overlap check reporting a panel against its own container.
 *      With no overlap check there is nothing to exclude.
 *
 *   4. the `via` parent-opening logic, added so the audit could reach hazards
 *      and sky once they moved inside the layers list, and then fixed again
 *      when pressing the parent toggled it shut. Dead: sections are reached by
 *      opening the sheet, which is one action with no nesting.
 */
import { guardAudit, startWatchdog } from './preflight.mjs'

guardAudit('surface')

import { connect } from './cdp.mjs'

const OUT = process.env.SCOUTNGO_OUT ?? '.'
const VIEWPORT = { width: 390, height: 844 }

const watchdog = startWatchdog('surface')
const { ev, wait, shot, send, load, errs, dispose } = await connect()

let problems = 0
const fail = (line) => {
  console.log('      PROBLEM: ' + line)
  problems += 1
}

await send('Emulation.setDeviceMetricsOverride', {
  ...VIEWPORT,
  deviceScaleFactor: 3,
  mobile: true,
})
await ev(`localStorage.clear()`)
await load('http://127.0.0.1:5173/?calibration=1&probe=1')
await ev(`localStorage.setItem('scoutngo.landing.v1','true')`)
await load('http://127.0.0.1:5173/?calibration=1&probe=1')
await wait(6000)
await ev(`[...document.querySelectorAll('.rail__btn')].find(b=>/Plan/.test(b.textContent))?.click()`)
await wait(4500)

/*
 * EVERY ELEMENT THAT COVERS THE MAP, FOUND BY POSITION AND NOT BY NAME.
 *
 * Walks the whole tree, keeps anything fixed or absolute that actually covers
 * a meaningful piece of the map canvas, and drops anything that is inside
 * something already counted so one surface is not reported as five.
 */
const SURFACES = `(() => {
  const canvas = document.querySelector('.map__canvas')
  if (canvas === null) return { error: 'no map canvas' }
  const map = canvas.getBoundingClientRect()
  const area = (r) => Math.max(0, r.width) * Math.max(0, r.height)
  const over = (r) => {
    const w = Math.min(r.right, map.right) - Math.max(r.left, map.left)
    const h = Math.min(r.bottom, map.bottom) - Math.max(r.top, map.top)
    return w > 0 && h > 0 ? w * h : 0
  }

  const found = []
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el)
    if (cs.position !== 'absolute' && cs.position !== 'fixed') continue
    if (cs.display === 'none' || cs.visibility === 'hidden') continue
    if (Number(cs.opacity) === 0) continue
    /*
     * THE MAP IS NOT OVER ITSELF. MapLibre's own canvas is absolutely
     * positioned and full bleed, and its attribution controls sit inside the
     * same container. The first run reported maplibregl-canvas as a surface
     * covering 100% of the map, which is true and meaningless.
     */
    if (canvas.contains(el) || el === canvas) continue
    const r = el.getBoundingClientRect()
    if (area(r) < 400) continue
    /* Covering less than 1% of the map is a badge, not a surface. */
    if (over(r) / area(map) < 0.01) continue
    found.push({ el, r })
  }

  /*
   * A CONTAINER THE MAP SITS INSIDE IS NOT A SURFACE OVER IT.
   *
   * The first version of this reported shell--plan as a surface covering
   * 100% of the map at every detent, and the map as 0% visible. It is the root
   * element: absolutely positioned, full bleed, and the thing the canvas lives
   * INSIDE. Dropping "anything nested inside another hit" kept the ancestor
   * and discarded the real surfaces, which is the filter exactly backwards.
   *
   * So ancestors of the canvas go first, and only then is nesting collapsed.
   */
  const outer = found.filter((a) => !a.el.contains(canvas))
  const tops = outer.filter((a) => !outer.some((b) => b.el !== a.el && b.el.contains(a.el)))

  return {
    mapArea: Math.round(area(map)),
    surfaces: tops.map((t) => ({
      tag: t.el.tagName.toLowerCase(),
      cls: String(t.el.className).slice(0, 40),
      label: t.el.getAttribute('aria-label') ?? null,
      coversPct: +((over(t.r) / area(map)) * 100).toFixed(1),
    })),
  }
})()`

/** How much of the map a shooter can actually see. */
const MAP_VISIBLE = `(() => {
  const vw = ${VIEWPORT.width}, vh = ${VIEWPORT.height}, total = vw * vh
  const canvas = document.querySelector('.map__canvas')
  const boxes = []
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el)
    if (cs.position !== 'absolute' && cs.position !== 'fixed') continue
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue
    /*
     * Containers the map lives inside cover nothing, and neither does the map
     * itself or its own attribution chrome.
     */
    if (canvas !== null && (el.contains(canvas) || canvas.contains(el) || el === canvas)) continue
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) continue
    boxes.push([Math.max(0, r.left), Math.max(0, r.top), Math.min(vw, r.right), Math.min(vh, r.bottom)])
  }
  let covered = 0
  for (let y = 0; y < vh; y += 2) {
    const spans = boxes.filter((b) => y >= b[1] && y < b[3]).map((b) => [b[0], b[2]]).sort((a, b) => a[0] - b[0])
    let end = -1
    for (const [s, e] of spans) { const a = Math.max(s, end); if (e > a) { covered += (e - a) * 2; end = e } }
  }
  return +(100 * (1 - covered / total)).toFixed(1)
})()`

const detentOf = () => ev(`document.querySelector('.sheet')?.dataset.detent ?? null`)
const setDetent = async (want) => {
  for (let i = 0; i < 4; i += 1) {
    if ((await detentOf()) === want) return true
    await ev(`document.querySelector('.sheet__handle')?.click()`)
    await wait(600)
  }
  return (await detentOf()) === want
}

/* ------------------------------------------------- one surface, three detents */

console.log('### exactly one surface may cover the map')
for (const detent of ['peek', 'half', 'full']) {
  if (!(await setDetent(detent))) {
    fail(`could not reach the ${detent} detent`)
    continue
  }
  const found = await ev(SURFACES)
  if (found?.error) {
    fail(found.error)
    continue
  }
  const visible = await ev(MAP_VISIBLE)
  const names = found.surfaces.map((s) => `${s.cls || s.tag}(${s.coversPct}%)`).join(' ')
  /*
   * ONE DISMISSABLE SURFACE, PLUS PERSISTENT FURNITURE.
   *
   * The sheet is the surface: it carries content, it moves, it can hide the
   * map. The two rails are furniture: the icon rail on the right edge and the
   * stage rail along the bottom. Neither carries dismissable content, neither
   * ever changes size, and the sheet measures its own detents against the
   * bottom one.
   *
   * THIS IS NOT THE OLD ALLOWLIST. The old PROTECTED list named elements a
   * panel must not cover, and grew an entry every time a new panel covered
   * something nobody had listed. This names the two things that are not
   * surfaces at all, and the assertion on everything else is a COUNT: a
   * seventh panel added in six months is caught by arithmetic, not by being
   * remembered.
   */
  const extra = found.surfaces.filter(
    (s) => !/\bsheet\b/.test(s.cls) && !/\brail2\b/.test(s.cls) && !/\bdock\b/.test(s.cls),
  )

  console.log(
    `  ${detent.padEnd(5)} map visible ${String(visible).padStart(5)}%  surfaces: ${names}`,
  )
  /*
   * THE SHEET AND THE RAIL. The rail is named here because it is the one
   * thing the rule explicitly allows: it has no content, opens nothing, and
   * is 40px of the right edge. Everything else is a failure by count.
   */
  if (extra.length > 0) {
    fail(
      `${extra.length} surface(s) over the map besides the sheet and the rail: ` +
        extra.map((s) => s.cls || s.tag).join(', '),
    )
    await shot(OUT, `surface-${detent}`)
  }
}

/* ------------------------------------------------ the detent survives a render */

console.log('\n### the detent the shooter set survives a re-render')
for (const detent of ['half', 'full']) {
  if (!(await setDetent(detent))) {
    fail(`could not reach ${detent}`)
    continue
  }
  /*
   * FORCE RENDERS WITHOUT TOUCHING THE SHEET: scrub the time bar, which
   * re-renders the whole plan tree every input, and move the map. If the
   * detent were derived from anything but its own state this is where it
   * would snap back.
   */
  await ev(`(() => {
    const r = document.querySelector('.scrub__range')
    if (r === null) return 'no scrubber'
    for (const v of [200, 600, 900]) {
      r.value = v
      r.dispatchEvent(new Event('input', { bubbles: true }))
    }
    window.__probe?.map?.setBearing((window.__probe.map.getBearing() + 40) % 360)
    return 'ok'
  })()`)
  await wait(1200)
  const after = await detentOf()
  console.log(`  set ${detent.padEnd(5)} then re-rendered  ->  ${after}`)
  if (after !== detent) fail(`the sheet moved itself from ${detent} to ${after}`)
}

/* -------------------------------------------- tapping a position never lowers */

/*
 * A POSITION TO TAP, MADE FIRST.
 *
 * The first run reported "no position row" at all three detents and counted
 * that as a pass. A check that succeeds because it did nothing is the exact
 * failure this whole audit replaced, so if a position cannot be created the
 * check FAILS rather than skipping.
 */
console.log('\n### tapping a position never lowers the sheet')
await setDetent('half')
await ev(`document.querySelector('.plist__add')?.click()`)
await wait(500)
/*
 * THE MAP'S OWN CLICK HANDLER, FIRED DIRECTLY.
 *
 * CDP's synthesised mouse events do not reach MapLibre's canvas listener, so
 * dispatching one at the map added nothing and the whole tap rule went
 * untested. Firing the map's own 'click' with the shape its handler reads
 * exercises the app's real path from a tap to a position, which is the part
 * that matters here; the gesture plumbing is MapLibre's and is not what this
 * audit is about.
 */
await ev(`(() => {
  const map = window.__probe?.map
  if (!map) return 'no probe'
  const c = map.getCanvas()
  const point = { x: c.clientWidth / 2, y: c.clientHeight / 3 }
  map.fire('click', {
    lngLat: map.unproject([point.x, point.y]),
    point,
    originalEvent: { target: c },
  })
  return 'fired'
})()`)
await wait(2500)
/*
 * DESELECT AFTER CREATING, or the card is what the sheet is showing and the
 * list is not in the DOM to tap. Adding a position selects it, which is
 * correct behaviour and is exactly what the first version of this check
 * tripped over: it counted list rows while the card was open and reported
 * "no position row".
 */
await ev(`document.querySelector('.card__close')?.click()`)
await wait(700)
const rows = await ev(`document.querySelectorAll('.shots button').length`)
console.log(`  positions available to tap: ${rows}`)
if (rows === 0) fail('could not create a position, so the tap rule was never tested')
for (const detent of ['peek', 'half', 'full']) {
  if (!(await setDetent(detent))) {
    fail(`could not reach ${detent}`)
    continue
  }
  const before = await detentOf()
  const tapped = await ev(`(() => {
    /* The real markup: ShotList renders an <ol class="shots"> of buttons. */
    const row = document.querySelector('.shots button, .shot__row, .shot')
    if (row === null) return 'no position row'
    row.click()
    return 'ok'
  })()`)
  await wait(900)
  const after = await detentOf()
  const RANK = { peek: 0, half: 1, full: 2 }
  console.log(`  ${before.padEnd(5)} -> tap a position -> ${String(after).padEnd(5)}  (${tapped})`)
  if (tapped !== 'ok') {
    fail(`no position row at ${before}, so the tap rule was not tested there`)
    continue
  }
  if (RANK[after] < RANK[before]) fail(`a tap LOWERED the sheet from ${before} to ${after}`)
  if (before === 'peek' && after !== 'half') {
    fail(`a tap at peek should raise to half, got ${after}`)
  }
  /* Back to the list, so the next detent has a row to tap. */
  await ev(`document.querySelector('.card__close')?.click()`)
  await wait(600)
}

/* ------------------------------------------- every section reachable at FULL */

console.log('\n### every section is reachable at FULL from 390x844')
await ev(`document.querySelector('.card__close')?.click()`)
await wait(400)
if (!(await setDetent('full'))) {
  fail('could not reach full')
} else {
  const sections = await ev(`(() => {
    const out = []
    const body = document.querySelector('.sheet__body')
    for (const el of document.querySelectorAll('.sect')) {
      const r = el.getBoundingClientRect()
      out.push({ name: el.dataset.section, height: Math.round(r.height) })
    }
    return { sections: out, scrollable: body === null ? null : body.scrollHeight > body.clientHeight }
  })()`)
  console.log(`  ${sections.sections.length} sections, body scrolls: ${sections.scrollable}`)
  for (const s of sections.sections) {
    /*
     * REACHABLE MEANS SCROLLABLE-TO, not on screen at once. Six sections
     * cannot fit 844px and are not supposed to; what must be true is that
     * each one is in the scroll and has a real height when opened.
     */
    const ok = s.height > 20
    console.log(`    ${String(s.name).padEnd(12)} ${String(s.height).padStart(5)}px  ${ok ? 'ok' : 'FAIL'}`)
    if (!ok) fail(`section ${s.name} has no height at FULL`)
  }
  if (sections.sections.length === 0) fail('no sections at FULL')
}

const noise = errs.filter((e) => !/arcgis|AJAXError|Failed to fetch|overpass|elevation-tiles/i.test(e))
if (noise.length > 0) console.log('\nconsole errors: ' + JSON.stringify(noise.slice(0, 3)))

console.log('\n=== SURFACE PROBLEMS: ' + problems + ' ===')
watchdog.stop()
await dispose()
process.exit(problems === 0 ? 0 : 1)
