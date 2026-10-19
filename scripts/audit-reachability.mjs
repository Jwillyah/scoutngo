/*
 * REACHABILITY AUDIT
 *
 * Usage:  node scripts/audit-reachability.mjs <dir containing cdp.mjs>
 * Needs:  the app on http://127.0.0.1:5173 and Chrome on --remote-debugging-port=9222
 * Exits:  0 when every surface is clean, 1 otherwise.
 *
 * Walks SETUP, PLAN and FIELD at 390x844 and 390x660, under real iPhone insets,
 * opening every drawer, the sheet, a position card and its disclosure, and
 * asserts that nothing on any of them is visible but unreachable.
 */

import { goToStage, guardAudit, startWatchdog } from './preflight.mjs'

/*
 * ARMED BEFORE ANYTHING ELSE CAN THROW.
 *
 * This audit used to die on a TypeError when the thing it needed was not
 * there, printing a stack trace into a log the commit hook greps for a problem
 * count. It matched nothing, so the hook refused the commit with one red line
 * and no reason. Any throw from here on prints one sentence saying the audit
 * could not LOOK, and exits 2 so that is distinguishable from a problem found.
 */
guardAudit('reachability')

/*
 * THE REACHABILITY AUDIT.
 *
 * Twice now a control has shipped that the shooter could see but not reach, and
 * each time for a different reason:
 *
 *   1. SETUP clipped its own overflow, so the pills and the kit row did not
 *      exist below the fold at all.
 *   2. The kit drawer scrolled fine, but it was an overlay nested inside
 *      ANOTHER scroll container, so on iOS the drag went to the outer one.
 *
 * An audit that only looks for `overflow: hidden` catches the first and misses
 * the second. This one asks the question that actually matters: can every
 * control on this screen be brought into view and tapped?
 */

