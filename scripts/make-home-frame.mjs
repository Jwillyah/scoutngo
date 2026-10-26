/*
 * THE HOME PAGE'S BACKDROP: THE REAL MAP, AND WHERE THE APP PUT THINGS ON IT.
 *
 * Usage:  node scripts/make-home-frame.mjs   (app on :5173, Chrome on :9222)
 * Writes: public/home-frame.jpg, src/data/homeFrame.json and
 *         measurements/<today>-home-frame.md
 * Exits:  0 written; 2 could not look (nothing captured).
 *
 * WHAT CHANGED FROM THE COVER FRAME. The cover was a screenshot with the
 * app's own markers burned in. The home page draws its markers as golden
 * bubble pins, so this takes the picture WITHOUT the app's overlays and
 * records, from the same live map, where each position, its cone and the
 * sun line fall on the glass. The home page draws them at those points.
 * Nothing is placed by hand: the positions are Suggest's, the cones are the
 * app's cone polygons, the sun line is the app's sun ray, and every screen
 * point is map.project() on the frame being photographed.
 *
 * THE COMPOSITION. Turned so the sun is straight up the screen, toward the
 * sun the home page draws on its horizon, and tilted so the far ground runs
 * up under the sunset gradient while the positions sit in the clear band
 * between the brand and the button.
 *
 * THE GUARDS, from the cover's history (docs/failure-modes.md, shape C):
 *   the map canvas is what is at the sample points, not a page over it
 *   the tiles are idle before the shutter, not a timer
 *   no slab of near-black in the frame
 *   at least two positions with cones and a sun line, or nothing is written
 */
import { writeFileSync } from 'node:fs'
import { connect } from './cdp.mjs'
import { goToStage, guardAudit, pressSuggest, startWatchdog } from './preflight.mjs'

guardAudit('home frame')
const VIEWPORT = { width: 390, height: 844, deviceScaleFactor: 3, mobile: true }
/* The band the positions must land in: under the brand, over the button. */
const BAND = { top: 470, bottom: 720, left: 30, right: 360 }
/*
 * THE FIRST THREE, in the plan's own order. Suggest places five; five pins in
 * one band is a crowd, and three already shows what the app does.
 */
const SHOWN = 3

const watchdog = startWatchdog('home frame')
const { ev, wait, send, dispose } = await connect()
const step = async (label, expression) => {
  const got = await ev(expression)
  console.log(`  ${String(label).padEnd(24)} ${typeof got === 'string' ? got : JSON.stringify(got)}`)
  return got
}

