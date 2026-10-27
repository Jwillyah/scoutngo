/*
 * THE 3D VIEW'S LIGHT AT DAWN AND DUSK, AND WHAT SHOWS WHILE IT LOADS.
 *
 * Usage:  node scripts/measure-3d-light.mjs [--shots <dir>]   (app on :5173, Chrome on :9222)
 * Writes: measurements/<today>-3d-light.md
 * Exits:  0 pass; 1 not; 2 could not look.
 *
 * WHY. On a phone at Virginia Beach Fishing Pier at 7:11 AM on 27 Oct the
 * 3D view was pitch dark: the sun was still below the horizon and the light
 * the scene is drawn with went down with it. And while 3D loaded the screen
 * showed blank frames before the ground arrived.
 *
 * WHAT IT DOES. On a 390 x 844 phone screen at the pier, with nothing saved
 * on the phone (local storage and the tile cache emptied), opens 3D with the
 * time bar at 7:11 AM, and from the tap until the model is shown takes a
 * screenshot every few hundred milliseconds. Then sets the time to 06:30,
 * 07:11, 12:00, 17:45 and 18:30 local and screenshots each once the tiles
 * have settled. Every number is read from the part of the screen between
 * the top bar and the legend.
 *
 *   brightness  mean luminance (Rec. 709, 0 to 255). Limit: every time at
 *               least READABLE x noon's, so dawn and dusk read like day,
 *               shadows aside.
 *   blank frame a frame with no detail in it: texture (the mean luminance
 *               step between neighbouring pixels) under BLANK_TEXTURE. One
 *               flat colour where a map should be, black, grey, the engine's
 *               white sky or blue globe alike. Read off the frames of the
 *               first run, before the fix: blank frames 0.01 to 0.03, every
 *               frame with a map or model in it 0.55 or more. Limit: none,
 *               from the tap to the model being shown and a second after.
 *   builds      how many times the 3D engine was built. Limit: 1. The first
 *               run showed the whole load, white sky included, twice.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { connect } from './cdp.mjs'
import { ensureApp, ensureBrowser, goToStage, guardAudit, startWatchdog } from './preflight.mjs'
import { shareLink } from '../src/lib/planShare.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'

guardAudit('3d light')
const watchdog = startWatchdog('3d light', 600_000)
const shotsAt = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null
if (shotsAt !== null) mkdirSync(shotsAt, { recursive: true })

const PIER = { lat: 36.8435575, lon: -75.9713104 }
const DAY = '2026-10-27'
/* Eastern Daylight Time on 27 Oct 2026 (it ends 1 Nov): UTC-4. */
const local = (hhmm) => new Date(`${DAY}T${hhmm}:00-04:00`)
const TIMES = ['06:30', '07:11', '12:00', '17:45', '18:30']
const READABLE = 0.6
const BLANK_TEXTURE = 0.3
/* Between the top bar and the legend on a 390 x 844 screen, left of the map buttons. */
const CLIP = { x: 0, y: 130, width: 320, height: 300 }

const venue = { ...CALIBRATION_VENUE, name: null, latitude: String(PIER.lat), longitude: String(PIER.lon), date: DAY, startTime: '07:11', endTime: '08:30' }
const link = await shareLink('http://127.0.0.1:5173/', { id: 'vb', name: 'Virginia Beach Fishing Pier', savedAt: '2026-10-27T00:00:00Z', venue, kit: { bodyIds: [], lensIds: [], droneIds: [], styleNotes: '' }, positions: [] })

function png(buf) {
  let off = 8, w = 0, h = 0, ct = 0
  const idat = []
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString('latin1', off + 4, off + 8), data = buf.subarray(off + 8, off + 8 + len)
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9] }
    if (type === 'IDAT') idat.push(data)
    off += 12 + len
  }
  const bpp = ct === 6 ? 4 : 3
  const raw = inflateSync(Buffer.concat(idat)), out = Buffer.alloc(w * h * bpp), stride = w * bpp
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0, b = y > 0 ? out[(y - 1) * stride + x] : 0, c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f]
      out[y * stride + x] = (line[x] + pred) & 255
    }
  }
  return { w, h, bpp, out }
}