export const AUDIT = `(() => {
  const vp = { w: document.documentElement.clientWidth, h: document.documentElement.clientHeight }

  const scrollableAncestors = (el) => {
    const out = []
    let node = el.parentElement
    while (node !== null && node !== document.body) {
      const cs = getComputedStyle(node)
      if (/auto|scroll/.test(cs.overflowY) && node.scrollHeight > node.clientHeight + 1) out.push(node)
      node = node.parentElement
    }
    return out
  }

  const name = (el) => String(el.id || (el.className.baseVal ?? el.className) || el.tagName).split(' ')[0]

  /* 1. Anything clipping content it owns, with no way to scroll to it. */
  const visuallyHidden = (el, cs) =>
    (cs.clipPath !== 'none' && cs.position === 'absolute') ||
    (el.clientWidth < 4 && el.clientHeight < 4)

  const clipped = [...document.querySelectorAll('*')].filter((el) => {
    const cs = getComputedStyle(el)
    if (visuallyHidden(el, cs)) return false
    /*
     * Behind an open modal and marked inert. Deliberately not reachable, which
     * is the whole point of a modal, and inert is the browser's own word for
     * it rather than a guess from z-index.
     */
    if (el.closest('[inert]') !== null) return false
    return /hidden|clip/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1
  }).map((el) => ({ el: name(el), lost: el.scrollHeight - el.clientHeight }))

  /* 2. Controls that cannot be brought on screen by scrolling what owns them. */
  const controls = [...document.querySelectorAll('button, a[href], input, select, textarea, [role="button"]')]
    .filter((el) => {
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden' || el.hidden) return false
      // The visually-hidden pattern: a 1px clipped input behind a real label.
      if (cs.clipPath !== 'none' && cs.position === 'absolute') return false
      const r = el.getBoundingClientRect()
      if (r.width < 4 || r.height < 4) return false
      /*
       * Map furniture lives in map space, not page space. A marker off the
       * current view is reached by panning, which is not a layout failure.
       */
      if (el.closest('.map__canvas, .shooter-host, .maplibregl-map') !== null) return false
      // Behind an open modal and marked inert.
      if (el.closest('[inert]') !== null) return false
      /*
       * Inside a closed disclosure. Not reachable yet is the POINT of a
       * disclosure; the summary that opens it is audited like anything else.
       */
      const details = el.closest('details')
      if (details !== null && !details.open) return false
      return true
    })
  const unreachable = []
  for (const el of controls) {
    const r = el.getBoundingClientRect()
    const onScreen = r.top >= -1 && r.bottom <= vp.h + 1 && r.left >= -1 && r.right <= vp.w + 1
    if (onScreen) continue
    const scrollers = scrollableAncestors(el)
    if (scrollers.length === 0) {
      unreachable.push({ el: name(el), text: el.textContent.trim().slice(0, 24), reason: 'no scrollable ancestor' })
      continue
    }
    const before = scrollers.map((s) => s.scrollTop)
    el.scrollIntoView({ block: 'center' })
    const after = el.getBoundingClientRect()
    const nowOn = after.top >= -1 && after.bottom <= vp.h + 1
    scrollers.forEach((s, i) => { s.scrollTop = before[i] })
    if (!nowOn) unreachable.push({ el: name(el), text: el.textContent.trim().slice(0, 24), reason: 'scrollIntoView did not land it' })
  }

  /*
   * 3. THE STRUCTURAL CHECK: a scroller inside another scroller.
   *
   * WHY THIS MISSED THE KIT DRAWER, WHICH IT EXISTED TO CATCH. It used to
   * carry if (position === 'fixed') { overlay = true; break }, added in the
   * same pass that made .drawer position: fixed. So the fix and the exemption
   * that hid the fix's incompleteness shipped together: walking up from
   * .drawer__body the first ancestor was .drawer, fixed, exempt, and .setup
   * below it was never reached.
   *
   * The reasoning was wrong. position: fixed takes an element out of an
   * ancestor's scroll GEOMETRY, so it stops moving when the ancestor scrolls.
   * It does not take it out of the DOM, and touch gestures bubble through the
   * DOM, so the ancestor scroller can still claim a drag that began inside the
   * fixed descendant. Nesting is a question of DOM ancestry and nothing else,
   * so that is the only thing judged here now.
   *
   * The real fix for a modal is a portal: out at document.body there is no
   * ancestor scroller to compete with, and this check passes honestly.
   */
  const nested = []
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el)
    if (!/auto|scroll/.test(cs.overflowY)) continue
    if (el.scrollHeight <= el.clientHeight + 1) continue
    /*
     * A form control that scrolls its own text is not a panel. The hazard is a
     * PANEL inside a panel.
     */
    if (/^(TEXTAREA|INPUT|SELECT)$/.test(el.tagName)) continue
    if (el.closest('[inert]') !== null) continue
    let node = el.parentElement
    while (node !== null && node !== document.body) {
      const ncs = getComputedStyle(node)
      if (/auto|scroll/.test(ncs.overflowY) && node.scrollHeight > node.clientHeight + 1) {
        nested.push({ inner: name(el), outerScroller: name(node) })
        break
      }
      node = node.parentElement
    }
  }

  /*
   * 4. A CANVAS SMALLER THAN ITS BOX.
   *
   * Every map container here is sized in dvh, which recalculates when Safari's
   * bars collapse. A WebGL canvas that is not resized with it paints imagery
   * across the top of its container and black underneath. Nothing else in this
   * audit would notice: the layout is correct, the controls are all reachable,
   * and the map is simply the wrong size.
   */
  const canvases = [...document.querySelectorAll('.map__canvas')].map((host) => {
    const canvas = host.querySelector('canvas.maplibregl-canvas')
    const h = host.getBoundingClientRect()
    if (canvas === null) {
      return { el: name(host), problem: 'no canvas', box: Math.round(h.height) }
    }
    const c = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const cssOff = Math.abs(c.height - h.height) > 2 || Math.abs(c.width - h.width) > 2
    // The drawing buffer has to match too: a correct CSS box over a stale
    // buffer is the same black band, just harder to see in the DOM.
    const bufferOff =
      Math.abs(canvas.height - Math.round(h.height * dpr)) > 3 ||
      Math.abs(canvas.width - Math.round(h.width * dpr)) > 3
    if (!cssOff && !bufferOff) return null
    return {
      el: name(host),
      box: Math.round(h.width) + 'x' + Math.round(h.height),
      canvasCss: Math.round(c.width) + 'x' + Math.round(c.height),
      buffer: canvas.width + 'x' + canvas.height,
      expectedBuffer: Math.round(h.width * dpr) + 'x' + Math.round(h.height * dpr),
      problem: cssOff ? 'canvas smaller than its box' : 'stale drawing buffer',
    }
  }).filter((row) => row !== null)

  return { viewport: vp.w + 'x' + vp.h, clipped, unreachable, nestedScrollers: nested,
           canvasMismatch: canvases, controlsChecked: controls.length }
})()`

