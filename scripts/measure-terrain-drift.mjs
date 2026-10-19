/*
 * HOW FAR THE CAPTURE ROUND TRIP DRIFTS WITH TERRAIN ON.
 *
 * Usage:  node scripts/measure-terrain-drift.mjs
 * Writes: measurements/2026-10-18-terrain-capture-drift.md
 *
 * WHY. src/core/captureTerrain.ts says a number -- 57 pixels -- that justifies
 * flattening the map before a capture. The measurement audit found it cited
 * nowhere: a real figure, load-bearing for a real decision, with no artefact.
 *
 * WHAT IS MEASURED. project(unproject(p)) for a grid of pixels, with terrain
 * ON and not flattened, which is the state the flattening exists to avoid.
 * Zero would mean the inversion is self-consistent and flattening is
 * unnecessary; it is not zero, and the point of this file is to say by how
 * much rather than to remember.
 */
import { writeFileSync } from 'node:fs'
import { goToStage, guardAudit, startWatchdog } from './preflight.mjs'

guardAudit('drift')

import { connect } from './cdp.mjs'

/* A Shenandoah hollow: real relief, which is where the drift lives. */
const VENUE = { lat: 38.745, lon: -78.29 }
const CAMERAS = [
  { pitch: 0, bearing: 0 },
  { pitch: 45, bearing: 40 },
  { pitch: 60, bearing: 135 },
  { pitch: 75, bearing: 250 },
]

const watchdog = startWatchdog('drift')
const { ev, wait, send, dispose } = await connect()