function stats(buf) {
  const { w, h, bpp, out } = png(buf)
  const L = (i) => 0.2126 * out[i * bpp] + 0.7152 * out[i * bpp + 1] + 0.0722 * out[i * bpp + 2]
  let sum = 0, step = 0
  const n = w * h
  for (let i = 0; i < n; i++) {
    sum += L(i)
    if (i % w !== w - 1) step += Math.abs(L(i + 1) - L(i))
  }
  return { mean: sum / n, texture: step / (n - h) }
}

const app = await ensureApp()
const browser = await ensureBrowser()
const { send, ev, wait, dispose } = await connect()
const shot = async (clip = CLIP) => {
  const r = await send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 } })
  return Buffer.from(r.result?.data ?? r.data, 'base64')
}

const frames = []
const lit = []
let shownAt = null
let state = null
let builds = null
let shownBy = null
try {
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/' })
  await wait(2500)
  /* A first open: nothing saved, the tile cache empty. A run that read saved tiles hid a 3D view that never drew at all. */
  await ev(`(async () => { localStorage.clear(); localStorage.setItem('scoutngo.landing.v1','true'); await caches.delete('scoutngo-tiles-v1'); return 1 })()`)
  await send('Page.navigate', { url: 'about:blank' })
  await wait(500)
  await send('Page.navigate', { url: link.replace('/#plan=', '/?probe=1#plan=') })
  let opened = false
  for (let i = 0; i < 30 && !opened; i += 1) {
    await wait(500)
    opened = await ev(`(() => { const b = document.querySelector('.confirm__yes'); if (!b) return false; b.click(); return true })()`)
  }
  if (!opened) throw new Error('the shared plan for the pier was not offered')
  await wait(2000)
  await goToStage(ev, wait, 'plan')
  /* The 2D map settles first: it is what should show until 3D is ready. */
  await wait(6000)
  const before = stats(await shot())
  if (shotsAt !== null) writeFileSync(`${shotsAt}/light-2d-before.png`, await shot({ x: 0, y: 0, width: 390, height: 844 }))

  const pressed = await ev(`(() => { const b = document.querySelector('button[aria-label="Open the 3D clay model"]'); if (!b) return false; b.click(); return true })()`)
  if (!pressed) throw new Error('no 3D button')
  const tapped = Date.now()
  /* Shown: the view says so (clay--shown), or, on a build without that, the engine's tiles have all loaded. */
  const shownNow = `(() => { const c = document.querySelector('.clay'); if (!c) return false; if (c.classList.contains('clay--shown')) return true; const s = window.__clay?.widget.scene; return !document.querySelector('.clay--waiting') && s !== undefined && s.globe.tilesLoaded })()`
  while (Date.now() - tapped < 90_000) {
    const f = stats(await shot())
    frames.push({ ms: Date.now() - tapped, ...f })
    if (shotsAt !== null && frames.length <= 40) writeFileSync(`${shotsAt}/light-load-${String(frames.length).padStart(2, '0')}.png`, await shot({ x: 0, y: 0, width: 390, height: 844 }))
    if (await ev(shownNow)) {
      shownAt = Date.now() - tapped
      break
    }
    await wait(150)
  }
  /* A few frames past being shown: the swap itself must not flash either. */
  for (let i = 0; i < 6; i += 1) {
    await wait(150)
    frames.push({ ms: Date.now() - tapped, ...stats(await shot()) })
  }
  state = await ev(`document.querySelector('.clay')?.className ?? null`)

  for (const t of TIMES) {
    await ev(`(async () => {
      const clay = window.__clay
      clay.setTime(new Date(${local(t).getTime()}))
      const scene = clay.widget.scene
      for (let i = 0; i < 160 && !scene.globe.tilesLoaded; i++) await new Promise((r) => setTimeout(r, 250))
      scene.requestRender()
      await new Promise((r) => setTimeout(r, 2500))
      return true
    })()`)
    const s = stats(await shot())
    const sun = JSON.parse(await ev(`JSON.stringify(window.__clay?.sunNow?.() ?? null)`))
    lit.push({ time: t, ...s, sun })
    if (shotsAt !== null) writeFileSync(`${shotsAt}/light-${t.replace(':', '')}.png`, await shot({ x: 0, y: 0, width: 390, height: 844 }))
  }
  builds = await ev(`window.__clayBuilds ?? null`)
  shownBy = JSON.parse(await ev(`JSON.stringify(window.__clayShown ?? null)`))
  frames.unshift({ ms: 0, before: true, ...before })
} catch (error) {
  console.log(`=== 3D LIGHT ABORTED: ${error instanceof Error ? error.message : String(error)} ===`)
  watchdog.stop()
  await dispose()
  await browser.stop()
  await app.stop()
  process.exit(2)
}
watchdog.stop()
await dispose()
await browser.stop()
await app.stop()

