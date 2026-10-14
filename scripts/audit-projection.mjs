/*
 * PROJECTION ROUND TRIP AUDIT
 *
 * Usage:  node scripts/audit-projection.mjs <dir containing cdp.mjs>
 * Needs:  the app on http://127.0.0.1:5173 and Chrome on --remote-debugging-port=9222
 * Exits:  0 when every delta is within tolerance, 1 otherwise.
 *
 * WHY THIS EXISTS. Three projection bugs have shipped here, and every one was
 * found by somebody noticing a marker looked wrong. That cannot be relied on:
 * a marker in the wrong place is indistinguishable by eye from a marker in the
 * right place on a map that has since panned, which is exactly what confounded
 * the first attempt to measure the third one.
 *
 * Two round trips are asserted, both against the REAL map rather than a model
 * of it:
 *
 *   1. pixel -> unproject -> project -> pixel
 *      The path a tap takes to become a coordinate. Run at three zooms, with
 *      the bottom sheet open and closed, in SETUP and in PLAN.
 *
 *   2. projectToCapture <-> unprojectFromCapture
 *      The pair the whole normalised-image-coordinate approach rests on: the
 *      model answers in 0..1 image coordinates and these turn them into real
 *      ones. Run under pitch and bearing as well as flat north-up, because
 *      bounds-based reasoning is precisely what breaks there.
 */

const TOLERANCE_PX = 1
const TOLERANCE_METRES = 0.5

export const PIXEL_ROUND_TRIP = `((probePixels) => {
  const map = window.__probe?.map
  if (!map) return { error: 'no probe: load with ?probe=1' }
  return probePixels.map(([x, y]) => {
    // Exactly what a tap does: the container pixel becomes a coordinate...
    const ll = map.unproject([x, y])
    // ...and must come back to the pixel it started from.
    const back = map.project(ll)
    return {
      pixel: x + ',' + y,
      lngLat: ll.lng.toFixed(6) + ',' + ll.lat.toFixed(6),
      back: Math.round(back.x * 100) / 100 + ',' + Math.round(back.y * 100) / 100,
      dx: Math.round((back.x - x) * 100) / 100,
      dy: Math.round((back.y - y) * 100) / 100,
    }
  })
})`

export const CAPTURE_ROUND_TRIP = `(() => {
  const map = window.__probe?.map
  if (!map) return { error: 'no probe: load with ?probe=1' }

  const canvas = map.getCanvas()
  const capture = {
    width: canvas.clientWidth,
    height: canvas.clientHeight,
    camera: {
      center: [map.getCenter().lng, map.getCenter().lat],
      zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch(),
    },
  }

  /*
   * The same snap-there-and-back the real handle does, so this exercises the
   * recorded camera rather than whatever the map happens to be showing now.
   */
  const withCamera = (fn) => {
    const now = map.getCenter()
    const restore = { center: [now.lng, now.lat], zoom: map.getZoom(),
                      bearing: map.getBearing(), pitch: map.getPitch() }
    map.jumpTo(capture.camera)
    const out = fn()
    map.jumpTo(restore)
    return out
  }

  // Normalised image coordinates spread across the frame, including corners.
  const points = [[0.1, 0.1], [0.5, 0.5], [0.9, 0.2], [0.25, 0.8], [0.5, 0.15]]

  const metres = (a, b) => {
    const R = 6371008.8, toRad = (d) => (d * Math.PI) / 180
    const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lng - a.lng)
    const la1 = toRad(a.lat), la2 = toRad(b.lat)
    const h = Math.sin(dLat/2)**2 + Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
  }

  return withCamera(() => points.map(([nx, ny]) => {
    const ll = map.unproject([nx * capture.width, ny * capture.height])
    const p = map.project(ll)
    const backNorm = { x: p.x / capture.width, y: p.y / capture.height }
    const ll2 = map.unproject([backNorm.x * capture.width, backNorm.y * capture.height])
    return {
      norm: nx + ',' + ny,
      backNorm: Math.round(backNorm.x * 1e4) / 1e4 + ',' + Math.round(backNorm.y * 1e4) / 1e4,
      dNormX: Math.round((backNorm.x - nx) * 1e6) / 1e6,
      dNormY: Math.round((backNorm.y - ny) * 1e6) / 1e6,
      driftMetres: Math.round(metres(ll, ll2) * 1000) / 1000,
    }
  }))
})()`

/*
 * MARKER ANCHORING.
 *
 * The projection can be exact and the marker still land in the wrong place,
 * because a maplibre marker is positioned by translating ITS OWN BOX. Two ways
 * that goes wrong, both of which shipped:
 *
 *   - the element is block level and stretches to the container, so an anchor
 *     of translate(-50%) shifts it by half the screen
 *   - the element is given `position: relative`, overriding maplibre's
 *     `absolute`, so it is laid out in flow and translated from there; every
 *     marker then sits below the ones before it
 *
 * Neither is visible to a projection round trip, so they get their own check.
 */
