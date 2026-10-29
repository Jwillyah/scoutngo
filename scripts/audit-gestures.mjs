/*
 * EVERY GESTURE, REPLAYED: THE GATE FAILS ON A MOVE OF THE WRONG THING.
 *
 * Usage:  node scripts/audit-gestures.mjs   (app on :5173, Chrome on :9222)
 * Exits:  0 clean; 1 a gesture moved the wrong thing, or a target is under
 *         44 px; 2 could not look.
 *
 * docs/gestures.md is the table this checks. Real touch input through the
 * browser (Input.dispatchTouchEvent under touch emulation), at 390 x 844,
 * each part in a tab of its own (scripts/cdp.mjs): a long run of synthetic
 * pinches wedged a tab's touch input on 28 Oct, so the pinches run last.
 *
 *   targets      every control on the plan screen takes a touch 21 px each
 *                way from its centre: 44 px of touch, however small it is drawn
 *   overlays     nothing on top of the map is a box that takes a finger;
 *                only controls do
 *   sheet        flicks from every detent land one on, slow drags on the
 *                nearest (scripts/sheetFlicks.mjs, six each way per detent)
 *   ruler        sideways scrubs and never moves the sheet; up moves the
 *                sheet and never scrubs; a tap jumps to the time under it
 *   map          double tap in, two-finger tap out, pan, no rotate on a small
 *                twist, no tilt in 2D; pinches with no jump, no app camera
 *                move under a finger, no black frame, and held still exactly
 *                on the fingers (scripts/pinchGestures.mjs)
 */
import { connect } from './cdp.mjs'
import { guardAudit, setSheet, startWatchdog } from './preflight.mjs'
import { runSheetFlicks, MIN_REAL_FLICKS } from './sheetFlicks.mjs'
import { HELD_DRIFT_PX, MAP_AREA, PROBE, pinch, recordGesture } from './pinchGestures.mjs'

guardAudit('gestures')
const watchdog = startWatchdog('gestures', 600_000)
let problems = 0
const fail = (why) => {
  console.log('      PROBLEM: ' + why)
  problems += 1
}
const PIER = { lat: 36.8435575, lon: -75.9713104 }
const LAST = { at: PIER, name: null, shootKind: 'sunrise', platform: 'both', reachMeters: 400 }

/** A tab of its own, on the plan at the pier (sunrise, sun and shadows on). */
async function plan() {
  const c = await connect()
  await c.send('Page.navigate', { url: 'http://127.0.0.1:5173/?probe=1' })
  await c.wait(2500)
  await c.ev(`localStorage.clear(); localStorage.setItem('scoutngo.landing.v1','true'); localStorage.setItem('scoutngo.lastSetup.v1', ${JSON.stringify(JSON.stringify(LAST))})`)
  await c.send('Page.navigate', { url: 'http://127.0.0.1:5173/?probe=1' })
  await c.wait(5000)
  const went = await c.ev(`(() => { const b = [...document.querySelectorAll('.wiz__ghost')].find((x) => /Same as last time/.test(x.textContent)); if (!b) return false; b.click(); return true })()`)
  if (!went) throw new Error('no "Same as last time" on Setup')
  await c.wait(7000)
  if (!(await c.ev(`document.querySelector('.shell')?.className.includes('shell--plan')`))) throw new Error('not in Plan')
  return c
}

const drag = async (send, pts, wait) => {
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...pts[0], id: 0 }] })
  for (const p of pts.slice(1)) {
    await wait(16)
    await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...p, id: 0 }] })
  }
  await wait(16)
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