const noon = lit.find((r) => r.time === '12:00')?.mean ?? NaN
const loading = frames.filter((f) => !f.before)
const blank = loading.filter((f) => f.texture < BLANK_TEXTURE)
const dark = lit.filter((r) => !(r.mean >= READABLE * noon))
const pass = shownAt !== null && shownBy?.by === 'tiles' && blank.length === 0 && dark.length === 0 && builds === 1
const f1 = (n) => n.toFixed(1)
const out = [
  "# The 3D view's light at dawn and dusk, and what shows while it loads",
  '',
  `Run: ${new Date().toISOString()} · node scripts/measure-3d-light.mjs · Virginia Beach Fishing Pier ${PIER.lat}, ${PIER.lon} · ${DAY}, EDT · screen 390 x 844 · read from x ${CLIP.x}..${CLIP.x + CLIP.width}, y ${CLIP.y}..${CLIP.y + CLIP.height}`,
  `Limits: each time's mean luminance at least ${READABLE} x noon's; no frame with texture under ${BLANK_TEXTURE} (one flat colour) from tapping 3D until a second after the model is shown; the engine built once.`,
  '',
  '## Brightness by time',
  '',
  '| local time | sun altitude (deg) | mean luminance (0 to 255) | texture | share of noon | readable |',
  '|---|---|---|---|---|---|',
  ...lit.map((r) => `| ${r.time} | ${r.sun === null ? 'not reported' : f1(r.sun.altitude)} | ${f1(r.mean)} | ${r.texture.toFixed(2)} | ${(r.mean / noon).toFixed(2)} | ${r.mean >= READABLE * noon ? 'yes' : 'NO'} |`),
  '',
  '## From the tap to the model being shown',
  '',
  `Shown ${shownAt === null ? 'NEVER, within 90 s' : `${(shownAt / 1000).toFixed(1)} s after the tap`}. The view's classes when shown: ${state ?? 'none'}. Released by ${shownBy === null ? 'nothing reported' : `${shownBy.by === 'tiles' ? 'its tiles arriving' : 'the time limit'}, ${(shownBy.ms / 1000).toFixed(1)} s after the engine was built`}.`,
  `Engine built ${builds ?? 'an unknown number of'} time(s). ${loading.length} frames read. Blank frames (texture under ${BLANK_TEXTURE}): ${blank.length}${blank.length === 0 ? '' : `, at ${blank.map((f) => `${f.ms} ms (mean ${f1(f.mean)})`).join(', ')}`}.`,
  '',
  '| ms after tap | mean luminance | texture |',
  '|---|---|---|',
  ...frames.map((f) => `| ${f.before ? '2D map before the tap' : f.ms} | ${f1(f.mean)} | ${f.texture.toFixed(2)} |`),
  '',
  `**${pass ? 'Pass' : 'Fail'}.**`,
  '',
]
const file = `measurements/${new Date().toISOString().slice(0, 10)}-3d-light.md`
writeFileSync(file, out.join('\n'))
console.log(out.join('\n'))
console.log(`wrote ${file}`)
process.exit(pass ? 0 : 1)