export const MARKER_ANCHORS = `(() => {
  const container = document.querySelector('.maplibregl-canvas-container')
  if (!container) return { error: 'no map' }
  const width = container.getBoundingClientRect().width
  const bad = []
  for (const el of document.querySelectorAll('.maplibregl-marker')) {
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    const name = String(el.className).split(' ')[0]
    if (cs.position !== 'absolute') {
      bad.push({ marker: name, problem: 'position is ' + cs.position + ', not absolute' })
    }
    // A marker wider than half the map is stretching, not sizing to its content.
    if (r.width > width / 2) {
      bad.push({ marker: name, problem: 'stretches to ' + Math.round(r.width) + 'px' })
    }
  }
  return bad
})()`

/*
 * Fixtures live beside this script, so the audits run from a fresh clone and
 * from a git hook without anything being staged into a scratch directory
 * first. An explicit directory argument still overrides, for a one-off.
 */
const HERE = new URL('.', import.meta.url).pathname
const FIXTURES = process.argv[2] ?? HERE
const { ev, ws, wait, send, errs } = await (await import(FIXTURES + '/cdp.mjs')).connect()
setTimeout(() => { console.log('TIMED OUT'); process.exit(2) }, 290000)
const show = (l, v) => console.log('\n### ' + l + '\n' + JSON.stringify(v, null, 2))

let failures = 0
const PIXELS = [[100, 200], [195, 420], [300, 600], [20, 60], [370, 780]]

const checkPixels = async (label) => {
  const rows = await ev(`${PIXEL_ROUND_TRIP}(${JSON.stringify(PIXELS)})`)
  if (rows?.error) { console.log(label, rows.error); failures += 1; return }
  const worst = Math.max(...rows.map((r) => Math.max(Math.abs(r.dx), Math.abs(r.dy))))
  const bad = worst > TOLERANCE_PX
  if (bad) failures += 1
  show(`${label}  worst delta ${worst}px  ${bad ? 'FAIL' : 'ok'}`, rows)
}

const checkMarkers = async (label) => {
  const bad = await ev(MARKER_ANCHORS)
  if (bad?.error) return
  if (bad.length > 0) failures += bad.length
  show(`${label}  ${bad.length === 0 ? 'ok' : 'FAIL'}`, bad)
}

const checkCapture = async (label) => {
  const rows = await ev(CAPTURE_ROUND_TRIP)
  if (rows?.error) { console.log(label, rows.error); failures += 1; return }
  const worstDrift = Math.max(...rows.map((r) => r.driftMetres))
  const bad = worstDrift > TOLERANCE_METRES
  if (bad) failures += 1
  show(`${label}  worst drift ${worstDrift}m  ${bad ? 'FAIL' : 'ok'}`, rows)
}

const zoomTo = (z) => ev(`window.__probe.map.jumpTo({ zoom: ${z} }), 'ok'`)

await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true })
await ev(`localStorage.clear()`)
await send('Page.navigate', { url: 'http://127.0.0.1:5173/?calibration=1&probe=1' })
await wait(8000)

for (const [z, name] of [[13, 'wide'], [16, 'mid'], [19, 'tight']]) {
  await zoomTo(z); await wait(600)
  await checkPixels(`SETUP · zoom ${z} (${name})`)
}

await checkMarkers('SETUP · marker anchoring')

await ev(`[...document.querySelectorAll('.rail__btn')].find(b=>/Plan/.test(b.textContent))?.click()`)
await wait(4000)
await ev(`[...document.querySelectorAll('.act')].find(b=>/Suggest/.test(b.textContent))?.click()`)
await wait(12000)
await checkMarkers('PLAN · marker anchoring, several positions')
for (const [z, name] of [[13, 'wide'], [16, 'mid'], [19, 'tight']]) {
  await zoomTo(z); await wait(600)
  await checkPixels(`PLAN · sheet closed · zoom ${z} (${name})`)
}
await ev(`document.querySelector('.peek__summary')?.click()`)
await wait(1200)
for (const [z, name] of [[13, 'wide'], [16, 'mid'], [19, 'tight']]) {
  await zoomTo(z); await wait(600)
  await checkPixels(`PLAN · sheet OPEN · zoom ${z} (${name})`)
}
await ev(`document.querySelector('.peek__summary')?.click()`)
await wait(900)

/* The capture pair, flat and then under pitch and rotation. */
for (const [pitch, bearing] of [[0, 0], [60, 0], [45, 137], [60, -82]]) {
  await ev(`window.__probe.map.jumpTo({ zoom: 16, pitch: ${pitch}, bearing: ${bearing} }), 'ok'`)
  await wait(700)
  await checkCapture(`capture pair · pitch ${pitch} bearing ${bearing}`)
}

console.log('\n=== PROJECTION FAILURES: ' + failures + ' ===')
if (errs.length > 0) console.log('console errors:', JSON.stringify(errs.slice(0, 3)))
ws.close()
process.exit(failures === 0 ? 0 : 1)
