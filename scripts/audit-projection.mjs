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

import { guardAudit, startWatchdog } from './preflight.mjs'

/*
 * ARMED BEFORE ANYTHING ELSE CAN THROW.
 *
 * This audit used to die on a TypeError when the thing it needed was not
 * there, printing a stack trace into a log the commit hook greps for a problem
 * count. It matched nothing, so the hook refused the commit with one red line
 * and no reason. Any throw from here on prints one sentence saying the audit
 * could not LOOK, and exits 2 so that is distinguishable from a problem found.
 */
guardAudit('projection')


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
 * BEARING LINE EXTENT.
 *
 * A bearing has no length. The sun, shadow, sunrise and sunset lines show a
 * compass direction, so they have to run off the edge of the frame at whatever
 * the frame is currently showing. They used to be a fixed 1200m and 900m,
 * which measured 15px against a 930px diagonal at zoom 10: the labels were
 * visible with no lines under them, and at zoom 18 the same lines ran 3848px.
 *
 * Checked against the REAL map rather than a model of it, because the claim is
 * about pixels, and checked under pitch and bearing as well, where a line
 * drawn in screen space would be wrong.
 *
 * TWO DIFFERENT ASSERTIONS, AND WHY.
 *
 * Flat, the rule is the simple one: at least the viewport diagonal long on
 * screen. Under pitch it cannot be, and that is geometry rather than a bug. A
 * line heading toward the horizon converges ON the horizon, which sits at a
 * fixed screen row, so its pixel length has a ceiling no distance can beat:
 * measured at zoom 16 pitch 60, pushing the far end from 4km to 4096km moved
 * it from 548px to 731px and no further, against a 930px diagonal. The 731px
 * line does leave the frame, with its far end 397px above the top edge. So
 * under pitch the assertion is the one that actually matters, which is that
 * the line leaves the frame at all.
 */
export const BEARING_LINE_EXTENT = `(() => {
  const map = window.__probe?.map
  if (!map) return { error: 'no probe: load with ?probe=1' }
  const c = map.getCanvas()
  const diagonal = Math.hypot(c.clientWidth, c.clientHeight)
  const rows = []
  for (const src of ['sun-axis', 'sun-rays']) {
    const data = map.getStyle().sources[src]?.data
    if (!data || !data.features) continue
    for (const f of data.features) {
      const co = f.geometry.coordinates
      const a = map.project(co[0]), b = map.project(co[co.length - 1])
      const lengthPx = Math.hypot(b.x - a.x, b.y - a.y)
      const outside = (p) => p.x < 0 || p.x > c.clientWidth || p.y < 0 || p.y > c.clientHeight
      rows.push({
        kind: f.properties.kind ?? 'sun-axis',
        lengthPx: Math.round(lengthPx),
        diagonalPx: Math.round(diagonal),
        /* An axis line runs both ways from the pin, so each END must be clear. */
        /*
         * A ray STARTS at the pin, which is on the frame on purpose, so only
         * its far end has to clear it. An axis line runs both ways from the
         * pin, so both of its ends are far ends.
         */
        leavesFrame:
          (f.properties.kind ?? 'sun-axis') === 'sun-axis'
            ? outside(a) && outside(b)
            : outside(b),
        shortfallPx: Math.round(Math.min(0, lengthPx - diagonal)),
      })
    }
  }
  if (rows.length === 0) return { error: 'no bearing lines drawn' }
  return rows
})()`

/*
 * Fixtures live beside this script, so the audits run from a fresh clone and
 * from a git hook without anything being staged into a scratch directory
 * first. An explicit directory argument still overrides, for a one-off.
 */
const HERE = new URL('.', import.meta.url).pathname
const FIXTURES = process.argv[2] ?? HERE
const { ev, ws, wait, send, errs, dispose } = await (await import(FIXTURES + '/cdp.mjs')).connect()
const watchdog = startWatchdog('projection')
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