try {
  /* ------------------------------------------------ targets and overlays */
  {
    const c = await plan()
    const { ev, wait, dispose } = c
    await setSheet(ev, wait, 'half')
    await wait(800)
    console.log('### every control takes 44 px of touch, on each screen')
    const TARGETS = `JSON.stringify((() => {
      const out = []
      let n = 0
      for (const el of document.querySelectorAll('button, a[href], [role="button"], input[type="range"], select')) {
        const s = getComputedStyle(el)
        if (s.display === 'none' || s.visibility === 'hidden' || el.closest('[inert], [hidden], .maplibregl-canvas-container')) continue
        const r = el.getBoundingClientRect()
        if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2
        /* Covered (behind the 3D view, a modal): not a target anyone can touch, and reachability's business, not this. */
        const top = document.elementFromPoint(cx, cy)
        if (!(top && (top === el || el.contains(top)))) continue
        n += 1
        /* 21 px each way from the centre, inside the screen: a 44 px touch has to land on it. */
        const probes = [[cx - 21, cy], [cx + 21, cy], [cx, cy - 21], [cx, cy + 21]].filter(([x, y]) => x > 0 && y > 0 && x < innerWidth && y < innerHeight)
        const miss = probes.filter(([x, y]) => { const h = document.elementFromPoint(x, y); return !(h && (h === el || el.contains(h))) })
        if (miss.length > 0) {
          /* A neighbouring control taking that edge is a row of targets, not a small one: allowed when it is itself a full target. */
          const byOther = miss.every(([x, y]) => { const h = document.elementFromPoint(x, y)?.closest('button, a[href], [role="button"], input, select'); return h && h !== el })
          if (!byOther || r.width < 30 || r.height < 30) out.push({ el: el.className?.baseVal ?? el.className ?? el.tagName, label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24), w: Math.round(r.width), h: Math.round(r.height) })
        }
      }
      return { n, out }
    })())`
    const targets = async (label) => {
      const small = JSON.parse(await ev(TARGETS))
      if (small.n < 3) fail(`${label}: only ${small.n} controls on screen, so its targets were not looked at`)
      for (const t of small.out.slice(0, 12)) fail(`${label}: a target under 44 px: ${t.el} "${t.label}" ${t.w} x ${t.h}`)
      console.log(`  ${label}: ${small.n} controls, ${small.out.length} under 44 px of touch`)
    }
    await targets('the plan, sheet at half')
    await ev(`[...document.querySelectorAll('button')].find((x) => /Layers/i.test(x.getAttribute('aria-label') || ''))?.click()`)
    await wait(1500)
    await targets('Layers')
    /* Layers is a page in the sheet with the time bar stepped aside: closed before going on. */
    await ev(`document.querySelector('.card2__x')?.click()`)
    await wait(600)
    await ev(`[...document.querySelectorAll('.chip2')].find((x) => /TIDE/.test(x.textContent))?.click()`)
    await wait(2500)
    await targets('the Tides page')
    await ev(`document.querySelector('.page__close')?.click()`)
    await wait(800)
    await ev(`document.querySelector('button[aria-label="Open the 3D clay model"]')?.click()`)
    await wait(6000)
    await targets('the 3D view')
    await ev(`document.querySelector('.clay__i')?.click()`)
    await wait(800)
    await targets('the 3D view, its "i" open')
    await ev(`document.querySelector('.clay__i[aria-expanded="true"]')?.click()`)
    await ev(`document.querySelector('button[aria-label="Back to the 2D map"]')?.click()`)
    await wait(1500)
    if (!(await ev(`!!document.querySelector('.tbar__strip')`))) throw new Error('the 3D view did not close: no time bar to go on with')

    console.log('### nothing over the map takes a finger but a control')
    await setSheet(ev, wait, 'peek')
    await wait(800)
    const over = JSON.parse(await ev(`JSON.stringify((() => {
      const c = document.querySelector('.maplibregl-canvas').getBoundingClientRect()
      const sheet = document.querySelector('.sheet')?.getBoundingClientRect()
      const out = {}
      let cells = 0
      for (let y = c.top + 4; y < (sheet ? sheet.top : c.bottom); y += 12) for (let x = c.left + 4; x < c.right; x += 12) {
        cells += 1
        const e = document.elementFromPoint(x, y); if (!e) continue
        if (e.closest('.maplibregl-canvas-container') || e.classList.contains('maplibregl-canvas')) continue
        if (e.closest('button, a, input, select, textarea, label, [role=button], [role=slider], .topbar__pill')) continue
        const k = e.tagName.toLowerCase() + '.' + String(e.className?.baseVal ?? e.className).split(' ')[0]
        out[k] = (out[k] ?? 0) + 1
      }
      return { cells, out }
    })())`))
    if (over.cells < 100) fail(`only ${over.cells} points of the map were tried`)
    for (const [k, n] of Object.entries(over.out)) fail(`${k} sits over the map and takes a finger (${n} points)`)
    console.log(`  ${over.cells} points of the map, ${Object.keys(over.out).length} boxes in the way`)

    /* ---------------------------------------- the time pills (section 7) */
    console.log('### the time pills: clear of every control over the map, and of each other')
    await ev(`(() => { const inp = document.querySelector('.tbar__jump'); const day = String(inp.value).slice(0, 10); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inp, day + 'T19:30'); inp.dispatchEvent(new Event('input', { bubbles: true })); return 1 })()`)
    await wait(800)
    if (!(await ev(`document.querySelector('button.tooldock__btn--sunmoon')?.getAttribute('aria-pressed') === 'true'`))) await ev(`document.querySelector('button.tooldock__btn--sunmoon')?.click()`)
    await wait(2000)
    const pills = JSON.parse(await ev(`JSON.stringify((() => {
      const ps = [...document.querySelectorAll('.raypill')].filter((p) => !p.hidden).map((p) => ({ t: p.textContent, r: p.getBoundingClientRect() }))
      const chrome = [...document.querySelectorAll('.rail2 button, .mapctl button, .maplibregl-ctrl, .topbar, .chips2, .tooldock, .sheet, .shadowkey')].map((n) => ({ n: n.className?.baseVal ?? n.className, r: n.getBoundingClientRect() })).filter((c) => c.r.width > 0)
      const hit = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
      const out = []
      for (const [i, p] of ps.entries()) {
        for (const c of chrome) if (hit(p.r, c.r)) out.push(p.t + ' on ' + String(c.n).split(' ')[0])
        for (const q of ps.slice(i + 1)) if (hit(p.r, q.r)) out.push(p.t + ' on ' + q.t)
      }
      return { n: ps.length, moon: ps.filter((p) => /Moon/.test(p.t)).length, out }
    })())`))
    if (pills.moon === 0) fail('the moon was on and no moon pill showed, so the pills were not checked')
    for (const o of pills.out) fail(`a time pill sits on something: ${o}`)
    console.log(`  ${pills.n} pills (${pills.moon} the moon's), ${pills.out.length} on a control or another pill`)
    await ev(`document.querySelector('button.tooldock__btn--sunmoon')?.click()`)
    await wait(500)

    /* ----------------------------------------------------------- ruler */
    console.log('### the ruler: sideways is the time, up is the sheet, a tap jumps')
    const state = `JSON.stringify({ sheet: document.querySelector('.sheet')?.dataset.detent, at: Number(document.querySelector('.tbar__strip')?.getAttribute('aria-valuenow')) })`
    const box = JSON.parse(await ev(`JSON.stringify(document.querySelector('.tbar__strip').getBoundingClientRect())`))
    const x0 = box.left + box.width / 2
    const y0 = box.top + box.height / 2
    let a = JSON.parse(await ev(state))
    /* A thumb's sideways swipe: hooks up 12 px, then across. */
    await drag(c.send, [{ x: x0, y: y0 }, { x: x0 + 1, y: y0 - 4 }, { x: x0 + 2, y: y0 - 8 }, { x: x0 + 3, y: y0 - 12 }, ...Array.from({ length: 10 }, (_, i) => ({ x: x0 + 3 - (i + 1) * 9, y: y0 - 12 }))], wait)
    await wait(1600)
    let b = JSON.parse(await ev(state))
    if (b.at === a.at) fail('a sideways swipe on the ruler did not move the time')
    if (b.sheet !== a.sheet) fail(`a sideways swipe on the ruler moved the sheet (${a.sheet} to ${b.sheet})`)
    a = b
    await drag(c.send, Array.from({ length: 12 }, (_, i) => ({ x: x0, y: y0 - i * 14 })), wait)
    await wait(1200)
    b = JSON.parse(await ev(state))
    if (b.sheet === a.sheet) fail('dragging up on the ruler did not move the sheet')
    if (b.at !== a.at) fail('dragging up on the ruler moved the time')
    await setSheet(ev, wait, 'peek')
    await wait(800)
    a = JSON.parse(await ev(state))
    const tapBox = JSON.parse(await ev(`JSON.stringify(document.querySelector('.tbar__strip').getBoundingClientRect())`))
    await drag(c.send, [{ x: tapBox.left + tapBox.width * 0.75, y: tapBox.top + tapBox.height / 2 }], wait)
    await wait(1000)
    b = JSON.parse(await ev(state))
    /* A quarter of the width right of the needle is a quarter of 360 minutes later. */
    const minutes = (b.at - a.at) / 60_000
    if (Math.abs(minutes - 90) > 3) fail(`a tap a quarter of the ruler right of the needle moved the time ${minutes.toFixed(0)} minutes, not 90`)
    console.log(`  swipe moved the time and not the sheet; up moved the sheet and not the time; a tap moved it ${minutes.toFixed(0)} min`)

    /* The tide curve: the ruler's rules (src/lib/useSidewaysScrub.ts). */
    console.log('### the tide curve: sideways is the time, and never the sheet')
    await ev(`[...document.querySelectorAll('.chip2')].find((x) => /TIDE/.test(x.textContent))?.click()`)
    await wait(2500)
    const curve = JSON.parse(await ev(`JSON.stringify(document.querySelector('[data-sideways][aria-label^="The tide"]')?.getBoundingClientRect() ?? null)`))
    if (curve === null) fail('no tide curve on the Tide card, so it was not checked')
    else {
      const tideState = `JSON.stringify({ sheet: document.querySelector('.sheet')?.dataset.detent, at: Number(document.querySelector('[data-sideways][aria-label^="The tide"]')?.getAttribute('aria-valuenow')) })`
      const ta = JSON.parse(await ev(tideState))
      const cx = curve.left + curve.width * 0.3
      const cy = curve.top + curve.height / 2
      await drag(c.send, [{ x: cx, y: cy }, { x: cx + 1, y: cy - 4 }, { x: cx + 2, y: cy - 8 }, ...Array.from({ length: 10 }, (_, i) => ({ x: cx + 2 + (i + 1) * 12, y: cy - 8 }))], wait)
      await wait(1200)
      const tb = JSON.parse(await ev(tideState))
      if (tb.at === ta.at) fail('a sideways drag on the tide curve did not move the time')
      if (tb.sheet !== ta.sheet) fail(`a sideways drag on the tide curve moved the sheet (${ta.sheet} to ${tb.sheet})`)
      console.log(`  ${tb.at !== ta.at && tb.sheet === ta.sheet ? 'ok' : 'wrong'}`)
    }
    /* The tide chip opens the Tides page now (29 Oct): close it. */
    await ev(`document.querySelector('.page__close')?.click()`)
    await wait(800)
    await dispose()
  }

  /* ------------------------------------------------------------- sheet */
  {
    const c = await plan()
    console.log('### the sheet: flicks one detent on, slow drags to the nearest')
    const rows = await runSheetFlicks(c, 6)
    const done = rows.filter((r) => r.want !== null)
    for (const r of done.filter((x) => x.wrong).slice(0, 8)) fail(`${r.kind} from ${r.from} (${r.len} px, the page saw ${typeof r.seen === 'number' ? Math.abs(r.seen).toFixed(2) : '?'} px/ms) landed ${r.got}, not ${r.want}`)
    if (done.length < rows.length) fail(`${rows.length - done.length} sheet drags could not be set up`)
    const need = Math.ceil((MIN_REAL_FLICKS / 20) * 6)
    for (const [k, n] of Object.entries(rows.realFlicks ?? {})) if (n < need) fail(`only ${n} of 6 ${k} drags arrived as flicks, so flicks were not tested`)
    console.log(`  ${done.length - done.filter((r) => r.wrong).length} of ${done.length} landed right`)
    await c.dispose()
  }

  /* ---------------------------------------------------- the map, last */
  {
    const c = await plan()
    const { send, ev, wait, dispose } = c
    await setSheet(ev, wait, 'peek')
    await wait(1200)
    if ((await ev(PROBE)) !== 'ok') throw new Error('the pinch probe did not install')
    const area = JSON.parse(await ev(MAP_AREA))
    console.log('### the map: pinches follow the fingers, nothing else moves the camera, never black')
    for (const [name, path, opts] of [
      ['pinch in', [[80, 0, 0], [240, 0, 0]], { steps: 20 }],
      ['in-out-in, fast', [[80, 0, 0], [240, 0, 0], [90, 0, 0], [240, 0, 0]], { steps: 6, stepMs: 8 }],
    ]) {
      const r = await recordGesture(c, () => pinch(send, area, path, opts))
      const wrong = []
      if (r.zoomSpan < 0.05) wrong.push('it did not reach the map')
      if (r.jumps > 0) wrong.push(`${r.jumps} jumps`)
      if (r.appMoves > 0) wrong.push(`${r.appMoves} app camera moves under a finger`)
      if (r.snaps > 0) wrong.push(`${r.snaps} snaps back`)
      if (r.black > 0) wrong.push(`${r.black} black frames`)
      if ((r.settledZoom ?? 1) >= 0.01) wrong.push(`held still, ${r.settledZoom?.toFixed(3)} levels off the fingers`)
      if ((r.settledDrift ?? 99) >= HELD_DRIFT_PX) wrong.push(`held still, the place under the fingers ${r.settledDrift?.toFixed(1)} px from them`)
      for (const w of wrong) fail(`${name}: ${w}`)
      console.log(`  ${name}: ${wrong.length === 0 ? 'ok' : wrong.join(', ')}`)
      await wait(800)
    }
    const cam = async () => JSON.parse(await ev(`JSON.stringify((() => { const m = window.__probe.map; const c = m.getCenter(); return { z: m.getZoom(), lng: c.lng, lat: c.lat, b: m.getBearing(), p: m.getPitch() } })())`))
    const tap = async (pts) => {
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts })
      await wait(40)
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    }
    const at = { x: area.x, y: area.y }
    const two = async (fn, n, ms) => {
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fn(0) })
      for (let i = 1; i <= n; i += 1) {
        await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fn(i) })
        await wait(ms)
      }
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    }
    for (const [name, run, ok] of [
      ['double tap zooms in', async () => { await tap([{ x: at.x, y: at.y, id: 0 }]); await wait(120); await tap([{ x: at.x, y: at.y, id: 0 }]) }, (a, b) => b.z - a.z > 0.9],
      ['two-finger tap zooms out', () => tap([{ x: at.x - 40, y: at.y, id: 0 }, { x: at.x + 40, y: at.y, id: 1 }]), (a, b) => a.z - b.z > 0.9],
      ['a small slow twist does not rotate', () => two((i) => { const t = (i * 0.5 * Math.PI) / 180; return [{ x: at.x - 150 * Math.cos(t), y: at.y - 150 * Math.sin(t), id: 0 }, { x: at.x + 150 * Math.cos(t), y: at.y + 150 * Math.sin(t), id: 1 }] }, 12, 50), (a, b) => Math.abs(b.b - a.b) < 0.01],
      ['two fingers up together do not tilt 2D', () => two((i) => [{ x: at.x - 50, y: at.y + 60 - i * 10, id: 0 }, { x: at.x + 50, y: at.y + 60 - i * 10, id: 1 }], 12, 16), (a, b) => Math.abs(b.p - a.p) < 0.01],
    ]) {
      const a = await cam()
      await run()
      await wait(1200)
      const b = await cam()
      if (!ok(a, b)) fail(`${name}: zoom ${a.z.toFixed(2)} to ${b.z.toFixed(2)}, bearing ${a.b.toFixed(1)} to ${b.b.toFixed(1)}, pitch ${a.p.toFixed(1)} to ${b.p.toFixed(1)}`)
      else console.log(`  ${name}: ok`)
    }
    await dispose()
  }
} catch (error) {
  console.log(`\n=== GESTURE PROBLEMS: ABORTED (${error instanceof Error ? error.message : String(error)}) ===`)
  watchdog.stop()
  process.exit(2)
}

console.log(`\n=== GESTURE PROBLEMS: ${problems} ===`)
watchdog.stop()
process.exit(problems === 0 ? 0 : 1)
