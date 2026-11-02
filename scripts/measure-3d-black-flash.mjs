/*
 * THE BLACK FLASH, SHOWN (Batch I, Section 4).
 *
 * Usage:  node scripts/measure-3d-black-flash.mjs <label>   (dist/ built)
 * Writes: measurements/<today>-3d-black-flash-<label>.md
 *
 * The 3D view up and still at the Virginia Beach pier, WebKit. First, how
 * often the adaptive resolution changes the pixel ratio over 20 s with no
 * hand on it (each change resizes, and so clears, the canvas). Then what the
 * old code did after a slow frame: the pixel ratio changed with no frame
 * after it, and the canvas's mean luminance 300 ms later and after the next
 * frame is asked for. What desktop WebKit shows is not a phone: the water
 * redraws the scene 30 times a second here, so a cleared canvas is painted
 * over within a frame; idle on a phone it draws 10 a second.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { webkit, devices } from 'playwright'
import { goToStage } from './preflight.mjs'
import { decodePng } from '../src/lib/png.ts'
import { shareLink } from '../src/lib/planShare.ts'
import { placeKey } from '../src/core/venueName.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'

const label = process.argv[2] ?? 'now'
const PORT = 5202
const server = spawn(process.execPath, ['scripts/gate/server.mjs'], { env: { ...process.env, SCOUTNGO_GATE_DIST: 'dist', SCOUTNGO_GATE_APP_PORT: String(PORT), SCOUTNGO_GATE_PROXY_PORT: String(PORT + 1) }, stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 2500))
const APP = `http://127.0.0.1:${PORT}`
const PIER = { lat: 36.8435575, lon: -75.9713104 }
const browser = await webkit.launch({ proxy: { server: `http://127.0.0.1:${PORT + 1}`, bypass: '127.0.0.1' } })
const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, serviceWorkers: 'block', ignoreHTTPSErrors: true })
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('scoutngo.landing.v1', 'true')
  } catch {
    /* about:blank */
  }
})
const page = await ctx.newPage()
await page.clock.install({ time: new Date('2026-11-01T15:07:00Z') })
await page.clock.resume()
const wait = (ms) => page.waitForTimeout(ms)
const ev = (x) => page.evaluate(x)
const venue = { ...CALIBRATION_VENUE, name: { key: placeKey(String(PIER.lat), String(PIER.lon)), name: 'Virginia Beach Fishing Pier' }, latitude: String(PIER.lat), longitude: String(PIER.lon), date: '2026-11-01', startTime: '09:00', endTime: '12:00' }
await page.goto(await shareLink(`${APP}/`, { id: 'bf', name: 'Flash', savedAt: '2026-10-31T00:00:00Z', venue, kit: { bodyIds: [], lensIds: [], droneIds: [], styleNotes: '' }, positions: [] }))
await wait(3000)
await page.getByRole('button', { name: /^open$/i }).click({ timeout: 3000 }).catch(() => {})
await goToStage(ev, wait, 'plan')
await wait(1500)
await ev(`document.querySelector('button[aria-label="Open the 3D clay model"]')?.click()`)
for (let i = 0; i < 40 && !(await ev(`!!window.__clay && !!document.querySelector('.clay--shown')`)); i += 1) await wait(1000)
await wait(4000)
const luma = async () => {
  const box = await page.locator('.clay__canvas canvas').first().boundingBox()
  const png = await page.screenshot({ clip: { x: box.x, y: box.y + box.height * 0.2, width: box.width, height: box.height * 0.5 } })
  const px = await decodePng(new Uint8Array(png))
  let sum = 0
  for (let i = 0; i < px.data.length; i += 4) sum += 0.2126 * px.data[i] + 0.7152 * px.data[i + 1] + 0.0722 * px.data[i + 2]
  return sum / (px.data.length / 4)
}
/* How often the ratio changes at rest, polled every 100 ms for 20 s. */
const seen = []
for (let i = 0; i < 200; i += 1) {
  seen.push(await ev(`window.__clay.renderer.getPixelRatio()`))
  await wait(100)
}
const changes = seen.filter((r, i) => i > 0 && Math.abs(r - seen[i - 1]) > 1e-6).length
const a = await luma()
const ratio = await ev(`window.__clay.renderer.getPixelRatio()`)
await ev(`window.__clay.renderer.setPixelRatio(${'window.__clay.renderer.getPixelRatio()'} - 0.1)`)
await wait(300)
const b = await luma()
await ev(`window.__clay.setTime(new Date('2026-11-01T15:08:00Z'))`)
await wait(800)
const c = await luma()
await browser.close()
server.kill()
const ran = new Date().toISOString()
const lines = [
  '# The 3D view\'s black flash, shown',
  '',
  `Run ${ran} · node scripts/measure-3d-black-flash.mjs ${label} · WebKit iPhone 13 390 x 844 · VB pier 3D view still · the gate's fixtures.`,
  '',
  '| Moment | Mean luminance of the canvas (0-255) |',
  '|---|---|',
  `| Up and still, pixel ratio ${ratio} | ${a.toFixed(1)} |`,
  `| 300 ms after the pixel ratio dropped by 0.1, no frame asked for (what the old code did after a slow frame) | ${b.toFixed(1)} |`,
  `| After the next frame is asked for | ${c.toFixed(1)} |`,
  '',
  `Pixel ratio changes at rest over 20 s (${label}): ${changes} (from ${seen[0].toFixed(1)} to ${seen[seen.length - 1].toFixed(1)}; the device's own ratio is 3, capped at 2).`,
  '',
]
mkdirSync('measurements', { recursive: true })
const file = `measurements/${ran.slice(0, 10)}-3d-black-flash-${label}.md`
writeFileSync(file, lines.join('\n'))
console.log(lines.join('\n'))
process.exit(0)
