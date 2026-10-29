/*
 * BIG BUILDINGS DO NOT HIDE THE PHOTO, 2D, IN WEBKIT, AS A TAB AND STANDALONE.
 *
 * Usage:  node scripts/audit-buildings.mjs [screenshot-dir]
 *
 * WHY THIS EXISTS. 29 Oct: Hampton Coliseum at z17 drew as a solid grey
 * jagged slab over the satellite. Flat, a building is its outline over a
 * fill of at most BUILDING_TOP_OPACITY (MapView.tsx); only shadows are solid,
 * and a building's shadow no longer covers its own lit roof
 * (src/lib/shadowLayer.ts): the slab was the shadow, swept from the footprint
 * and drawn over it.
 *
 * HOW, ON THE GLASS. The biggest building in view, flat at z17: inside it
 * (kept clear of its edges), the spread of brightness with the building
 * layers over the spread with them hidden, which is the share of the photo's
 * detail that shows through. At least KEPT; the audit puts the old grey box
 * back, drawn flat, to prove it fails.
 * Tilted, the boxes come back. The shadow note is one line.
 */
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { webkit, devices } from 'playwright'
import { ensureApp, goToStage, guardAudit, startWatchdog } from './preflight.mjs'
import { shareLink } from '../src/lib/planShare.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'
import { placeKey } from '../src/core/venueName.ts'

guardAudit('buildings')
const watchdog = startWatchdog('buildings', 420_000)
const OUT = process.argv[2] ?? join(process.env.SCOUTNGO_OUT ?? tmpdir(), 'buildings')
mkdirSync(OUT, { recursive: true })

/* Nominatim's point for Hampton Coliseum, 1000 Coliseum Drive. */
const COLISEUM = { lat: 37.0347, lon: -76.3814 }
/* The share of the photo's detail that must survive the flat building layers. */
const KEPT = 0.7
await ensureApp()
const venue = { ...CALIBRATION_VENUE, name: { key: placeKey(String(COLISEUM.lat), String(COLISEUM.lon)), name: 'Hampton Coliseum' }, latitude: String(COLISEUM.lat), longitude: String(COLISEUM.lon), date: '2026-10-29', startTime: '15:00', endTime: '16:00' }
const url = new URL(await shareLink('http://127.0.0.1:5173/', { id: 'hc', name: 'Buildings check', savedAt: '2026-10-29T00:00:00Z', venue, kit: { bodyIds: [], lensIds: [], droneIds: [], styleNotes: '' }, positions: [] }))
url.searchParams.set('probe', '1')

let problems = 0
let looked = 0
const fail = (why) => {
  console.log('      PROBLEM: ' + why)
  problems += 1
}

/* In the page: the Coliseum's inside (the building under its point), as screen points at least 6 px from its edges. */
const INSIDE = `(() => {
  const map = window.__probe.map
  const at = map.project([${COLISEUM.lon}, ${COLISEUM.lat}])
  const feats = map.querySourceFeatures('osm-buildings').filter((f) => f.geometry.type === 'Polygon')
  const has = (ring, x, y) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c } return c }
  let best = null, bestArea = 0
  for (const f of feats) {
    const ring = f.geometry.coordinates[0].map(([lon, lat]) => { const p = map.project([lon, lat]); return [p.x, p.y] })
    if (!has(ring, at.x, at.y)) continue
    let a = 0
    for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
    a = Math.abs(a) / 2
    if (a > bestArea) { bestArea = a; best = ring }
  }
  if (best === null) return { area: 0, points: [] }
  const xs = best.map((p) => p[0]), ys = best.map((p) => p[1])
  const bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map(Math.round)
  const inside = (x, y) => { let c = false; for (let i = 0, j = best.length - 1; i < best.length; j = i++) { const [xi, yi] = best[i], [xj, yj] = best[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c } return c }
  const edge = (x, y) => { let m = Infinity; for (let i = 0; i < best.length - 1; i++) { const [x1, y1] = best[i], [x2, y2] = best[i + 1]; const dx = x2 - x1, dy = y2 - y1, t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy || 1))); m = Math.min(m, Math.hypot(x - x1 - t * dx, y - y1 - t * dy)) } return m }
  const points = []
  const sheetTop = document.querySelector('.sheet')?.getBoundingClientRect().top ?? innerHeight
  for (let x = 4; x < innerWidth - 4; x += 6) for (let y = 120; y < Math.min(innerHeight, sheetTop) - 10; y += 6) if (inside(x, y) && edge(x, y) > 6) points.push([x, y])
  return { area: Math.round(bestArea), points, bbox, sheetTop: Math.round(sheetTop) }
})()`