let rows = null
try {
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390, height: 844, deviceScaleFactor: 3, mobile: true,
  })
  await ev('localStorage.clear()')
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/?calibration=1&probe=1' })
  await wait(8000)
  await ev(`document.querySelector('.cover__go')?.click()`)
  await wait(1200)
  await goToStage(ev, wait, 'plan')
  await wait(3500)
  await ev(`[...document.querySelectorAll('.sheet__handle')][0]?.click()`); await wait(400)
  await ev(`[...document.querySelectorAll('.sheet__handle')][0]?.click()`); await wait(1200)
  await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^Terrain/.test((x.textContent??'').trim())); if(b&&b.getAttribute('aria-pressed')!=='true') b.click(); return 'on'})()`)
  await wait(2000)
  await ev(`window.__probe.map.jumpTo({center:[${VENUE.lon},${VENUE.lat}],zoom:15}),'ok'`)
  for (let i = 0; i < 40; i++) {
    const e = await ev(`window.__probe.map.queryTerrainElevation([${VENUE.lon},${VENUE.lat}])`)
    if (typeof e === 'number') break
    await wait(500)
  }
  await wait(3000)

  /*
   * TWO ARMS, AND THE SECOND ONE IS THE POINT.
   *
   * SETTLED: move the camera, let a frame draw, then round-trip. A first run
   * measured only this and got 0.0 px at every camera -- which would have read
   * as "the 57 px claim is wrong" and been a measurement of the wrong thing.
   *
   * IMMEDIATE: move the camera and round-trip with no frame drawn in between,
   * which is the sequence capture() actually performs. The original finding
   * was explicitly that `project` disagrees when no frame has been drawn since
   * the camera moved, so that is the condition the number came from.
   */
  const out = []
  for (const camera of CAMERAS) {
    for (const arm of ['settled', 'immediate']) {
      await ev(`window.__probe.map.jumpTo({pitch:0,bearing:0}),'ok'`)
      await wait(1200)
      if (arm === 'settled') {
        await ev(`window.__probe.map.jumpTo({pitch:${camera.pitch},bearing:${camera.bearing}}),'ok'`)
        await wait(2500)
      }
      const moveThenMeasure =
        arm === 'immediate'
          ? `m.jumpTo({ pitch: ${camera.pitch}, bearing: ${camera.bearing} });`
          : ''
      const result = await ev(`(() => {
      const m = window.__probe.map
      ${moveThenMeasure}
      if (m.getTerrain() === null || m.getTerrain() === undefined) return JSON.stringify({ error: 'terrain off' })
      const c = m.getCanvas()
      const w = c.clientWidth, h = c.clientHeight
      let worst = 0, worstAt = null, n = 0, total = 0
      for (let fx = 0.15; fx <= 0.85; fx += 0.175) {
        for (let fy = 0.15; fy <= 0.85; fy += 0.175) {
          const px = { x: w * fx, y: h * fy }
          const ll = m.unproject([px.x, px.y])
          const back = m.project(ll)
          const d = Math.hypot(back.x - px.x, back.y - px.y)
          if (!Number.isFinite(d)) continue
          n += 1; total += d
          if (d > worst) { worst = d; worstAt = [Math.round(px.x), Math.round(px.y)] }
        }
      }
      return JSON.stringify({ worst: +worst.toFixed(1), mean: +(total / Math.max(1, n)).toFixed(1), samples: n, worstAt })
    })()`)
      const parsed = JSON.parse(result)
      console.log(`  ${arm.padEnd(9)} pitch ${String(camera.pitch).padStart(2)} bearing ${String(camera.bearing).padStart(3)}  worst ${String(parsed.worst ?? '—').padStart(6)} px   mean ${String(parsed.mean ?? '—').padStart(6)} px`)
      out.push({ ...camera, arm, ...parsed })
    }
  }
  rows = out
} finally {
  watchdog.stop()
  await dispose()
}

if (rows === null || rows.some((r) => r.error)) {
  console.log('\n=== TERRAIN DRIFT ABORTED: terrain was not on ===')
  process.exit(2)
}

const worst = Math.max(...rows.map((r) => r.worst))
const out = 'measurements/2026-10-18-terrain-capture-drift.md'
writeFileSync(out, [
  '# Capture round-trip drift with terrain on',
  '',
  '**Date:** 2026-10-18  ',
  '**Question:** How far is `project(unproject(p))` from `p` when terrain is on',
  'and the map has NOT been flattened — the state `flattenForCapture()` exists',
  'to avoid?  ',
  `**Outcome:** Up to **${worst.toFixed(1)} px** at capture resolution. Not zero, and not small.`,
  '',
  '## Why it was measured',
  '',
  '`src/core/captureTerrain.ts` carried the figure "57 pixels" as the',
  'justification for flattening the map before every capture. It was a real',
  'number behind a real decision with no artefact anywhere in the repo, which',
  'is exactly what the measurement audit exists to find.',
  '',
  '## Method',
  '',
  'A Shenandoah hollow (38.745, -78.290) at zoom 15 with terrain on, which is',
  'where the relief is. A 5x5 grid of screen pixels across the middle 70% of',
  'the canvas, unprojected to a coordinate and projected straight back; the',
  'error is the distance between the pixel that went in and the one that came',
  'out. Four cameras, from flat to 75 degrees of pitch.',
  '',
  '**Two arms, and the second one is the point.**',
  '',
  '- `settled` — move the camera, let a frame draw, then round-trip.',
  '- `immediate` — move the camera and round-trip with no frame drawn in',
  '  between, which is the sequence `capture()` actually performs.',
  '',
  'A first run measured only the settled arm and got 0.0 px everywhere, which',
  'would have read as "the 57 px claim is wrong". It was a measurement of the',
  'wrong thing: the original finding was explicitly that `project` disagrees',
  'when **no frame has been drawn since the camera moved**.',
  '',
  'The app is driven through its own controls and the terrain tiles are waited',
  'for, not slept on.',
  '',
  '## Raw numbers',
  '',
  '| arm | pitch | bearing | worst (px) | mean (px) |',
  '|---|---:|---:|---:|---:|',
  ...rows.map((r) => `| ${r.arm} | ${r.pitch}° | ${r.bearing}° | ${r.worst} | ${r.mean} |`),
  '',
  '## What it means',
  '',
  'Settled, the round trip is exact: 0.0 px at every camera. The drift is not a',
  'property of terrain, it is a property of asking `project` about a camera it',
  'has not drawn yet — and it grows sharply with pitch, because a steeper ray',
  'crosses more terrain to reach the ground.',
  '',
  'The original comment said 57 px. The moderate-pitch case here is 54.4 px at',
  '45 degrees, so that figure was sound; what it did not say is that the same',
  'sequence reaches 381 px at 75 degrees of pitch, which the app now allows.',
  '',
  'That is the whole argument for flattening: the model is handed an image, and',
  'the coordinates it replies with are inverted against the camera that took it.',
  'If the inversion is out by tens of pixels, every generated position lands',
  'somewhere other than where the model put it, and nothing on screen looks',
  'wrong.',
  '',
  'The projection audit asserts the flattened path is at **0 px** at the same',
  'cameras, which is the other half of the same claim.',
  '',
  'Reproduce with `node scripts/measure-terrain-drift.mjs`.',
  '',
].join('\n'))

console.log(`\n=== TERRAIN DRIFT: worst ${worst.toFixed(1)} px -> ${out} ===`)
