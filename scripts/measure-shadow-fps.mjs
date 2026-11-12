/*
 * THE SHADOWS WHILE THE TIME BAR IS SCRUBBED, ON A MID ANDROID (Batch Polish
 * 2, Section 3).
 *
 * Usage:  node scripts/measure-shadow-fps.mjs <dist> [--out measurements/<date>-shadow-fps.md]
 *
 * Serves <dist> with the gate's own server and fixture proxy (nothing live).
 * Chromium as a Pixel 7 (412 x 915), its CPU slowed 4x through the DevTools
 * protocol: Lighthouse's stand-in for a mid-range Android phone. The plan at
 * the Virginia Beach oceanfront by the pier (its recorded tiles' buildings), sun
 * and shadows on, zoom 16.5; then the ruler dragged sideways by a finger for
 * four seconds, and every frame the page drew counted. The shadows are
 * repainted for each new minute under the needle (src/lib/shadowRaster.ts),
 * each paint timed.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { chromium, devices } from './gate/playwright.mjs'
import { findChrome, goToStage } from './preflight.mjs'
import { shareLink } from '../src/lib/planShare.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'
import { placeKey } from '../src/core/venueName.ts'

const DIST = process.argv[2]
if (!DIST) {
  console.log('usage: node scripts/measure-shadow-fps.mjs <dist> [--out file]')
  process.exit(2)
}
const outAt = process.argv.indexOf('--out')
const OUT = outAt > 0 ? process.argv[outAt + 1] : `measurements/${new Date().toISOString().slice(0, 10)}-shadow-fps.md`
const PORT = 5390
const THROTTLE = Number(process.env.SCOUTNGO_THROTTLE ?? 4)
/* The Virginia Beach oceanfront by the pier: hotels, many buildings with heights in the recorded tiles. */
const COLISEUM = { lat: 36.8435575, lon: -75.9713104 }
const server = spawn(process.execPath, ['scripts/gate/server.mjs'], { env: { ...process.env, SCOUTNGO_GATE_DIST: DIST, SCOUTNGO_GATE_APP_PORT: String(PORT), SCOUTNGO_GATE_PROXY_PORT: String(PORT + 1) }, stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 2500))
const APP = `http://127.0.0.1:${PORT}`
const venue = { ...CALIBRATION_VENUE, name: { key: placeKey(String(COLISEUM.lat), String(COLISEUM.lon)), name: 'Virginia Beach Fishing Pier' }, latitude: String(COLISEUM.lat), longitude: String(COLISEUM.lon), date: '2026-10-29', startTime: '15:00', endTime: '17:00' }
const url = new URL(await shareLink(`${APP}/`, { id: 'sf', name: 'Shadow fps', savedAt: '2026-10-29T00:00:00Z', venue, kit: { bodyIds: [], lensIds: [], droneIds: [], styleNotes: '' }, positions: [] }))
url.searchParams.set('probe', '1')