const checkBearingLines = async (label, pitched = false) => {
  const rows = await ev(BEARING_LINE_EXTENT)
  if (rows?.error) { console.log(label, rows.error); failures += 1; return }
  const bad = pitched
    ? rows.filter((r) => !r.leavesFrame)
    : rows.filter((r) => r.shortfallPx < 0)
  if (bad.length > 0) failures += bad.length
  const worst = Math.min(...rows.map((r) => r.lengthPx))
  const rule = pitched
    ? `${rows.filter((r) => r.leavesFrame).length}/${rows.length} leave the frame`
    : `shortest ${worst}px / ${rows[0].diagonalPx}px diagonal`
  console.log(
    `  ${label.padEnd(34)} ${rule.padEnd(34)} ` +
      (bad.length === 0 ? 'ok' : 'FAIL ' + bad.map((r) => r.kind).join(',')),
  )
  if (bad.length > 0) show(label, bad)
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

/*
 * THE COLD START, BEFORE ANYTHING ELSE TOUCHES THE MAP.
 *
 * It used to open at zoom 16.5 on the calibration venue in Salisbury
 * Maryland, which told every new user they were standing in one particular car
 * park on the Eastern Shore. Checked here because the camera is this file's
 * business and because a default like that comes back quietly.
 */
await send('Page.navigate', { url: 'about:blank' })
await ev(`localStorage.clear()`)
await send('Page.navigate', { url: 'http://127.0.0.1:5173/?probe=1' })
await wait(8000)
{
  const cold = await ev(`(() => {
    const m = window.__probe?.map
    if (!m) return { error: 'no probe' }
    const R = 6371008.8, rad = (d) => (d * Math.PI) / 180
    const c = m.getCenter()
    const away = (lat, lon) => {
      const dLat = rad(lat - c.lat), dLon = rad(lon - c.lng)
      const h = Math.sin(dLat/2)**2 + Math.cos(rad(c.lat))*Math.cos(rad(lat))*Math.sin(dLon/2)**2
      return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
    }
    return {
      zoom: Math.round(m.getZoom() * 100) / 100,
      kmFromCalibrationVenue: Math.round(away(38.364236, -75.605912) / 1000),
      offersUseMyLocation: document.querySelector('.locate__btn') !== null,
    }
  })()`)
  const bad =
    cold.error !== undefined ||
    cold.zoom > 5 ||
    cold.kmFromCalibrationVenue < 1000 ||
    !cold.offersUseMyLocation
  if (bad) failures += 1
  show(`cold start  ${bad ? 'FAIL' : 'ok'}`, cold)
}

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

/*
 * JOB 2: every zoom from 10 to 20, each bearing line at least the viewport
 * diagonal on screen. Then the same under pitch and rotation, where a line
 * sized in screen space would be wrong.
 */
await ev(`window.__probe.map.jumpTo({ pitch: 0, bearing: 0 }), 'ok'`)
await wait(500)
console.log('\n### bearing lines reach the frame edge')
for (let z = 10; z <= 20; z++) {
  await zoomTo(z); await wait(350)
  await checkBearingLines(`zoom ${z}`)
}
for (const [zoom, pitch, bearing] of [[12, 60, 0], [16, 60, 0], [16, 45, 137], [19, 60, -82], [11, 50, 215]]) {
  await ev(`window.__probe.map.jumpTo({ zoom: ${zoom}, pitch: ${pitch}, bearing: ${bearing} }), 'ok'`)
  await wait(500)
  await checkBearingLines(`zoom ${zoom} pitch ${pitch} bearing ${bearing}`, true)
}

console.log('\n=== PROJECTION FAILURES: ' + failures + ' ===')
if (errs.length > 0) console.log('console errors:', JSON.stringify(errs.slice(0, 3)))
watchdog.stop()
ws.close()
await dispose()
process.exit(failures === 0 ? 0 : 1)
