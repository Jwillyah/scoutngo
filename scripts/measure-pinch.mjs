/*
 * PINCH ZOOM ON THE PLAN MAP: JUMPS, BLACK FRAMES, FRAME TIMES.
 *
 * Usage:  node scripts/measure-pinch.mjs [label]
 * Writes: measurements/<today>-pinch[-label].md
 * Exits:  0 no jumps, no app camera moves under a finger, no snap back and
 *         no black frame; 1 any of those; 2 could not look.
 *
 * At 390 x 844 with touch emulation and a throttled network (150 ms, 1.6
 * Mbit/s down: tiles arrive late, as they do at a pier), in Plan at the
 * Virginia Beach Fishing Pier, sunrise, the six cases from the 29 Oct brief.
 * See scripts/pinchGestures.mjs for what each number means.
 *
 * Frame times here come from headless Chrome drawing WebGL in software
 * (SwiftShader), on a laptop. They compare one build with another on this
 * machine; they say nothing about an iPhone's 60 fps.
 */
import { writeFileSync } from 'node:fs'
import { connect } from './cdp.mjs'
import { guardAudit, setSheet } from './preflight.mjs'
import { HELD_DRIFT_PX, MAP_AREA, PROBE, pinch, recordGesture } from './pinchGestures.mjs'

guardAudit('pinch')
const label = process.argv[2] ?? ''
const PIER = { lat: 36.8435575, lon: -75.9713104 }
const LAST = { at: PIER, name: { key: `${PIER.lat.toFixed(6)}|${PIER.lon.toFixed(6)}`, name: 'Virginia Beach Fishing Pier' }, shootKind: 'sunrise', platform: 'both', reachMeters: 400 }
const NET = { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 }

