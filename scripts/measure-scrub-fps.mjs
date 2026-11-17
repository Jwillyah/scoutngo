/*
 * THE TIMELINE BAR'S SCRUB, FRAMES A SECOND (Batch DRONE, Section 3: "60 fps,
 * with no layer refetch while dragging").
 *
 * Usage:  node scripts/measure-scrub-fps.mjs <url> [--layer wind|clouds|tide] [--out file] [--throttle 4] [--engine chromium|webkit]
 *
 *   <url>   the app, served built (the gate's dist on :5180 behind its
 *           fixture proxy, or any server of dist/). ?probe=1 is added, which
 *           arms the bar's frame counter in a production build
 *           (src/components/LayerTimeline.tsx, window.__scrub).
 *
 * --engine webkit (Batch FIX, Section 5.4: "on a real frame clock, WebKit, not
 * headless Chrome"): WebKit as an iPhone 13 (390 x 844), headed off, no CPU
 * throttle (WebKit has no DevTools protocol for it: the run says so). Else
 * Chromium as a Pixel 7 (412 x 915), the CPU slowed --throttle times through
 * the DevTools protocol (4x: Lighthouse's mid-range Android). Opens the map,
 * turns the layer on from Features, waits for the bar, then a finger drags
 * the thumb across the day strip and back for 3 seconds. Counted:
 *
 *   frames   the bar's own count of frames drawn while the finger was down
 *            (window.__scrub.frames, one per requestAnimationFrame)
 *   worst    the longest gap between two of those frames, ms
 *   asks     every request the page sent during the drag, by host: the
 *            layer must not ask again while the thumb moves
 *
 * Writes measurements/<ISO-date>-scrub-fps.md with the run's parameters.
 * Exits 2 when it could not look (no bar, or no frame counted: shape B in
 * docs/failure-modes.md), 1 when the drag asked the network, 0 otherwise.
 * The fps is reported, not judged: the number is the measurement.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { chromium, devices, webkit } from './gate/playwright.mjs'
import { findChrome, goToStage } from './preflight.mjs'

const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`)
  return at > 0 ? process.argv[at + 1] : fallback
}
const URL_ARG = process.argv[2]
if (!URL_ARG || URL_ARG.startsWith('--')) {
  console.log('usage: node scripts/measure-scrub-fps.mjs <url> [--layer wind|clouds|tide] [--out file] [--throttle 4]')
  process.exit(2)
}
const LAYER = arg('layer', 'wind')
const ENGINE = arg('engine', 'chromium')
const WEBKIT = ENGINE === 'webkit'
const THROTTLE = Number(arg('throttle', '4'))
const DRAG_MS = 3000
const DATE = new Date().toISOString().slice(0, 10)
const OUT = arg('out', `measurements/${DATE}-scrub-fps.md`)
const VIEWPORT = WEBKIT ? { width: 390, height: 844 } : { width: 412, height: 915 }

const url = new URL(URL_ARG)
url.searchParams.set('probe', '1')

const couldNotLook = (why) => {
  console.log(`COULD NOT LOOK: ${why}`)
  process.exit(2)
}

/* SCOUTNGO_PROXY: the gate's fixture proxy (http://127.0.0.1:5181), so the layers have data to draw without a live host. */
const PROXY = process.env.SCOUTNGO_PROXY ?? null
const proxyOpt = PROXY === null ? {} : { proxy: { server: PROXY, bypass: '127.0.0.1' } }
const browser = WEBKIT ? await webkit.launch(proxyOpt) : await chromium.launch({ executablePath: findChrome(), ...proxyOpt })
let result = null
try {
  const ctx = await browser.newContext({ ...devices[WEBKIT ? 'iPhone 13' : 'Pixel 7'], viewport: VIEWPORT, serviceWorkers: 'block', ignoreHTTPSErrors: true })
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('scoutngo.landing.v1', 'true')
      /* A spot (the Virginia Beach Fishing Pier, a public landmark), so the map opens on a place. */
      if (localStorage.getItem('scoutngo.lastSetup.v1') === null)
        localStorage.setItem('scoutngo.lastSetup.v1', JSON.stringify({ at: { lat: 36.8435575, lon: -75.9713104 }, name: { key: 'pier', name: 'Virginia Beach Fishing Pier' }, shootKind: 'sunset', platform: 'both', reachMeters: 2000 }))
    } catch {
      /* about:blank */
    }
  })
  const page = await ctx.newPage()
  const wait = (ms) => page.waitForTimeout(ms)
  const ev = (x) => page.evaluate(x)
  await page.goto(url.href)
  await wait(3500)
  await page.getByRole('button', { name: /^open$/i }).click({ timeout: 4000 }).catch(() => {})
  await goToStage(ev, wait, 'plan')
  await wait(2500)
  await page.locator('.rail2__btn[aria-label="Features"]').first().click({ timeout: 5000 })
  await wait(900)
  await page.locator(`[data-weather="${LAYER}"]`).first().click({ timeout: 5000 })
  await wait(800)
  await page.locator('.card2[aria-label="Map"] .card2__x').first().click({ timeout: 3000 }).catch(() => {})
  /* The bar, with its picture drawn (the layer's data in hand), before any finger. */
  const track = page.locator(`[data-layer-timeline="${LAYER}"] [data-timeline-track]`).first()
  let drawn = 0
  for (let i = 0; i < 40; i += 1) {
    drawn = await ev(`document.querySelectorAll('[data-layer-timeline="${LAYER}"] .ltl__bar, [data-layer-timeline="${LAYER}"] .ltl__water, [data-layer-timeline="${LAYER}"] .ltl__pct').length`)
    if (drawn > 0) break
    await wait(500)
  }
  const box = await track.boundingBox().catch(() => null)
  if (box === null) couldNotLook(`no ${LAYER} timeline bar on the page`)
  if (drawn === 0) couldNotLook(`the ${LAYER} bar drew nothing in 20 s`)
  await wait(2000)

  const cdp = WEBKIT ? null : await ctx.newCDPSession(page)
  await cdp?.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE })

  /* Every request from the finger down to the finger up. */
  const asks = []
  let dragging = false
  page.on('request', (rq) => {
    if (dragging) asks.push(new URL(rq.url()).host)
    if (dragging && process.env.SCRUB_URLS === '1') console.log('asked during the drag:', rq.url().slice(0, 160))
  })
  const before = JSON.parse(await ev(`JSON.stringify(window.__scrub ?? { frames: 0, drags: 0, worstMs: 0 })`))
  const y = box.y + box.height / 2
  const left = box.x + 8
  const right = box.x + box.width - 8
  dragging = true
  const t0 = Date.now()
  await page.mouse.move(left, y)
  await page.mouse.down()
  /* Across and back, a step every 16 ms, for DRAG_MS. */
  let k = 0
  while (Date.now() - t0 < DRAG_MS) {
    const phase = ((Date.now() - t0) / 1500) % 2
    const f = phase < 1 ? phase : 2 - phase
    await page.mouse.move(left + (right - left) * f, y)
    k += 1
    await wait(16)
  }
  const held = Date.now() - t0
  await page.mouse.up()
  dragging = false
  const after = JSON.parse(await ev(`JSON.stringify(window.__scrub ?? { frames: 0, drags: 0, worstMs: 0 })`))
  await cdp?.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  const frames = after.frames - before.frames
  if (frames <= 0) couldNotLook('the bar counted no frames during the drag (window.__scrub absent: was ?probe=1 dropped?)')
  const byHost = {}
  for (const h of asks) byHost[h] = (byHost[h] ?? 0) + 1
  result = { frames, heldMs: held, fps: (frames * 1000) / held, worstMs: after.worstMs, moves: k, asks: asks.length, byHost, flag: await ev(`document.querySelector('[data-time-flag]')?.textContent ?? null`) }
  console.log(JSON.stringify(result))
} finally {
  await browser.close()
}