/*
 * Fixtures live beside this script, so the audits run from a fresh clone and
 * from a git hook without anything being staged into a scratch directory
 * first. An explicit directory argument still overrides, for a one-off.
 */
const HERE = new URL('.', import.meta.url).pathname
const FIXTURES = process.argv[2] ?? HERE
const { ev, ws, wait, send, errs, dispose } = await (await import(FIXTURES + '/cdp.mjs')).connect()
const watchdog = startWatchdog('reachability')
const { readFileSync } = await import('node:fs')
await send('Page.addScriptToEvaluateOnNewDocument', { source: readFileSync(FIXTURES + '/stub.js','utf8') })
const show = (l, v) => {
  /*
   * Every scenario reports through here, so this is the one place that knows
   * how far the run got. The watchdog prints it if it fires, which turns
   * "timed out" into "timed out after PLAN 660 card open".
   */
  watchdog.note(l)
  console.log('\n### ' + l + '\n' + JSON.stringify(v, null, 2))
}
let failures = 0
const check = async (label) => {
  const r = await ev(AUDIT)
  const bad =
    r.clipped.length + r.unreachable.length + r.nestedScrollers.length +
    r.canvasMismatch.length
  if (bad > 0) failures += bad
  show(label + (bad === 0 ? '  OK' : '  ' + bad + ' PROBLEM(S)'), r)
}

for (const h of [844, 660]) {
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:h,deviceScaleFactor:3,mobile:true})
  await ev(`localStorage.clear()`)
  await send('Page.navigate',{url:'http://127.0.0.1:5173/?calibration=1'})
  await wait(8000)
  // Real iPhone insets, so anything pinned to an edge is audited under them.
  await ev(`document.documentElement.style.setProperty('--safe-top','47px')
            document.documentElement.style.setProperty('--safe-bottom','34px')`)
  await wait(400)
  await check(`SETUP ${h}`)
  /*
   * THE REGRESSION CASE. Change the viewport height WITHOUT reloading, which is
   * what Safari does when its bars collapse, and check the canvas followed.
   */
  await send('Emulation.setDeviceMetricsOverride',
    { width: 390, height: h === 844 ? 660 : 844, deviceScaleFactor: 3, mobile: true })
  await wait(1400)
  await check(`SETUP ${h} · after the bars moved`)
  await send('Emulation.setDeviceMetricsOverride',
    { width: 390, height: h, deviceScaleFactor: 3, mobile: true })
  await wait(1400)
  for (const [label, finder] of [
    ['kit drawer', `/Edit kit/i`], ['shot list drawer', `/Paste a shot list|shots listed/i`],
    ['saved drawer', `/^Saved$/i`], ['settings drawer', `/^Settings$/i`],
  ]) {
    await ev(`[...document.querySelectorAll('button, a')].find(b=>${finder}.test(b.textContent))?.click()`)
    await wait(1200)
    await check(`SETUP ${h} · ${label}`)
    await ev(`[...document.querySelectorAll('.drawer__close')].pop()?.click()`)
    await wait(600)
  }
  await goToStage(ev, wait, 'plan')
  await wait(3500)
  await check(`PLAN ${h}`)
  await ev(`[...document.querySelectorAll('.act')].find(b=>/Suggest/.test(b.textContent))?.click()`)
  await wait(12000)
  await check(`PLAN ${h} · after suggest`)
  await ev(`document.querySelector('.peek__summary')?.click()`)
  await wait(1000)
  await check(`PLAN ${h} · sheet open`)
  await ev(`(() => { const f=[...document.querySelectorAll('button.shooter')]
    ;(f.find(x=>!x.classList.contains('shooter--air')) ?? f[0])?.click() })()`)
  await wait(3000)
  await check(`PLAN ${h} · card open`)
  await ev(`document.querySelector('.more__summary')?.click()`)
  await wait(800)
  await check(`PLAN ${h} · card numbers open`)
  await ev(`document.querySelector('.card__close')?.click()`)
  await wait(600)
  await goToStage(ev, wait, 'field')
  await wait(3500)
  await check(`FIELD ${h}`)
}
console.log('\n=== TOTAL PROBLEMS: ' + failures + ' ===')
console.log('errors:', JSON.stringify(errs.slice(0,3)))
watchdog.stop()
ws.close(); await dispose(); process.exit(failures === 0 ? 0 : 1)
