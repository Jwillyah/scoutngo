/*
 * PINCHES ON THE MAP, AS TWO FINGERS MAKE THEM, AND WHAT THE MAP DID.
 *
 * Shared by scripts/measure-pinch.mjs (records the numbers) and the gesture
 * audit (fails the gate on a jump or a black frame).
 *
 * 29 Oct, from the phone at the pier: "Pinch zoom snaps in and out instead
 * of following the fingers, and the map sometimes goes fully black (the
 * satellite disappears, only the sun/shadow lines remain)."
 *
 * Each pinch is real touch input through the browser's own pipeline
 * (Input.dispatchTouchEvent under touch emulation), so touch-action and the
 * page's own handlers take part. A probe in the page records every frame:
 *
 *   frame time    requestAnimationFrame to requestAnimationFrame
 *   jump          the camera moved with a finger down and no finger having
 *                 moved in that frame or the two before it: something other
 *                 than the fingers moved it. (MapLibre applies a touchmove in
 *                 its next frame, so "this frame only" counted its own
 *                 one-frame lag as jumps: 30 of 94 frames on a clean pinch.)
 *   follow        how far the zoom is from where two fingers put it: the
 *                 zoom at touchstart plus log2 of the fingers' spread over
 *                 their spread then, in zoom levels, over the frames from the
 *                 third under the fingers on
 *   settled       with the fingers held still at the end, how far the zoom
 *                 is from where they put it, and how far (px) the place that
 *                 was under the middle of the two fingers at touchstart now
 *                 is from their middle: a pinch that follows the fingers
 *                 keeps that place under them
 *   app move      the app called easeTo, flyTo, jumpTo or fitBounds while a
 *                 finger was down (the calls are wrapped and counted)
 *   snap back     after the fingers lift, the zoom runs the other way from
 *                 the pinch by more than a hundredth of a level
 *   black         the map canvas, sampled at 24 x 52, is more than half
 *                 black or empty (every channel under 10, or no alpha)
 *
 * IT MUST HAVE LOOKED (docs/failure-modes.md, B): a pinch that did not
 * change the zoom at all is reported as "did not reach the map", not as a
 * clean pinch, and so is a run where the probe saw no frames.
 */

/** Installed once per page load. Reads window.__probe.map (needs ?probe=1). */
export const PROBE = `(() => {
  const map = window.__probe?.map
  if (!map) return 'no map on window.__probe (load with ?probe=1)'
  if (window.__pinch) return 'ok'
  const P = (window.__pinch = { frames: [], touches: 0, moved: false, calls: [], recording: false, gap0: null, z0: null, gap: null })
  const opts = { capture: true, passive: true }
  const spread = (e) => (e.touches.length === 2 ? Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY) : null)
  const box = () => map.getCanvas().getBoundingClientRect()
  const mid = (e) => (e.touches.length === 2 ? [(e.touches[0].clientX + e.touches[1].clientX) / 2, (e.touches[0].clientY + e.touches[1].clientY) / 2] : null)
  addEventListener('touchstart', (e) => {
    P.touches = e.touches.length; P.gap0 = spread(e); P.gap = P.gap0; P.z0 = map.getZoom()
    const m = mid(e); P.mid = m
    P.anchor = m === null ? null : map.unproject([m[0] - box().left, m[1] - box().top])
  }, opts)
  addEventListener('touchmove', (e) => { P.moved = true; P.gap = spread(e); P.mid = mid(e) ?? P.mid }, opts)
  addEventListener('touchend', (e) => { P.touches = e.touches.length }, opts)
  addEventListener('touchcancel', (e) => { P.touches = e.touches.length }, opts)
  for (const name of ['easeTo', 'flyTo', 'jumpTo', 'fitBounds', 'panTo', 'zoomTo', 'setZoom', 'setCenter']) {
    const own = map[name].bind(map)
    map[name] = (...args) => {
      if (P.recording) P.calls.push({ name, touches: P.touches, at: performance.now(), stack: (new Error().stack || '').split('\\n').slice(2, 5).join(' | ') })
      return own(...args)
    }
  }
  const sample = document.createElement('canvas')
  sample.width = 24
  sample.height = 52
  const g = sample.getContext('2d', { willReadFrequently: true })
  let last = performance.now()
  let n = 0
  const tick = (now) => {
    if (P.recording) {
      const c = map.getCenter()
      const want = P.touches === 2 && P.gap0 && P.gap ? P.z0 + Math.log2(P.gap / P.gap0) : null
      let drift = null
      if (P.touches === 2 && P.anchor && P.mid) {
        const at = map.project(P.anchor)
        drift = Math.hypot(at.x + box().left - P.mid[0], at.y + box().top - P.mid[1])
      }
      const f = { dt: now - last, z: map.getZoom(), lng: c.lng, lat: c.lat, b: map.getBearing(), p: map.getPitch(), touches: P.touches, moved: P.moved, want, drift, black: null }
      /* Every third frame: reading the canvas back is not free (and window.__pinchNoSample turns it off, to time frames without it). */
      if (n % 3 === 0 && !window.__pinchNoSample) {
        try {
          g.clearRect(0, 0, 24, 52)
          g.drawImage(map.getCanvas(), 0, 0, 24, 52)
          const d = g.getImageData(0, 0, 24, 52).data
          let dark = 0
          for (let i = 0; i < d.length; i += 4) if (d[i + 3] < 10 || (d[i] < 10 && d[i + 1] < 10 && d[i + 2] < 10)) dark += 1
          f.black = dark / (d.length / 4)
        } catch { f.black = null }
      }
      P.frames.push(f)
      n += 1
    }
    P.moved = false
    last = now
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  return 'ok'
})()`

