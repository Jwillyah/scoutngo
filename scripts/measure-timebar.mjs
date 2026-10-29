/*
 * SCRUBBING TIME: THE RULER UNDER THE FINGER, AND THE SHADOWS UNDER THE NEEDLE.
 *
 * Usage:  node scripts/measure-timebar.mjs [label]
 * Writes: measurements/<today>-timebar[-label].md
 * Exits:  0 measured (the numbers are the result); 2 could not look.
 *
 * 29 Oct: "Sliding time is glitchy: the ruler doesn't follow the finger
 * smoothly, sometimes doesn't move at all, and the map shadows lag or jump."
 * Target: the ruler at 60 fps, the shadows within one frame of the needle,
 * on a mid-range phone profile.
 *
 * At 390 x 844, touch emulation, CPU throttled 4x (Chrome's mid-tier mobile
 * profile), in Plan at the Virginia Beach pier at sunrise with the sun and
 * shadows on, three sideways drags on the ruler: slow, medium and fast. A
 * probe in the page records every animation frame:
 *
 *   frame time           requestAnimationFrame to requestAnimationFrame
 *   finger to ruler      px between where the finger has dragged the ruler
 *                        and where the ruler is drawn (its time against the
 *                        time the finger asks for, at the ruler's scale)
 *   needle to shadows    frames since the shadows on the map were last for
 *                        the time under the needle (0: this frame)
 *
 * The needle's time is the ruler's data-live (or, on a build without it,
 * aria-valuenow); the shadows' time is window.__shadowAt, which PlanMode
 * sets under ?probe=1 when it hands the map a new set.
 */
import { writeFileSync } from 'node:fs'
import { connect } from './cdp.mjs'
import { guardAudit, setSheet } from './preflight.mjs'

guardAudit('time bar')
const label = process.argv[2] ?? ''
const PIER = { lat: 36.8435575, lon: -75.9713104 }
const LAST = { at: PIER, name: null, shootKind: 'sunrise', platform: 'both', reachMeters: 400 }
/* The ruler's scale: 360 minutes across its width (src/core/timeBar.ts MINUTES_ACROSS). */
const MINUTES_ACROSS = 360

const PROBE = `(() => {
  if (window.__tb) return 'ok'
  const T = (window.__tb = { frames: [], rec: false, fingerX: null, x0: null, t0: null })
  const strip = () => document.querySelector('.tbar__strip')
  const needle = () => { const s = strip(); if (!s) return null; const v = Number(s.dataset.live ?? s.getAttribute('aria-valuenow')); return Number.isFinite(v) ? v : null }
  addEventListener('touchstart', (e) => { T.x0 = e.touches[0]?.clientX ?? null; T.fingerX = T.x0; T.t0 = needle() }, { capture: true, passive: true })
  addEventListener('touchmove', (e) => { T.fingerX = e.touches[0]?.clientX ?? T.fingerX }, { capture: true, passive: true })
  let last = performance.now()
  let sinceShadow = 0
  let lastNeedle = null
  const tick = (now) => {
    if (T.rec) {
      const n = needle()
      const w = strip()?.getBoundingClientRect().width ?? 1
      const want = T.t0 === null || T.x0 === null || T.fingerX === null ? null : T.t0 - ((T.fingerX - T.x0) / w) * ${MINUTES_ACROSS} * 60000
      const off = want === null || n === null ? null : (Math.abs(n - want) / (${MINUTES_ACROSS} * 60000)) * w
      /* Whole minutes: the app rounds the time it is told to the minute. */
      const same = n !== null && window.__shadowAt != null && Math.abs(window.__shadowAt - n) < 60000
      sinceShadow = same ? 0 : sinceShadow + 1
      T.frames.push({ dt: now - last, needle: n, moved: n !== lastNeedle, fingerOff: off, shadowLag: sinceShadow })
      lastNeedle = n
    }
    last = now
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  return 'ok'
})()`