const lines = [
  `# The timeline bar's scrub, frames a second (${DATE})`,
  '',
  'Written by `scripts/measure-scrub-fps.mjs` (Batch DRONE, Section 3).',
  '',
  '## Parameters',
  '',
  `- url: ${url.href}`,
  `- layer: ${LAYER}`,
  WEBKIT ? `- browser: WebKit, iPhone 13 profile, ${VIEWPORT.width} x ${VIEWPORT.height}` : `- browser: Chromium, Pixel 7 profile, ${VIEWPORT.width} x ${VIEWPORT.height}`,
  WEBKIT ? '- CPU throttle: none (WebKit has no DevTools protocol to slow it)' : `- CPU throttle: ${THROTTLE}x`,
  `- drag: ${result.heldMs} ms across the day strip and back, ${result.moves} finger moves`,
  '',
  '## Result',
  '',
  `- frames drawn while the finger was down: ${result.frames}`,
  `- frames a second: ${result.fps.toFixed(1)}`,
  `- longest gap between two frames: ${Math.round(result.worstMs)} ms`,
  `- requests during the drag: ${result.asks}${result.asks === 0 ? '' : ` (${Object.entries(result.byHost).map(([h, n]) => `${h} ${n}`).join(', ')})`}`,
  `- the flag read at the end: ${result.flag}`,
  '',
]
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, lines.join('\n'))
console.log(`wrote ${OUT}`)
process.exit(result.asks > 0 ? 1 : 0)