let result = null
try {
  await send('Emulation.setDeviceMetricsOverride', VIEWPORT)
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/' })
  await wait(2500)
  await ev(`localStorage.clear(); localStorage.setItem('scoutngo.landing.v1', 'true')`)
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/?calibration=1&probe=1' })
  await wait(9000)
  await goToStage(ev, wait, 'plan')
  await wait(2000)
  await pressSuggest(ev, wait)
  await wait(1500)
  await step('cones on', `(() => {
    const b = [...document.querySelectorAll('.tooldock__btn')].find((x) => /lens sees/i.test(x.getAttribute('aria-label') ?? ''))
    if (!b) return 'no lens button'
    if (b.getAttribute('aria-pressed') !== 'true') b.click()
    return 'on'
  })()`)
  await wait(1500)

  /* Turn, tilt and frame on the positions. */
  const camera = await step('camera', `(async () => {
    const m = window.__probe.map
    const cones = (m.getStyle().sources['fov-cones']?.data?.features ?? []).slice(0, ${SHOWN})
    const sun = (m.getStyle().sources['sun-rays']?.data?.features ?? []).find((f) => f.properties.kind === 'sun')
    if (cones.length < 2 || !sun) return JSON.stringify({ error: 'cones ' + cones.length + ', sun ray ' + !!sun })
    const [a, b] = sun.geometry.coordinates
    const toRad = (d) => d * Math.PI / 180
    const y = Math.sin(toRad(b[0] - a[0])) * Math.cos(toRad(b[1]))
    const x = Math.cos(toRad(a[1])) * Math.sin(toRad(b[1])) - Math.sin(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.cos(toRad(b[0] - a[0]))
    const sunBearing = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
    const apexes = cones.map((f) => f.geometry.coordinates[0][0])
    const lng = apexes.reduce((s, p) => s + p[0], 0) / apexes.length
    const lat = apexes.reduce((s, p) => s + p[1], 0) / apexes.length
    m.setPadding({ top: 0, right: 0, bottom: 0, left: 0 })
    m.jumpTo({ center: [lng, lat], bearing: sunBearing, pitch: 45, zoom: 17 })
    /* Slide the positions' middle down into the band, then fit their spread to it. */
    for (let i = 0; i < 12; i += 1) {
      const pts = apexes.map((p) => m.project(p))
      const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y)
      const spreadX = Math.max(...xs) - Math.min(...xs), spreadY = Math.max(...ys) - Math.min(...ys)
      const want = Math.min((${BAND.right - BAND.left} * 0.7) / Math.max(spreadX, 1), (${BAND.bottom - BAND.top} * 0.6) / Math.max(spreadY, 1))
      const zoom = Math.min(18.5, m.getZoom() + Math.log2(Math.max(0.25, Math.min(4, want))))
      const midX = (Math.max(...xs) + Math.min(...xs)) / 2, midY = (Math.max(...ys) + Math.min(...ys)) / 2
      const target = [${(BAND.left + BAND.right) / 2}, ${(BAND.top + BAND.bottom) / 2}]
      const c = m.project(m.getCenter())
      const moved = m.unproject([c.x + (midX - target[0]), c.y + (midY - target[1])])
      m.jumpTo({ center: moved, zoom })
    }
    return JSON.stringify({ sunBearing: +sunBearing.toFixed(1), zoom: +m.getZoom().toFixed(2), pitch: m.getPitch(), terrain: m.getTerrain() !== null })
  })()`)
  const cam = JSON.parse(camera)
  if (cam.error) throw new Error(cam.error)

  /* Hide everything that is not the map's imagery: chrome, markers, and the app's own layers. */
  await step('hide overlays', `(() => {
    const m = window.__probe.map
    const keep = new Set(['raster', 'background', 'hillshade', 'sky', 'fill-extrusion', 'color-relief'])
    const hidden = []
    for (const l of m.getStyle().layers) if (!keep.has(l.type)) { m.setLayoutProperty(l.id, 'visibility', 'none'); hidden.push(l.id) }
    const s = document.createElement('style')
    s.textContent = 'body * { visibility: hidden !important } .maplibregl-canvas-container, .maplibregl-canvas { visibility: visible !important } .maplibregl-marker { display: none !important }'
    document.head.appendChild(s)
    return hidden.length + ' layers hidden'
  })()`)

  const settled = await ev(`new Promise((resolve) => {
    const m = window.__probe.map
    m.triggerRepaint()
    const done = () => { m.off('idle', done); clearTimeout(cap); resolve('idle') }
    const cap = setTimeout(() => { m.off('idle', done); resolve('TIMED OUT waiting for idle') }, 25000)
    m.on('idle', done)
  })`)
  console.log(`  ${'tiles'.padEnd(24)} ${settled}`)
  if (String(settled).startsWith('TIMED OUT')) throw new Error('the map never went idle; the frame would have holes')
  await wait(1200)

  /* The map is what is on the glass: sampled, not assumed. */
  const glass = await ev(`(() => {
    let hits = 0, total = 0
    for (let y = 20; y < innerHeight; y += 40) for (let x = 15; x < innerWidth; x += 40) {
      total += 1
      if (document.elementFromPoint(x, y)?.classList.contains('maplibregl-canvas')) hits += 1
    }
    return +(hits / total).toFixed(3)
  })()`)
  console.log(`  ${'map is the frame'.padEnd(24)} ${glass}`)
  if (glass < 0.95) throw new Error(`only ${glass} of the sample points are the map canvas`)

  const darkness = await ev(`(() => {
    const canvas = document.querySelector('.maplibregl-canvas')
    const off = document.createElement('canvas'); off.width = canvas.width; off.height = canvas.height
    const ctx = off.getContext('2d'); ctx.drawImage(canvas, 0, 0)
    let dark = 0, total = 0
    for (let y = 0; y < off.height; y += Math.max(1, Math.floor(off.height / 120)))
      for (let x = 0; x < off.width; x += Math.max(1, Math.floor(off.width / 60))) {
        const d = ctx.getImageData(x, y, 1, 1).data; total += 1
        if (d[0] < 22 && d[1] < 22 && d[2] < 22) dark += 1
      }
    return +(dark / total).toFixed(3)
  })()`)
  console.log(`  ${'near-black share'.padEnd(24)} ${darkness}`)
  if (darkness > 0.12) throw new Error(`${Math.round(darkness * 100)}% of the frame is near-black: a rendering hole`)

  /* Where the app put things, on this exact frame. */
  const overlay = JSON.parse(await ev(`(() => {
    const m = window.__probe.map
    const r = (n) => Math.round(n * 10) / 10
    const pt = (c) => { const p = m.project(c); return [r(p.x), r(p.y)] }
    /* Numbered in the plan's order, which is the order the source holds them in and the order the app numbers them. */
    const cones = (m.getStyle().sources['fov-cones']?.data?.features ?? []).slice(0, ${SHOWN})
    const positions = cones.map((f, i) => {
      const ring = f.geometry.coordinates[0]
      return { number: i + 1, apex: pt(ring[0]), cone: ring.slice(1, -1).map(pt), lighting: f.properties.lighting, platform: f.properties.platform }
    })
    const sun = (m.getStyle().sources['sun-rays']?.data?.features ?? []).find((f) => f.properties.kind === 'sun')
    return JSON.stringify({ width: innerWidth, height: innerHeight, positions, sunLine: sun ? sun.geometry.coordinates.map(pt) : null })
  })()`))
  console.log(`  ${'recorded'.padEnd(24)} ${overlay.positions.length} positions, sun line ${overlay.sunLine === null ? 'none' : 'yes'}`)
  if (overlay.positions.length < 2 || overlay.sunLine === null) throw new Error('need two positions with cones and a sun line')
  const inBand = overlay.positions.filter((p) => p.apex[1] >= BAND.top - 40 && p.apex[1] <= BAND.bottom + 20).length
  console.log(`  ${'positions in the band'.padEnd(24)} ${inBand} of ${overlay.positions.length}`)

  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 84 })
  const bytes = Buffer.from(shot.result?.data ?? shot.data, 'base64')
  writeFileSync('public/home-frame.jpg', bytes)
  writeFileSync('src/data/homeFrame.json', JSON.stringify({ ...overlay, camera: cam }, null, 1) + '\n')
  result = { cam, overlay, bytes: bytes.length, glass, darkness, inBand }
} finally {
  watchdog.stop()
  await dispose()
}

