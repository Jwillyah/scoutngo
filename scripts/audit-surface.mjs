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
      rect: { left: t.r.left, top: t.r.top, right: t.r.right, bottom: t.r.bottom },
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
   * THE FRAME IS KEPT WHETHER OR NOT IT FAILED. It used to be written only on
   * a failure, which meant a passing run left nothing to look at -- and the
   * rail sitting on top of the sheet at full was a PASSING run. Three frames
   * per run is cheap and it is the only part of this audit a person can check
   * with their own eyes.
   */
  await shot(OUT, `surface-${detent}`)
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
  }
}

/* --------------------------------------- every detent reaches every other */

/*
 * A DRAG ON THE SHEET MUST CHANGE THE DETENT. ALL SIX WAYS.
 *
 * WHY THIS EXISTS. The elevation curve put a full-width range input across
 * its plot. At HALF it swallowed every gesture on the sheet, the sheet could
 * not be moved, and the screen had no controls on it: a dead end with no way
 * out. THIS AUDIT PASSED THAT SCREEN WITH ZERO FAILURES, because it checked
 * that a grabber EXISTS rather than that a drag DOES anything.
 *
 * So the assertion is the gesture, not the furniture. Six transitions, each
 * performed as a real pointer drag on the sheet body, each verified by
 * reading data-detent afterwards.
 */
console.log('\n### every detent is reachable from every other, by drag')

const dragSheet = async (from, to) => {
  if (!(await setDetent(from))) return `could not reach ${from} to start`
  const result = await ev(`(() => {
    const sheet = document.querySelector('.sheet')
    if (!sheet) return 'no sheet'
    const box = sheet.getBoundingClientRect()
    const viewport = window.innerHeight
    /* Where the sheet top must end up for the target detent. */
    const wanted = { peek: 88, half: viewport * 0.45, full: viewport * 0.92 }['${to}']
    const startY = box.top + 40
    const endY = viewport - wanted
    /*
     * Grab somewhere in the sheet that is NOT the grabber and NOT a control,
     * because the point is that the sheet drags from its body.
     */
    const target = document.elementFromPoint(box.left + box.width / 2, startY) ?? sheet
    const fire = (type, y) =>
      target.dispatchEvent(new PointerEvent(type, {
        clientX: box.left + box.width / 2, clientY: y,
        bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, buttons: 1,
      }))
    fire('pointerdown', startY)
    fire('pointermove', (startY + endY) / 2)
    fire('pointermove', endY)
    fire('pointerup', endY)
    return 'dragged from ' + (target.className || target.tagName)
  })()`)
  await wait(700)
  const landed = await ev(`document.querySelector('.sheet')?.getAttribute('data-detent')`)
  return landed === to ? null : `${from} -> ${to}: landed on ${landed} (${result})`
}

for (const from of ['peek', 'half', 'full']) {
  for (const to of ['peek', 'half', 'full']) {
    if (from === to) continue
    const problem = await dragSheet(from, to)
    console.log(`  ${from.padEnd(5)} -> ${to.padEnd(5)} ${problem === null ? 'ok' : 'FAILED'}`)
    if (problem !== null) fail(problem)
  }
}

/* ------------------------------------ a named missing capability is fixable */

/*
 * NO FEATURE MAY HIDE THE CONTROL IT DEPENDS ON.
 *
 * A message that names something missing -- "no elevation data", "no drone in
 * the kit" -- is only useful if the thing that supplies it can be reached
 * from where the message is. The elevation curve said "no elevation data
 * here" while covering the Layers section that turns the DEM on.
 *
 * The check is deliberately shallow and mechanical: find the messages, and
 * require a control next to each. It cannot prove the control works; it can
 * prove the shooter is not told about a missing thing with no way to supply
 * it, which is the dead end that happened.
 */
console.log('\n### a message that names a missing capability offers the control')

if (await setDetent('full')) {
  const dead = await ev(`(() => {
    const WANTED = [/no elevation data/i, /turn terrain on/i]
    const out = []
    for (const node of document.querySelectorAll('p, span, button')) {
      const text = (node.textContent ?? '').trim()
      if (text === '' || text.length > 200) continue
      if (!WANTED.some((re) => re.test(text))) continue
      if (node.getBoundingClientRect().width === 0) continue
      /* The control is the node itself, or one inside the same block. */
      const isControl = node.tagName === 'BUTTON' || node.closest('button') !== null
      const nearControl = node.parentElement?.querySelector('button') !== null
      out.push({ text: text.slice(0, 70), fixable: isControl || nearControl })
    }
    return JSON.stringify(out)
  })()`)
  const rows = JSON.parse(dead)
  if (rows.length === 0) {
    console.log('  no missing-capability message on screen')
  }
  for (const row of rows) {
    console.log(`  ${row.fixable ? 'ok    ' : 'DEAD  '} ${row.text}`)
    if (!row.fixable) {
      fail(`"${row.text}" names a missing capability with no control to supply it`)
    }
  }
}

/* ------------------------------------------------- and not over each other */

/*
 * A SURFACE MAY NOT COVER ANOTHER SURFACE.
 *
 * WHY THIS IS HERE AT ALL. The check above asks what covers the MAP, and the
 * rail is allowed, so the rail floating on top of the SHEET passed it clean.
 * It was caught in a screenshot: at full the sheet is 92% of the screen and
 * four map controls sat on roughly 40x130px of the shoot line and the
 * scrubber. A check that passes a surface sitting on text is not measuring
 * the thing it was written for.
 *
 * AND IT IS NOT THE PROTECTED LIST COMING BACK. That list named elements a
 * panel must not cover and grew an entry per bug; what it was reaching for
 * was this, which needs no names: the surfaces are already enumerated by
 * POSITION above, so checking them against each other is three comparisons
 * and nothing to maintain. A seventh surface is included the day it appears.
 */
console.log('\n### no surface may cover another surface')
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
  const list = found.surfaces
  const hits = []
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const a = list[i].rect
      const b = list[j].rect
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left)
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      if (w > 1 && h > 1) {
        hits.push(
          `${list[i].cls || list[i].tag} over ${list[j].cls || list[j].tag}` +
            ` by ${Math.round(w)}x${Math.round(h)}px`,
        )
      }
    }
  }
  console.log(`  ${detent.padEnd(5)} ${list.length} surfaces, ${hits.length} overlapping`)
  for (const hit of hits) fail(hit)
  if (hits.length > 0) await shot(OUT, `overlap-${detent}`)
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