const c = await connect()
const { send, ev, wait, dispose } = c
try {
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/?probe=1' })
  await wait(2500)
  await ev(`localStorage.clear(); localStorage.setItem('scoutngo.landing.v1','true'); localStorage.setItem('scoutngo.lastSetup.v1', ${JSON.stringify(JSON.stringify(LAST))})`)
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/?probe=1' })
  await wait(5000)
  /* Same as last time: straight to the plan, on the pier. */
  const went = await ev(`(() => { const b = [...document.querySelectorAll('.wiz__ghost')].find((x) => /Same as last time/.test(x.textContent)); if (!b) return false; b.click(); return true })()`)
  if (!went) throw new Error('no "Same as last time" on Setup, so the plan never opened on the pier')
  await wait(6000)
  if (!(await ev(`document.querySelector('.shell')?.className.includes('shell--plan')`))) throw new Error('not in Plan after "Same as last time"')
  /* PINCH_FRAMES_ONLY=1: no canvas readback, so the frame times are the app's and not the probe's. */
  if (process.env.PINCH_FRAMES_ONLY === '1') await ev(`window.__pinchNoSample = true`)
  /*
   * PINCH_AROUND_CENTRE=1: the pinch as fc44117 set it up, touchZoomRotate
   * round the middle of the screen, applied at run time to this build, to
   * measure that one setting alone. Said in the file's header line.
   */
  const aroundCentre = process.env.PINCH_AROUND_CENTRE === '1'
  const installed = await ev(PROBE)
  if (installed !== 'ok') throw new Error(installed)
  if (aroundCentre) await ev(`(() => { window.__probe.map.touchZoomRotate.enable({ around: 'center' }); return 1 })()`)
  await send('Network.emulateNetworkConditions', NET)
  await setSheet(ev, wait, 'peek')
  await wait(1500)

  const rows = []
  const run = async (name, how) => {
    const area = JSON.parse(await ev(MAP_AREA))
    if (area === null) throw new Error('no map canvas on screen')
    const r = await recordGesture(c, () => how(area))
    rows.push({ name, ...r })
    console.log(`  ${name}: z ${r.zoomFrom?.toFixed(2)} -> ${r.zoomTo?.toFixed(2)}, ${r.fingerFrames} frames under fingers, jumps ${r.jumps}, held: zoom off ${r.settledZoom?.toFixed(3)} place off ${r.settledDrift?.toFixed(1)} px, off the fingers p95 ${r.followP95?.toFixed(3)} worst ${r.followWorst?.toFixed(3)}, app moves ${r.appMoves}, snap back ${r.snaps}, black ${r.black}/${r.sampled}, p50 ${r.p50?.toFixed(1)} p95 ${r.p95?.toFixed(1)} ms`)
    for (const m of r.appMoveNames) console.log(`      app moved the camera under a finger: ${m}`)
    await wait(800)
  }

  await run('pinch in', (a) => pinch(send, a, [[80, 0, 0], [260, 0, 0]], { steps: 30 }))
  await run('pinch out', (a) => pinch(send, a, [[260, 0, 0], [80, 0, 0]], { steps: 30 }))
  await run('in-out-in, fast', (a) => pinch(send, a, [[80, 0, 0], [240, 0, 0], [90, 0, 0], [240, 0, 0]], { steps: 6, stepMs: 8 }))
  /* Somewhere the tiles are not cached yet, then pinch straight away while they load. */
  await ev(`(() => { const m = window.__probe.map; m.jumpTo({ center: [-75.99, 36.86], zoom: 15 }); return 1 })()`)
  await run('pinch while tiles load', (a) => pinch(send, a, [[240, 0, 0], [70, 0, 0], [220, 0, 0]], { steps: 14 }))
  await ev(`(() => { const m = window.__probe.map; m.jumpTo({ center: [${PIER.lon}, ${PIER.lat}], zoom: 16.5 }); return 1 })()`)
  await wait(2500)
  /* One finger on the venue pin, or on a map label when there is one. */
  const on = JSON.parse(await ev(`JSON.stringify((() => { const e = document.querySelector('.ray-label, .sunpill, .pin--venue'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, what: e.className } })())`))
  if (on === null) rows.push({ name: 'pinch on a label or pin', missing: 'no label or pin on screen' })
  else await run(`pinch starting on ${on.what.split(' ')[0]}`, () => pinch(send, { x: on.x + 60, y: on.y }, [[120, 0, 0], [260, 0, 0]], { steps: 20 }))
  await setSheet(ev, wait, 'half')
  await wait(1200)
  await run('pinch with the sheet at half', (a) => pinch(send, a, [[60, 0, 0], [200, 0, 0]], { steps: 20 }))

  /* Held still, the zoom within a hundredth of a level of the fingers and the place within HELD_DRIFT_PX of them. */
  /*
   * THE OTHER GESTURES ON THE MAP (29 Oct): double tap zooms in, a two-finger
   * tap zooms out, one finger pans, a small twist does not rotate, and two
   * fingers dragged up together do not tilt the 2D map.
   */
  await setSheet(ev, wait, 'peek')
  await wait(800)
  const area = JSON.parse(await ev(MAP_AREA))
  const cam = async () => JSON.parse(await ev(`JSON.stringify((() => { const m = window.__probe.map; const c = m.getCenter(); return { z: m.getZoom(), lng: c.lng, lat: c.lat, b: m.getBearing(), p: m.getPitch() } })())`))
  const tap = async (pts) => {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts })
    await new Promise((r) => setTimeout(r, 40))
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }
  const checks = []
  const check = async (name, run, ok) => {
    const a = await cam()
    await run()
    await wait(1200)
    const b = await cam()
    const pass = ok(a, b)
    checks.push({ name, pass, a, b })
    console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}: z ${a.z.toFixed(2)}→${b.z.toFixed(2)} bearing ${a.b.toFixed(1)}→${b.b.toFixed(1)} pitch ${a.p.toFixed(1)}→${b.p.toFixed(1)}`)
  }
  const at = { x: area.x, y: area.y }
  await check('double tap zooms in', async () => { await tap([{ x: at.x, y: at.y, id: 0 }]); await new Promise((r) => setTimeout(r, 120)); await tap([{ x: at.x, y: at.y, id: 0 }]) }, (a, b) => b.z - a.z > 0.9)
  await check('two-finger tap zooms out', () => tap([{ x: at.x - 40, y: at.y, id: 0 }, { x: at.x + 40, y: at.y, id: 1 }]), (a, b) => a.z - b.z > 0.9)
  await check('one finger pans, at the same zoom', async () => {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: at.x, y: at.y, id: 0 }] })
    for (let i = 1; i <= 12; i += 1) {
      await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: at.x + i * 8, y: at.y + i * 3, id: 0 }] })
      await new Promise((r) => setTimeout(r, 16))
    }
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }, (a, b) => Math.abs(b.z - a.z) < 0.001 && (Math.abs(b.lng - a.lng) > 1e-6 || Math.abs(b.lat - a.lat) > 1e-6))
  /*
   * A 6 degree twist at a 300 px spread, over 600 ms: 15.7 px round the
   * circle, under the 25 px it takes to rotate, and held longer than the
   * 500 ms a two-finger tap may take (quicker and smaller is a tap, and
   * zooms out, which is right).
   */
  await check('a small slow twist does not rotate, or zoom', async () => {
    const r = 150
    const pts = (deg) => { const t = (deg * Math.PI) / 180; return [{ x: at.x - r * Math.cos(t), y: at.y - r * Math.sin(t), id: 0 }, { x: at.x + r * Math.cos(t), y: at.y + r * Math.sin(t), id: 1 }] }
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(0) })
    for (let i = 1; i <= 12; i += 1) {
      await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(i * 0.5) })
      await new Promise((r) => setTimeout(r, 50))
    }
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }, (a, b) => Math.abs(b.b - a.b) < 0.01 && Math.abs(b.z - a.z) < 0.01)
  await check('a deliberate twist does rotate', async () => {
    const r = 100
    const pts = (deg) => { const t = (deg * Math.PI) / 180; return [{ x: at.x - r * Math.cos(t), y: at.y - r * Math.sin(t), id: 0 }, { x: at.x + r * Math.cos(t), y: at.y + r * Math.sin(t), id: 1 }] }
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(0) })
    for (let i = 1; i <= 15; i += 1) {
      await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(i * 3) })
      await new Promise((r) => setTimeout(r, 30))
    }
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }, (a, b) => Math.abs(b.b - a.b) > 10)
  await check('two fingers dragged up together do not tilt the 2D map', async () => {
    const pts = (dy) => [{ x: at.x - 50, y: at.y + 60 - dy, id: 0 }, { x: at.x + 50, y: at.y + 60 - dy, id: 1 }]
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(0) })
    for (let i = 1; i <= 12; i += 1) {
      await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(i * 10) })
      await new Promise((r) => setTimeout(r, 16))
    }
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }, (a, b) => Math.abs(b.p - a.p) < 0.01)

  const clean = checks.every((c) => c.pass) && rows.every((r) => !r.missing && r.jumps === 0 && r.appMoves === 0 && r.snaps === 0 && r.black === 0 && r.zoomSpan > 0.05 && (r.settledZoom ?? 1) < 0.01 && (r.settledDrift ?? 99) < HELD_DRIFT_PX)
  const commit = process.env.SCOUTNGO_COMMIT ?? 'working tree'
  const lines = [
    '# Pinch zoom on the plan map',
    '',
    `Run: ${new Date().toISOString()} · node scripts/measure-pinch.mjs ${label} · Chrome headless (SwiftShader WebGL), 390 x 844, touch emulation (Input.dispatchTouchEvent), network 150 ms / 1.6 Mbit/s, Virginia Beach Fishing Pier, sunrise, ${commit}${aroundCentre ? ', with the pinch set round the screen centre at run time (fc44117\'s setting)' : ''}${process.env.PINCH_FRAMES_ONLY === '1' ? ', no canvas readback (frame times only; black not sampled)' : ''}`,
    '',
    'Jump: the camera moved with a finger down and no finger having moved in that frame or the two before. Off the fingers: |zoom − (zoom at touchstart + log2 of the spread ratio)|, from the fourth frame under two fingers. App move: easeTo / flyTo / jumpTo / fitBounds called with a finger down. Snap back: after release, the zoom running against the pinch. Black: canvas sample more than half black or empty (every third frame).',
    '',
    '| pinch | zoom | frames under fingers | jumps | held: zoom off (levels) | held: place off the fingers (px) | moving: off the fingers p95 / worst (levels) | app moves | snap back | black frames | p50 ms | p95 ms | worst ms |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...rows.map((r) =>
      r.missing
        ? `| ${r.name} | not run: ${r.missing} | | | | | | | | | | | |`
        : `| ${r.name} | ${r.zoomFrom.toFixed(2)} → ${r.zoomTo.toFixed(2)} | ${r.fingerFrames} | ${r.jumps} | ${r.settledZoom === null ? '—' : r.settledZoom.toFixed(3)} | ${r.settledDrift === null ? '—' : r.settledDrift.toFixed(1)} | ${r.followP95 === null ? '—' : `${r.followP95.toFixed(3)} / ${r.followWorst.toFixed(3)}`} | ${r.appMoves} | ${r.snaps} | ${r.black} of ${r.sampled} | ${r.p50.toFixed(1)} | ${r.p95.toFixed(1)} | ${r.worst.toFixed(1)} |`,
    ),
    '',
    ...rows.flatMap((r) => (r.appMoveNames?.length ? [`App camera moves under a finger in "${r.name}":`, ...r.appMoveNames.map((m) => `- ${m}`), ''] : [])),
    '| gesture | zoom | bearing | pitch | as it should |',
    '|---|---|---|---|---|',
    ...checks.map((c) => `| ${c.name} | ${c.a.z.toFixed(2)} → ${c.b.z.toFixed(2)} | ${c.a.b.toFixed(1)} → ${c.b.b.toFixed(1)} | ${c.a.p.toFixed(1)} → ${c.b.p.toFixed(1)} | ${c.pass ? 'yes' : '**NO**'} |`),
    '',
    clean ? 'All clean.' : 'NOT clean: see the tables.',
    '',
  ]
  const date = new Date().toISOString().slice(0, 10)
  const file = `measurements/${date}-pinch${label ? '-' + label : ''}.md`
  writeFileSync(file, lines.join('\n'))
  console.log(`\nwrote ${file}`)
  await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
  await dispose()
  process.exit(clean ? 0 : 1)
} catch (error) {
  console.error(`could not look: ${error instanceof Error ? error.message : String(error)}`)
  await dispose()
  process.exit(2)
}