if (result === null) {
  console.log('\n=== HOME FRAME ABORTED: nothing was captured ===')
  process.exit(2)
}

const today = new Date().toISOString().slice(0, 10)
const out = `measurements/${today}-home-frame.md`
writeFileSync(out, [
  '# The home page backdrop',
  '',
  `Run: ${new Date().toISOString()} · node scripts/make-home-frame.mjs · calibration venue, Suggest, 390 x 844 at 3x`,
  '',
  `- camera: bearing ${result.cam.sunBearing}° (the sun straight up the screen), pitch ${result.cam.pitch}°, zoom ${result.cam.zoom}, terrain ${result.cam.terrain ? 'on' : 'off'}`,
  `- map canvas at ${Math.round(result.glass * 100)}% of the sample points; near-black share ${result.darkness}`,
  `- ${result.overlay.positions.length} positions recorded, ${result.inBand} inside the clear band (y ${BAND.top} to ${BAND.bottom})`,
  `- public/home-frame.jpg, ${Math.round(result.bytes / 1024)} KB; screen points in src/data/homeFrame.json`,
  '',
  '| position | apex (px) | lighting | platform |',
  '|---|---|---|---|',
  ...result.overlay.positions.map((p) => `| ${p.number} | ${p.apex.join(', ')} | ${p.lighting} | ${p.platform} |`),
  '',
].join('\n'))
console.log(`wrote public/home-frame.jpg, src/data/homeFrame.json, ${out}`)