/** Where the map is free to touch: its canvas, above the sheet and below the top bar. */
export const MAP_AREA = `JSON.stringify((() => {
  const c = document.querySelector('.maplibregl-canvas')?.getBoundingClientRect()
  const sheet = document.querySelector('.sheet')?.getBoundingClientRect()
  const bar = document.querySelector('.topbar')?.getBoundingClientRect()
  if (!c) return null
  const top = Math.max(c.top, bar ? bar.bottom : 0) + 20
  const bottom = Math.min(c.bottom, sheet ? sheet.top : c.bottom) - 20
  return { x: (c.left + c.right) / 2, y: (top + bottom) / 2, top, bottom }
})())`

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * One two-finger gesture. `path` is a list of [gap px, centre dx, centre dy]
 * keyframes; the fingers sit on a horizontal line through the centre.
 */
export async function pinch(send, at, path, { stepMs = 16, steps = 12, holdMs = 400 } = {}) {
  const points = (gap, dx, dy) => [
    { x: at.x + dx - gap / 2, y: at.y + dy, id: 0, radiusX: 4, radiusY: 4, force: 1 },
    { x: at.x + dx + gap / 2, y: at.y + dy, id: 1, radiusX: 4, radiusY: 4, force: 1 },
  ]
  const [g0, x0, y0] = path[0]
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(g0, x0, y0) })
  for (let k = 1; k < path.length; k += 1) {
    const [ga, xa, ya] = path[k - 1]
    const [gb, xb, yb] = path[k]
    for (let s = 1; s <= steps; s += 1) {
      const t = s / steps
      await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(ga + (gb - ga) * t, xa + (xb - xa) * t, ya + (yb - ya) * t) })
      await sleep(stepMs)
    }
  }
  if (holdMs > 0) await sleep(holdMs)
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

/** What the probe saw between two marks, as counts a person can read. */
export function summarise(frames, calls) {
  const during = frames.filter((f) => f.touches > 0)
  const dts = frames.slice(1).map((f) => f.dt).sort((a, b) => a - b)
  const q = (p) => (dts.length === 0 ? null : dts[Math.min(dts.length - 1, Math.floor(p * dts.length))])
  let jumps = 0
  for (let i = 3; i < frames.length; i += 1) {
    const a = frames[i - 1]
    const b = frames[i]
    if (a.touches === 0 || b.touches === 0 || b.moved || a.moved || frames[i - 2].moved) continue
    if (Math.abs(b.z - a.z) > 0.002 || Math.abs(b.lng - a.lng) > 1e-7 || Math.abs(b.lat - a.lat) > 1e-7) jumps += 1
  }
  /* How far the zoom sits from where the fingers put it, once past MapLibre's first frames. */
  const offs = []
  let under = 0
  for (const f of frames) {
    if (f.touches !== 2 || f.want === null) {
      under = 0
      continue
    }
    under += 1
    if (under > 3) offs.push(Math.abs(f.z - f.want))
  }
  offs.sort((a, b) => a - b)
  /* The last frame with two fingers down: they have been still for the hold. */
  const held = [...frames].reverse().find((f) => f.touches === 2 && f.want !== null)
  /* Snap back: after release, the zoom moving against the pinch's own direction. */
  let snaps = 0
  const lift = frames.findIndex((f, i) => i > 0 && frames[i - 1].touches > 0 && f.touches === 0)
  if (lift > 1) {
    const pinchDir = Math.sign(frames[lift - 1].z - frames[0].z)
    for (let i = lift + 1; i < frames.length; i += 1) {
      const d = frames[i].z - frames[i - 1].z
      if (pinchDir !== 0 && Math.sign(d) === -pinchDir && Math.abs(d) > 0.01) snaps += 1
    }
  }
  const sampled = frames.filter((f) => f.black !== null)
  const black = sampled.filter((f) => f.black > 0.5).length
  const zooms = frames.map((f) => f.z)
  return {
    frames: frames.length,
    fingerFrames: during.length,
    p50: q(0.5),
    p95: q(0.95),
    worst: dts.length === 0 ? null : dts[dts.length - 1],
    over33: dts.filter((d) => d > 33.4).length,
    jumps,
    settledZoom: held === undefined ? null : Math.abs(held.z - held.want),
    settledDrift: held === undefined || held.drift === null ? null : held.drift,
    followP95: offs.length === 0 ? null : offs[Math.min(offs.length - 1, Math.floor(0.95 * offs.length))],
    followWorst: offs.length === 0 ? null : offs[offs.length - 1],
    appMoves: calls.filter((c) => c.touches > 0).length,
    appMoveNames: [...new Set(calls.filter((c) => c.touches > 0).map((c) => c.name + ' ' + c.stack))].slice(0, 4),
    snaps,
    sampled: sampled.length,
    black,
    worstBlack: sampled.reduce((m, f) => Math.max(m, f.black), 0),
    zoomFrom: zooms[0] ?? null,
    zoomTo: zooms[zooms.length - 1] ?? null,
    zoomSpan: zooms.length === 0 ? 0 : Math.max(...zooms) - Math.min(...zooms),
  }
}

/** Record one gesture: clear, record, run it, let it settle, stop. */
export async function recordGesture(c, run, settleMs = 1500) {
  const { ev } = c
  await ev(`(() => { const P = window.__pinch; P.frames = []; P.calls = []; P.recording = true; return 1 })()`)
  await run()
  await new Promise((r) => setTimeout(r, settleMs))
  const out = JSON.parse(await ev(`JSON.stringify((() => { const P = window.__pinch; P.recording = false; return { frames: P.frames, calls: P.calls } })())`))
  return summarise(out.frames, out.calls)
}