/*
 * In the page: how much of the photo's detail survives the building layers,
 * inside the footprint: the spread (standard deviation) of brightness with
 * them, over the spread without. A colour difference cannot do it: the
 * Coliseum's roof is grey, nearly the old fill's grey.
 */
const kept = (a, b, points) => `(async () => {
  const read = (b64) => new Promise((ok) => { const img = new Image(); img.onload = () => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); ok({ g, s: img.width / innerWidth }) }; img.src = 'data:image/png;base64,' + b64 })
  const A = await read(${JSON.stringify(a)}), B = await read(${JSON.stringify(b)})
  const pts = ${JSON.stringify(points)}
  const lum = (I, x, y) => { const p = I.g.getImageData(Math.round(x * I.s), Math.round(y * I.s), 1, 1).data; return 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2] }
  const sd = (xs) => { const m = xs.reduce((s, v) => s + v, 0) / xs.length; return Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / xs.length) }
  if (pts.length === 0) return null
  const on = sd(pts.map(([x, y]) => lum(A, x, y))), off = sd(pts.map(([x, y]) => lum(B, x, y)))
  return off < 1 ? null : on / off
})()`

const LAYERS = ['osm-buildings-extrusion', 'osm-buildings-top', 'osm-buildings-edge']
const browser = await webkit.launch()
try {
  for (const [label, insets] of [['browser', { top: 0, bottom: 0 }], ['standalone', { top: 47, bottom: 34 }]]) {
    console.log(`\n### ${label}`)
    const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } })
    await ctx.addInitScript(([top, bottom]) => {
      const add = () => {
        const s = document.createElement('style')
        s.textContent = `:root{--safe-top:${top}px!important;--safe-bottom:${bottom}px!important}`
        document.head.appendChild(s)
      }
      if (document.head) add()
      else document.addEventListener('DOMContentLoaded', add)
    }, [insets.top, insets.bottom])
    const page = await ctx.newPage()
    const wait = (ms) => page.waitForTimeout(ms)
    const ev = (x) => page.evaluate(x)
    await page.goto(url.href)
    await wait(3500)
    await page.getByRole('button', { name: /^open$/i }).click({ timeout: 4000 }).catch(() => {})
    await wait(1500)
    await page.getByText('Open the map', { exact: true }).click({ timeout: 4000 }).catch(() => {})
    await wait(1500)
    await goToStage(ev, wait, 'plan')
    await wait(3000)
    await page.locator('button[aria-label="Map and layers"]').tap()
    await wait(900)
    await ev(`[...document.querySelectorAll('button.tile')].find(t => t.querySelector('.tile__label')?.textContent === 'Buildings')?.click()`)
    await wait(600)
    /* The sheet down to its lowest detent, the way a thumb does it, so the map is open. */
    for (let k = 0; k < 3; k += 1) {
      const g = await page.locator('.sheet__grab').boundingBox()
      if (g === null) break
      const gx = g.x + g.width / 2
      const gy = g.y + g.height / 2
      await page.mouse.move(gx, gy)
      await page.mouse.down()
      for (let i = 1; i <= 10; i += 1) {
        await page.mouse.move(gx, gy + (300 * i) / 10)
        await wait(30)
      }
      await page.mouse.up()
      await wait(900)
    }
    await ev(`window.__probe.map.jumpTo({ center: [${COLISEUM.lon}, ${COLISEUM.lat}], zoom: 17, pitch: 0, bearing: 0 })`)
    let inside = { area: 0, points: [] }
    for (let i = 0; i < 40 && inside.points.length < 200; i += 1) {
      await wait(1000)
      inside = await ev(INSIDE)
    }
    console.log(`  the building under the Coliseum's point: ${inside.area} px², ${inside.points.length} points inside, box ${JSON.stringify(inside.bbox)}, sheet top ${inside.sheetTop}`)
    if (inside.points.length < 200) throw new Error(`${label}: no big building drawn at the Coliseum (${inside.points.length} points), so nothing to compare`)
    await ev(`new Promise((r) => { const m = window.__probe.map; if (m.loaded()) r(); else m.once('idle', r) })`)
    await wait(1200)
    const state = await ev(`(() => { const m = window.__probe.map; return ${JSON.stringify(LAYERS)}.map((id) => m.getLayer(id) ? m.getLayoutProperty(id, 'visibility') ?? 'visible' : 'absent') })()`)
    console.log(`  flat: extrusion ${state[0]}, top ${state[1]}, edge ${state[2]}`)
    if (state[0] !== 'none' || state[1] !== 'visible' || state[2] !== 'visible') fail(`${label}: flat, the layers are ${JSON.stringify(state)}, not boxes off and outlines on`)

    const shot = async (name) => (await page.screenshot(name === null ? {} : { path: join(OUT, `${name}-${label}.png`) })).toString('base64')
    const on = await shot('coliseum')
    /* The bare photo: the building layers AND the shadows off, so a shadow drawn over the roof counts too. */
    await ev(`(() => { const m = window.__probe.map; for (const id of [...${JSON.stringify(LAYERS)}, 'shadow-fill']) if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', 'none'); m.triggerRepaint() })()`)
    await wait(800)
    const off = await shot('bare')
    const share = await ev(kept(on, off, inside.points))
    looked += 1
    if (share === null) throw new Error(`${label}: the photo inside the footprint has no detail to keep, so nothing was measured`)
    console.log(`  the photo's detail kept inside the footprint: ${(share * 100).toFixed(0)}% (at least ${KEPT * 100}%)`)
    if (share < KEPT) fail(`${label}: only ${(share * 100).toFixed(0)}% of the photo's detail shows through the Coliseum's roof`)

    /* It can fail: the old state put back, the 0.8 grey box drawn flat, as on 29 Oct. */
    await ev(`(() => { const m = window.__probe.map; m.setLayoutProperty('osm-buildings-extrusion', 'visibility', 'visible'); m.setLayoutProperty('shadow-fill', 'visibility', 'visible'); m.triggerRepaint() })()`)
    await wait(800)
    const slab = await ev(kept(await shot('oldroof'), off, inside.points))
    console.log(`  with the old box drawn flat: ${(slab * 100).toFixed(0)}% kept`)
    if (!(slab < KEPT)) fail(`${label}: the old box still keeps ${(slab * 100).toFixed(0)}% of the detail, so the check cannot tell a slab from a photo`)

    /* Tilted: the boxes come back. */
    await ev(`(() => { const m = window.__probe.map; for (const id of ['osm-buildings-top', 'osm-buildings-edge']) m.setLayoutProperty(id, 'visibility', 'visible'); m.setLayoutProperty('osm-buildings-extrusion', 'visibility', 'none'); m.jumpTo({ pitch: 50 }) })()`)
    await wait(1000)
    const tilted = await ev(`(() => { const m = window.__probe.map; return ${JSON.stringify(LAYERS)}.map((id) => m.getLayoutProperty(id, 'visibility') ?? 'visible') })()`)
    console.log(`  tilted: extrusion ${tilted[0]}, top ${tilted[1]}, edge ${tilted[2]}`)
    if (tilted[0] !== 'visible' || tilted[1] !== 'none') fail(`${label}: tilted, the layers are ${JSON.stringify(tilted)}`)
    await page.screenshot({ path: join(OUT, `coliseum-tilted-${label}.png`) })
    await ev(`window.__probe.map.jumpTo({ pitch: 0 })`)
    await wait(600)

    const note = await ev(`(() => { const n = document.querySelector('.shadowkey'); if (!n) return null; const cs = getComputedStyle(n); return { h: n.getBoundingClientRect().height, line: parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.35, ws: cs.whiteSpace, text: n.textContent } })()`)
    console.log(`  shadow note: ${JSON.stringify(note)}`)
    if (note !== null && (note.ws !== 'nowrap' || note.h > note.line * 1.5 + 2 * 4 + 2)) fail(`${label}: the shadow note is more than one line (${JSON.stringify(note)})`)
    await ctx.close()
    watchdog.note(label)
  }
} finally {
  await browser.close()
}
watchdog.stop()
if (looked === 0) {
  console.log('=== BUILDINGS AUDIT ABORTED: nothing was looked at ===')
  process.exit(2)
}
console.log(`  screenshots: ${OUT}`)
console.log(`\n=== BUILDINGS PROBLEMS: ${problems} ===`)
process.exit(problems === 0 ? 0 : 1)