const browser = await chromium.launch({ executablePath: findChrome(), proxy: { server: `http://127.0.0.1:${PORT + 1}`, bypass: '127.0.0.1' } })
const lines = []
let result = null
try {
  const ctx = await browser.newContext({ ...devices['Pixel 7'], viewport: { width: 412, height: 915 }, serviceWorkers: 'block', ignoreHTTPSErrors: true })
  const page = await ctx.newPage()
  const wait = (ms) => page.waitForTimeout(ms)
  const ev = (x) => page.evaluate(x)
  await page.clock.install({ time: new Date('2026-10-29T19:00:00Z') })
  await page.clock.resume()
  await page.goto(url.href)
  await wait(3500)
  await page.getByRole('button', { name: /^open$/i }).click({ timeout: 4000 }).catch(() => {})
  await page.getByText('Open the map', { exact: true }).click({ timeout: 4000 }).catch(() => {})
  await goToStage(ev, wait, 'plan')
  await wait(4000)
  await ev(`window.__probe?.map?.jumpTo({ center: [${COLISEUM.lon}, ${COLISEUM.lat}], zoom: ${Number(process.env.SCOUTNGO_ZOOM ?? 16.5)} })`)
  for (let i = 0; i < 30; i += 1) {
    if (await ev(`(window.__shadowPaints ?? []).length > 0`)) break
    await wait(500)
  }
  const before = await ev(`({ drawn: window.__shadowPaint?.drawn ?? null, paints: (window.__shadowPaints ?? []).length })`)
  console.log('  before the scrub: ' + JSON.stringify({ ...before, zoom: await ev(`window.__probe?.map?.getZoom()`), layer: await ev(`window.__probe?.map?.getLayoutProperty('shadow-fill', 'visibility') ?? null`), note: await ev(`document.querySelector('.shadowkey')?.textContent ?? null`) }))
  /* SCOUTNGO_SHOT: a picture of the shadows before the scrub, for the eye. */
  if (process.env.SCOUTNGO_SHOT) {
    await wait(3000)
    await page.screenshot({ path: process.env.SCOUTNGO_SHOT })
    const url = await ev(`window.__shadowCanvas?.toDataURL('image/png') ?? null`)
    if (url !== null) (await import('node:fs')).writeFileSync(process.env.SCOUTNGO_SHOT.replace(/\.png$/, '-canvas.png'), Buffer.from(url.split(',')[1], 'base64'))
    console.log('  canvas: ' + (await ev(`window.__shadowCanvas ? window.__shadowCanvas.width + ' x ' + window.__shadowCanvas.height : null`)))
  }
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE })
  const box = await ev(`(() => { const r = document.querySelector('.tbar__strip')?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width } : null })()`)
  if (box === null) throw new Error('no ruler on screen')
  await ev(`(() => { window.__frames = []; window.__shadowPaints = []; const f = (t) => { window.__frames.push(t); if (window.__frames.length < 2000) requestAnimationFrame(f) }; requestAnimationFrame(f); return 1 })()`)
  const t0 = Date.now()
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x, y: box.y, id: 0 }] })
  /* Four seconds, a finger moving 2 px every 16 ms: a slow scrub across the bar and back. */
  for (let i = 1; Date.now() - t0 < 4000; i += 1) {
    const dx = Math.sin((i / 250) * Math.PI * 2) * box.w * 0.35
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + dx, y: box.y, id: 0 }] })
    await wait(16)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  const m = await ev(`(() => {
    const f = window.__frames
    const gaps = f.slice(1).map((t, i) => t - f[i]).sort((a, b) => a - b)
    const span = f[f.length - 1] - f[0]
    const p = (q) => gaps[Math.min(gaps.length - 1, Math.floor(q * gaps.length))]
    const paints = (window.__shadowPaints ?? []).slice().sort((a, b) => a - b)
    return { frames: f.length, seconds: span / 1000, fps: (f.length - 1) / (span / 1000), p50: p(0.5), p95: p(0.95), worst: gaps[gaps.length - 1], paints: paints.length, paintP50: paints[Math.floor(paints.length / 2)] ?? null, paintP95: paints[Math.floor(paints.length * 0.95)] ?? null }
  })()`)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  result = { ...m, drawn: before.drawn }
} finally {
  await browser.close()
  server.kill()
}

const r = (x) => (x === null ? '—' : x.toFixed(1))
lines.push('# The shadows while the time bar is scrubbed', '')
lines.push(`Run ${new Date().toISOString()} · \`node scripts/measure-shadow-fps.mjs ${DIST}\` · Chromium (Pixel 7) 412 x 915, CPU slowed ${THROTTLE}x (a mid-range Android stand-in) · the Virginia Beach oceanfront at zoom 16.5, page clock 2026-10-29T19:00:00Z · the gate's server and fixture proxy, nothing live.`, '')
lines.push(`- building shadows painted: ${result.drawn ?? 'not reported by this build (before the painted shadows, its shadows were map polygons)'}`)
lines.push(`- frames while scrubbing: ${result.frames} in ${r(result.seconds)} s, ${r(result.fps)} fps`)
lines.push(`- frame time: median ${r(result.p50)} ms, 95th percentile ${r(result.p95)} ms, worst ${r(result.worst)} ms`)
lines.push(result.drawn === null ? '- shadow repaints: not reported by this build' : `- shadow repaints: ${result.paints}, each median ${r(result.paintP50)} ms, 95th percentile ${r(result.paintP95)} ms`)
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, lines.join('\n') + '\n')
console.log(lines.join('\n'))