const c = await connect()
const { send, ev, wait, dispose } = c
try {
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/?probe=1' })
  await wait(2500)
  await ev(`localStorage.clear(); localStorage.setItem('scoutngo.landing.v1','true'); localStorage.setItem('scoutngo.lastSetup.v1', ${JSON.stringify(JSON.stringify(LAST))})`)
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/?probe=1' })
  await wait(5000)
  const went = await ev(`(() => { const b = [...document.querySelectorAll('.wiz__ghost')].find((x) => /Same as last time/.test(x.textContent)); if (!b) return false; b.click(); return true })()`)
  if (!went) throw new Error('no "Same as last time" on Setup')
  await wait(7000)
  await setSheet(ev, wait, 'peek')
  await wait(1500)
  if ((await ev(PROBE)) !== 'ok') throw new Error('probe did not install')
  const strip = JSON.parse(await ev(`JSON.stringify((() => { const r = document.querySelector('.tbar__strip')?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width } : null })())`))
  if (strip === null) throw new Error('no time bar ruler on screen')
  const shadowsOn = await ev(`window.__shadowAt != null`)
  /* TIMEBAR_CPU=1 for an unthrottled run beside the phone profile. */
  const rate = Number(process.env.TIMEBAR_CPU ?? 4)
  await send('Emulation.setCPUThrottlingRate', { rate })

  const rows = []
  for (const [name, dx, ms] of [['slow', -150, 2400], ['medium', -150, 900], ['fast', -150, 300]]) {
    await ev(`(() => { window.__tb.frames = []; window.__tb.rec = true; return 1 })()`)
    const steps = Math.max(4, Math.round(ms / 16))
    const x0 = strip.x + 60
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: strip.y, id: 0 }] })
    for (let i = 1; i <= steps; i += 1) {
      await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (dx * i) / steps, y: strip.y, id: 0 }] })
      await new Promise((r) => setTimeout(r, ms / steps))
    }
    /* Held still a moment before release, so the drag is measured, not a coast after it. */
    await wait(250)
    const frames = JSON.parse(await ev(`JSON.stringify((() => { window.__tb.rec = false; return window.__tb.frames })())`))
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await wait(1500)
    const dts = frames.slice(1).map((f) => f.dt).sort((a, b) => a - b)
    const q = (arr, p) => (arr.length === 0 ? null : arr[Math.min(arr.length - 1, Math.floor(p * arr.length))])
    const offs = frames.map((f) => f.fingerOff).filter((v) => v !== null).sort((a, b) => a - b)
    const lags = frames.map((f) => f.shadowLag).sort((a, b) => a - b)
    rows.push({
      name,
      ms,
      frames: frames.length,
      p50: q(dts, 0.5),
      p95: q(dts, 0.95),
      over17: dts.filter((d) => d > 17.5).length,
      fingerP50: q(offs, 0.5),
      fingerP95: q(offs, 0.95),
      shadowP50: q(lags, 0.5),
      shadowP95: q(lags, 0.95),
      shadowWorst: lags[lags.length - 1] ?? null,
    })
    const r = rows[rows.length - 1]
    console.log(`  ${name}: ${r.frames} frames, p50 ${r.p50?.toFixed(1)} p95 ${r.p95?.toFixed(1)} ms; finger to ruler p50 ${r.fingerP50?.toFixed(1)} p95 ${r.fingerP95?.toFixed(1)} px; needle to shadows p50 ${r.shadowP50} p95 ${r.shadowP95} worst ${r.shadowWorst} frames`)
  }
  await send('Emulation.setCPUThrottlingRate', { rate: 1 })

  const f1 = (v) => (v === null || v === undefined ? '—' : v.toFixed(1))
  const lines = [
    '# Scrubbing time: the ruler and the shadows',
    '',
    `Run: ${new Date().toISOString()} · node scripts/measure-timebar.mjs ${label} · Chrome headless (SwiftShader WebGL), 390 x 844, touch emulation, CPU throttled ${rate}x, Virginia Beach Fishing Pier at sunrise, sun and shadows ${shadowsOn ? 'on' : 'NOT reported (no window.__shadowAt)'}, ${process.env.SCOUTNGO_COMMIT ?? 'working tree'}`,
    '',
    'Three sideways drags of 150 px on the ruler, held still 250 ms before release. Finger to ruler: px between where the finger has dragged the ruler and where it is drawn. Needle to shadows: frames since the map\'s shadows were last for the needle\'s minute.',
    '',
    '| drag | over | frames | frame p50 ms | frame p95 ms | frames over 17.5 ms | finger to ruler p50 / p95 px | needle to shadows p50 / p95 / worst frames |',
    '|---|---|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.name} | ${r.ms} ms | ${r.frames} | ${f1(r.p50)} | ${f1(r.p95)} | ${r.over17} | ${f1(r.fingerP50)} / ${f1(r.fingerP95)} | ${r.shadowP50 ?? '—'} / ${r.shadowP95 ?? '—'} / ${r.shadowWorst ?? '—'} |`),
    '',
  ]
  const file = `measurements/${new Date().toISOString().slice(0, 10)}-timebar${label ? '-' + label : ''}.md`
  writeFileSync(file, lines.join('\n'))
  console.log(`wrote ${file}`)
  await dispose()
  process.exit(0)
} catch (error) {
  console.error(`could not look: ${error instanceof Error ? error.message : String(error)}`)
  try {
    await send('Emulation.setCPUThrottlingRate', { rate: 1 })
  } catch {
    /* the page is gone */
  }
  await dispose()
  process.exit(2)
}
